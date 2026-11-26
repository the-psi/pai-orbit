'use strict';
// Decisions made on the status page. The page only records them; the factory re-checks who made
// each one, acts, and writes it on the ticket so the ticket stays the complete record.

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeRig } = require('./helpers');
const { fromObject } = require('../src/config');
const { createUiServer } = require('../src/ui/server');

const GATED = { gates: { requirements: true, design: false } };
const QUESTION = { result: { status: 'needs_input', summary: 'Stopped.', questions: [{ question: 'Which rate?', why: 'It sets the tax.', options: ['19%', '20%'] }] } };

/** Start the status page for a rig, with one password per person. */
function page(t, rig, users, password) {
  const server = createUiServer({ store: rig.store, config: rig.config, users: new Map(Object.entries(users)), password, now: rig.now });
  t.after(() => server.close());
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      const auth = (name, pass) => ({ authorization: `Basic ${Buffer.from(`${name}:${pass}`).toString('base64')}` });
      resolve({
        get: (p, name, pass) => fetch(base + p, { headers: name ? auth(name, pass) : {} }),
        decide: (id, body, name, pass, extra = {}) => fetch(`${base}/api/tickets/${id}/decision`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-factory-action': 'decide', ...(name ? auth(name, pass) : {}), ...extra },
          body: JSON.stringify(body),
        }),
      });
    });
  });
}

test('requirements gate: approve on the status page', async (t) => {
  const rig = makeRig({ config: GATED });
  t.after(rig.cleanup);
  const ui = await page(t, rig, { po: 'p1', lead: 'p2' }, 'viewer');
  await rig.addTicket('1');
  await rig.factory.runUntilIdle();
  assert.equal(rig.run('1').pending.gate, 'requirements', rig.logs.join('\n'));

  await t.test('the review screen gives the approver the whole document and the agent\'s decisions', async () => {
    const d = await (await ui.get('/api/tickets/1/review', 'po', 'p1')).json();
    assert.equal(d.ask.title, 'Approve the requirements?');
    assert.equal(d.signedInAs, 'po');
    assert.deepEqual(d.permission, { can: true, why: '' });
    assert.equal(d.document.name, 'Requirements');
    assert.match(d.document.text, /groom output \(fake runner\)/);
    assert.match(d.document.path, /requirements\.md$/);
    assert.equal(d.reports[0].stage, 'groom');
    assert.match(d.ticketText, /greeting/);
  });

  await t.test('someone signed in to look only cannot decide, and is told who can', async () => {
    const d = await (await ui.get('/api/tickets/1/review', 'anyone', 'viewer')).json();
    assert.equal(d.permission.can, false);
    assert.match(d.permission.why, /look only/);
    const res = await ui.decide('1', { kind: 'approve' }, 'anyone', 'viewer');
    assert.equal(res.status, 403);
  });

  await t.test('a named person who is not the approver for this stop cannot decide', async () => {
    const d = await (await ui.get('/api/tickets/1/review', 'lead', 'p2')).json();
    assert.equal(d.permission.can, false);
    assert.match(d.permission.why, /This decision is for po/);
    assert.equal((await ui.decide('1', { kind: 'approve' }, 'lead', 'p2')).status, 403);
    await rig.factory.runUntilIdle();
    assert.equal(rig.run('1').pending.gate, 'requirements');
  });

  await t.test('a request that does not come from the page is refused', async () => {
    assert.equal((await ui.decide('1', { kind: 'approve' }, 'po', 'p1', { 'x-factory-action': '' })).status, 403);
    assert.equal((await ui.decide('1', { kind: 'approve' }, 'po', 'p1', { origin: 'https://evil.example' })).status, 403);
    assert.equal((await ui.decide('1', { kind: 'approve' }, 'po', 'wrong')).status, 401);
    await rig.factory.runUntilIdle();
    assert.equal(rig.run('1').pending.gate, 'requirements');
  });

  await t.test('the approver approves: the factory continues and records it on the ticket', async () => {
    const res = await ui.decide('1', { kind: 'approve' }, 'po', 'p1');
    assert.equal(res.status, 202);
    assert.equal(rig.run('1').pending.gate, 'requirements', 'the page only records; the factory acts');
    await rig.factory.runUntilIdle();
    const run = rig.run('1');
    assert.equal(run.pending.gate, 'merge', rig.logs.join('\n'));
    assert.equal(run.approvals.requirements.by, 'po');
    const record = rig.comments('1').find((c) => /Approved\*\* at the requirements stop by po, on the status page/.test(c.body));
    assert.ok(record, 'the decision is written on the ticket');
    assert.equal(record.author, rig.config.board.botUser);
    assert.equal(rig.store.events('1').find((e) => e.type === 'approved' && e.gate === 'requirements').how, 'status page');
  });

  await t.test('code approval is not offered here in a normal setup: it belongs on the pull request', async () => {
    const d = await (await ui.get('/api/tickets/1/review', 'lead', 'p2')).json();
    assert.equal(d.ask.title, 'Approve the code for merge?');
    assert.equal(d.permission.can, false);
    assert.match(d.permission.why, /approved on the pull request itself/);
    assert.ok(d.changes.length > 0, 'the changed files are listed');
    assert.equal((await ui.decide('1', { kind: 'approve' }, 'lead', 'p2')).status, 403);
    await rig.factory.runUntilIdle();
    assert.equal((await rig.codeHost.prStatus(rig.run('1').pr.id)).state, 'open');
  });
});

test('send back on the status page: a reason is required, and the agent redoes the step with it', async (t) => {
  const rig = makeRig({ config: GATED });
  t.after(rig.cleanup);
  const ui = await page(t, rig, { po: 'p1' });
  await rig.addTicket('1');
  await rig.factory.runUntilIdle();

  const empty = await ui.decide('1', { kind: 'reject', text: '   ' }, 'po', 'p1');
  assert.equal(empty.status, 400);
  assert.match((await empty.json()).error, /what should change/);

  assert.equal((await ui.decide('1', { kind: 'reject', text: 'Add the refund scenario.' }, 'po', 'p1')).status, 202);
  await rig.factory.runUntilIdle();
  const run = rig.run('1');
  assert.equal(run.pending.gate, 'requirements', 'back at the same stop after rework');
  assert.equal(run.rework.requirements, 1);
  const regroom = rig.runner.calls.filter((c) => c.stage === 'groom').at(-1);
  assert.match(regroom.prompt, /Add the refund scenario\./);
  assert.ok(rig.comments('1').some((c) => /Sent back\*\* at the requirements stop by po, on the status page/.test(c.body) && /Add the refund scenario/.test(c.body)));
});

test('answer the agent\'s question on the status page', async (t) => {
  let asked = false;
  const rig = makeRig({ handler: (req) => { if (req.stage === 'groom' && !asked) { asked = true; return QUESTION; } return undefined; } });
  t.after(rig.cleanup);
  const ui = await page(t, rig, { alice: 'a1', mallory: 'm1' });
  await rig.addTicket('1', { reporter: 'alice' });
  await rig.factory.runUntilIdle();
  assert.equal(rig.run('1').status, 'waiting_answer');

  const d = await (await ui.get('/api/tickets/1/review', 'alice', 'a1')).json();
  assert.equal(d.ask.kind, 'answer');
  assert.deepEqual(d.questions[0], { question: 'Which rate?', why: 'It sets the tax.', options: ['19%', '20%'] });
  assert.equal(d.permission.can, true);

  assert.equal((await ui.decide('1', { kind: 'answer', text: 'x' }, 'mallory', 'm1')).status, 403, 'only the reporter and named people may answer');
  assert.equal((await ui.decide('1', { kind: 'answer', text: '' }, 'alice', 'a1')).status, 400);
  assert.equal((await ui.decide('1', { kind: 'approve' }, 'alice', 'a1')).status, 400);
  assert.equal((await ui.decide('1', { kind: 'answer', text: 'Use 19%.' }, 'alice', 'a1')).status, 202);
  await rig.factory.runUntilIdle();
  const run = rig.run('1');
  assert.notEqual(run.status, 'waiting_answer', rig.logs.join('\n'));
  assert.match(rig.runner.calls[1].prompt, /Use 19%\./);
  assert.ok(rig.comments('1').some((c) => /Answer from alice\*\*, given on the status page/.test(c.body)));
  assert.match(rig.remoteGit('show', `${run.branch}:${run.featureDir}/decisions-log.md`), /Use 19%\./);
});

test('the factory re-checks a recorded decision and drops one it should not act on', async (t) => {
  const rig = makeRig({ config: GATED });
  t.after(rig.cleanup);
  await rig.addTicket('1');
  await rig.factory.runUntilIdle();
  // Written straight into the inbox, as if the page's own check had been bypassed.
  rig.now.advanceMs(1000);
  rig.store.addDecision('1', { by: 'stranger', kind: 'approve', gate: 'requirements' });
  rig.store.addDecision('1', { by: rig.config.board.botUser, kind: 'approve', gate: 'requirements' });
  rig.store.addDecision('1', { by: 'po', kind: 'approve', gate: 'design' }); // the wrong stop
  await rig.factory.runUntilIdle();
  assert.equal(rig.run('1').pending.gate, 'requirements', 'none of these may move the ticket');
  assert.equal(rig.runner.calls.length, 1);
});

test('a decision recorded for an earlier stop does not carry over to the next one', async (t) => {
  const rig = makeRig({ config: { gates: { requirements: true, design: true } } });
  t.after(rig.cleanup);
  await rig.addTicket('1');
  await rig.factory.runUntilIdle();
  rig.now.advanceMs(1000);
  rig.store.addDecision('1', { by: 'po', kind: 'approve', gate: 'requirements' });
  await rig.factory.runUntilIdle();
  assert.equal(rig.run('1').pending.gate, 'design', rig.logs.join('\n'));
  await rig.factory.runUntilIdle();
  assert.equal(rig.run('1').pending.gate, 'design', 'the requirements approval must not also approve the design');
});

test('single-account trial: code can be approved on the status page', async (t) => {
  const me = 'solo';
  const rig = makeRig({ config: {
    trial: { singleAccount: true }, board: { botUser: me },
    roles: { answer: ['@reporter'], requirementsApprover: [me], designApprover: [me], mergeApprover: [me], releaseApprover: [me], escalation: [me] },
  } });
  t.after(rig.cleanup);
  const ui = await page(t, rig, { [me]: 's1' });
  await rig.addTicket('1', { reporter: me });
  await rig.factory.runUntilIdle();
  assert.equal(rig.run('1').pending.gate, 'merge', rig.logs.join('\n'));
  const d = await (await ui.get('/api/tickets/1/review', me, 's1')).json();
  assert.equal(d.permission.can, true);
  assert.equal((await ui.decide('1', { kind: 'approve' }, me, 's1')).status, 202);
  await rig.factory.runUntilIdle();
  assert.equal(rig.run('1').stage, 'release');
  assert.equal((await rig.codeHost.prStatus(rig.run('1').pr.id)).state, 'merged');
  assert.equal((await ui.decide('1', { kind: 'approve' }, me, 's1')).status, 202);
  await rig.factory.runUntilIdle();
  assert.equal(rig.run('1').status, 'done', rig.logs.join('\n'));
});

test('config sanity for this file', () => {
  assert.equal(fromObject({ repo: { url: 'x' }, roles: { answer: ['@reporter'], mergeApprover: ['a'], releaseApprover: ['b'] } }).ui.enabled, false);
});
