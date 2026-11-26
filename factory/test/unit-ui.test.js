'use strict';
// The status page: read-only, password-protected when reachable from outside, and accurate.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { StateStore } = require('../src/state');
const { fromObject } = require('../src/config');
const { createUiServer, listenPlan, columnOf, describe, summarise } = require('../src/ui/server');

const config = fromObject({
  project: 'demo', repo: { url: 'x' },
  roles: { answer: ['@reporter'], requirementsApprover: ['po'], mergeApprover: ['lead'], releaseApprover: ['rel'] },
  gates: { requirements: true },
});

function rig(t, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-factory-ui-'));
  const store = new StateStore(dir);
  const server = createUiServer({ store, config, password: opts.password });
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      resolve({ store, base, get: (p, init) => fetch(base + p, init) });
    });
  });
}

function seed(store) {
  store.save({ ticketId: '1', title: 'Add bulk discount', url: 'https://example.com/issues/1', status: 'running', stage: 'build', costUsd: 0.4, activeMs: 120000, stageCost: { design: 0.1, build: 0.3 }, branch: 'factory/1-x', groomed: true, createdAt: '2026-11-26T10:00:00.000Z', pr: null, pending: null });
  store.event('1', 'claimed', {});
  store.event('1', 'stage_start', { stage: 'build', attempt: 1 });
  store.save({ ticketId: '2', title: 'Add Germany', url: 'javascript:alert(1)', status: 'waiting_approval', stage: 'groom', costUsd: 0.2, activeMs: 30000, createdAt: '2026-11-26T10:01:00.000Z', pending: { kind: 'approval', gate: 'requirements', since: '2026-11-26T10:05:00.000Z' } });
  store.event('2', 'stage_end', { stage: 'groom', status: 'done', costUsd: 0.2, durationMs: 30000, summary: 'Wrote requirements.', assumptions: [{ decision: 'Rate is 19%', basis: 'ticket text' }] });
  store.event('2', 'approval_needed', { gate: 'requirements' });
  store.save({ ticketId: '3', title: 'Vague', status: 'declined', stage: 'groom', costUsd: 0.09, declineReason: 'Too vague', createdAt: '2026-11-26T10:02:00.000Z', pending: null });
  store.save({ ticketId: '4', title: 'Stuck', status: 'waiting_answer', stage: 'design', costUsd: 0.1, createdAt: '2026-11-26T10:03:00.000Z', pending: { kind: 'answer', stage: 'design', since: '2026-11-26T10:06:00.000Z', questions: [{ question: 'Which rate?', why: 'tax' }] } });
  store.addSpend(0.79);
}

test('the overview lists every ticket with its column, state and totals', async (t) => {
  const r = await rig(t);
  seed(r.store);
  const o = await (await r.get('/api/overview')).json();
  assert.equal(o.project, 'demo');
  assert.equal(o.spentTodayUsd, 0.79);
  assert.equal(o.dailyLimitUsd, 200);
  assert.deepEqual(o.gates, { requirements: true, design: false, merge: true, release: true });
  const by = Object.fromEntries(o.tickets.map((x) => [x.id, x]));
  assert.equal(by['1'].column, 'Build');
  assert.equal(by['1'].state, 'Working: build');
  assert.ok(by['1'].workingSince, 'a started, unfinished stage shows as working now');
  assert.equal(by['1'].startedGroomed, true);
  assert.equal(by['2'].column, 'Groom');
  assert.equal(by['2'].state, 'Waiting for approval: requirements');
  assert.equal(by['2'].needsPerson, true);
  assert.equal(by['3'].column, 'Returned to people');
  assert.equal(by['3'].reason, 'Too vague');
  assert.equal(by['4'].state, 'Waiting for an answer (design)');
  assert.deepEqual(by['4'].questions, ['Which rate?']);
});

test('a ticket page gives a readable timeline with the agent\'s report and its decisions', async (t) => {
  const r = await rig(t);
  seed(r.store);
  const d = await (await r.get('/api/tickets/2')).json();
  assert.equal(d.ticket.id, '2');
  const end = d.timeline.find((e) => e.type === 'stage_end');
  assert.equal(end.text, 'Agent finished groom');
  assert.equal(end.summary, 'Wrote requirements.');
  assert.deepEqual(end.assumptions, [{ decision: 'Rate is 19%', basis: 'ticket text' }]);
  assert.equal(end.seconds, 30);
  assert.equal(d.timeline.at(-1).text, 'Waiting for approval: requirements');
  assert.equal((await r.get('/api/tickets/999')).status, 404);
});

test('the page is read-only: nothing but GET is accepted, and no route changes state', async (t) => {
  const r = await rig(t);
  seed(r.store);
  const before = JSON.stringify(r.store.all());
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const p of ['/', '/api/overview', '/api/tickets/1', '/api/tickets/1/approve', '/api/pause']) {
      const res = await r.get(p, { method, body: method === 'DELETE' ? undefined : '{}' });
      assert.equal(res.status, 405, `${method} ${p}`);
    }
  }
  assert.equal(JSON.stringify(r.store.all()), before);
  assert.equal(r.store.control().paused, false);
});

test('with a password set, nothing is served without it', async (t) => {
  const r = await rig(t, { password: 'open sesame' });
  seed(r.store);
  for (const p of ['/', '/api/overview', '/api/tickets/1']) {
    const res = await r.get(p);
    assert.equal(res.status, 401, p);
    assert.match(res.headers.get('www-authenticate'), /Basic/);
    assert.ok(!(await res.text()).includes('bulk discount'));
  }
  const wrong = await r.get('/api/overview', { headers: { authorization: `Basic ${Buffer.from('me:nope').toString('base64')}` } });
  assert.equal(wrong.status, 401);
  const right = await r.get('/api/overview', { headers: { authorization: `Basic ${Buffer.from('anyone:open sesame').toString('base64')}` } });
  assert.equal(right.status, 200);
  assert.equal((await r.get('/healthz')).status, 200, 'the health check needs no password');
});

test('the page is one self-contained file and loads nothing from elsewhere', async (t) => {
  const r = await rig(t);
  const res = await r.get('/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  const html = await res.text();
  assert.ok(html.includes('Agentic Factory'));
  assert.ok(!/<script[^>]+src=|<link[^>]+href=|https?:\/\/(?!factory\.local)/i.test(html.replace(/\^https\?:\\\/\\\//g, '')), 'no external script, style or address');
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(html), 'ticket text is never inserted as HTML');
});

test('no secret reaches the browser', async (t) => {
  const r = await rig(t);
  seed(r.store);
  const text = JSON.stringify(await (await r.get('/api/overview')).json()) + JSON.stringify(await (await r.get('/api/tickets/1')).json());
  assert.ok(!/token|password|secret|sessionId|sessions/i.test(text), text.slice(0, 200));
});

test('listenPlan: this machine only by default; a password is required to listen more widely', () => {
  assert.deepEqual(listenPlan(config, {}), { host: '127.0.0.1', port: 8080, password: '', problem: '' });
  assert.match(listenPlan(config, { FACTORY_UI_HOST: '0.0.0.0' }).problem, /FACTORY_UI_PASSWORD is not set/);
  const open = listenPlan(config, { FACTORY_UI_HOST: '0.0.0.0', FACTORY_UI_PASSWORD: 'pw', FACTORY_UI_PORT: '9000' });
  assert.equal(open.problem, '');
  assert.equal(open.port, 9000);
});

test('columns and event wording', () => {
  assert.equal(columnOf({ status: 'waiting_approval', stage: 'merge', pending: { gate: 'merge' } }), 'Merge');
  assert.equal(columnOf({ status: 'running', stage: 'review' }), 'Test and review');
  assert.equal(columnOf({ status: 'handed_back', stage: 'build' }), 'Returned to people');
  assert.equal(describe({ type: 'stage_end', stage: 'test', status: 'failed' }), 'Agent could not finish test');
  assert.equal(describe({ type: 'stage_end', stage: 'build', problem: 'timeout', detail: 'no result within 120 minutes' }), 'Agent stopped in build: timeout (no result within 120 minutes)');
  assert.equal(describe({ type: 'approved', gate: 'design', by: 'lead' }), 'Approved: design by lead');
  assert.equal(summarise({ ticketId: '9', status: 'running', stage: 'design' }, []).state, 'Queued for the next stage');
});
