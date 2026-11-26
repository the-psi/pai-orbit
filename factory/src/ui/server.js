'use strict';
// The factory's status page: a board of tickets by stage, one ticket's timeline, the totals, and
// a review screen where a named person approves, sends back, or answers.
//
// Rules this file keeps:
//   - Looking needs a sign-in whenever the page is reachable from another machine.
//   - Deciding (approve, send back, answer) needs a NAMED sign-in. The page only records the
//     decision; the factory checks the person again, acts, and writes it on the ticket, so the
//     ticket stays the complete record.
//   - Code approval in a normal setup stays on the pull request. The page links to it.
//   - Nothing else can be changed from here: no pause, stop, edit or settings.
//   - No credential is ever sent to the browser.

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { GATE_ROLE, inRole, roleNames } = require('../roles');
const { safeId } = require('../state');

const PAGE = fs.readFileSync(path.join(__dirname, 'page.html'), 'utf8');

// Where a ticket sits on the board. A ticket waiting at a gate stays in the column of the work
// that is waiting, with a badge, so the board still reads left to right.
const COLUMNS = ['Groom', 'Design', 'Build', 'Test and review', 'Merge', 'Release', 'Done', 'Returned to people'];
const STAGE_COLUMN = {
  intake: 'Groom', groom: 'Groom', design: 'Design', build: 'Build', test: 'Test and review',
  playwright: 'Test and review', review: 'Test and review', pr: 'Merge', merge: 'Merge',
  release: 'Release', done: 'Done',
};
const GATE_COLUMN = { requirements: 'Groom', design: 'Design', merge: 'Merge', release: 'Release' };

function columnOf(run) {
  if (run.status === 'done') return 'Done';
  if (['declined', 'handed_back', 'taken_over'].includes(run.status)) return 'Returned to people';
  if (run.status === 'waiting_approval' && run.pending) return GATE_COLUMN[run.pending.gate] || STAGE_COLUMN[run.stage] || 'Groom';
  return STAGE_COLUMN[run.stage] || 'Groom';
}

/** The stage the agent is in right now, if a stage has started and not yet ended. */
function activeStage(events) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (e.type === 'stage_end') return null;
    if (e.type === 'stage_start') return { stage: e.stage, since: e.at };
    if (['handed_back', 'declined', 'done', 'taken_over', 'question', 'approval_needed'].includes(e.type)) return null;
  }
  return null;
}

function summarise(run, events, live = []) {
  const working = run.status === 'running' ? activeStage(events) : null;
  const steps = working ? live.filter((s) => s.stage === working.stage) : [];
  let state = 'Queued for the next stage';
  let needsPerson = false;
  if (working) state = `Working: ${working.stage}`;
  else if (run.status === 'waiting_answer') { state = `Waiting for an answer (${run.pending.stage})`; needsPerson = true; }
  else if (run.status === 'waiting_approval') { state = `Waiting for approval: ${run.pending.gate}`; needsPerson = true; }
  else if (run.status === 'done') state = 'Released and closed';
  else if (run.status === 'declined') state = 'Declined by the factory';
  else if (run.status === 'handed_back') state = 'Handed back to people';
  else if (run.status === 'taken_over') state = 'Taken over by a person';
  return {
    id: run.ticketId,
    title: run.title,
    url: run.url || '',
    column: columnOf(run),
    status: run.status,
    stage: run.stage,
    state,
    needsPerson,
    workingSince: working ? working.since : '',
    doingNow: steps.length ? steps[steps.length - 1].text : '',
    doingNowAt: steps.length ? steps[steps.length - 1].at : '',
    steps: steps.length,
    waitingSince: run.pending ? run.pending.since : '',
    waitingFor: run.pending ? (run.pending.kind === 'answer' ? 'answer' : `${run.pending.gate} approval`) : '',
    questions: run.pending && run.pending.questions ? run.pending.questions.map((q) => q.question) : [],
    costUsd: run.costUsd || 0,
    activeMinutes: Math.round((run.activeMs || 0) / 60000),
    startedGroomed: run.groomed === true,
    branch: run.branch || '',
    pr: run.pr ? run.pr.url : '',
    reason: run.handBackReason || run.declineReason || '',
    createdAt: run.createdAt || '',
    updatedAt: run.updatedAt || '',
  };
}

// What each audit event means, in a sentence a person can read.
function describe(e) {
  const stage = e.stage ? ` ${e.stage}` : '';
  switch (e.type) {
    case 'claimed': return 'The factory picked up the ticket';
    case 'groomed_ticket': return `Already groomed: using ${e.requirements}`;
    case 'stage': return `Moved to${stage}`;
    case 'stage_start': return `Agent started${stage}${e.resumed ? ' (continuing the earlier session)' : ''}${e.attempt > 1 ? `, attempt ${e.attempt}` : ''}`;
    case 'stage_end': {
      if (e.problem) return `Agent stopped in${stage}: ${e.problem}${e.detail ? ` (${e.detail})` : ''}`;
      const how = { done: 'finished', needs_input: 'needs an answer', declined: 'declined the ticket', failed: 'could not finish' }[e.status] || e.status;
      return `Agent ${how}${stage}`;
    }
    case 'question': return `Asked ${e.questions ? e.questions.length : ''} question(s) on the ticket`.replace('  ', ' ');
    case 'answered': return `Answered by ${(e.by || []).join(', ')}`;
    case 'approval_needed': return `Waiting for approval: ${e.gate}`;
    case 'approved': return `Approved: ${e.gate}${e.by ? ` by ${e.by}` : ''}`;
    case 'rejected': return `Sent back at ${e.gate}${e.by ? ` by ${[].concat(e.by).join(', ')}` : ''}`;
    case 'rework': return `Rework after ${e.gate}, round ${e.cycle}`;
    case 'fix_attempt': return `Tests failed: back to build, attempt ${e.attempt}`;
    case 'retry': return `Trying${stage} again: ${e.why || ''}`;
    case 'push_retry': return `A push was refused for a moment; trying again (${e.attempt})`;
    case 'pr_opened': return 'Pull request opened';
    case 'merged': return `Merged by ${e.by}`;
    case 'released': return `Released (level ${e.level})`;
    case 'done': return 'Ticket closed';
    case 'declined': return `Declined: ${e.reason || ''}`;
    case 'handed_back': return `Handed back: ${e.reason || ''}`;
    case 'taken_over': return `A person took the ticket: ${e.why || ''}`;
    case 'reminder': return `Reminder sent: waiting for ${e.waitingFor}`;
    case 'escalation': return `Escalated: still waiting for ${e.waitingFor}`;
    case 'blocked': return `Paused by a limit: ${e.reason}`;
    case 'error': return `Problem during ${e.during}: ${e.message}`;
    default: return e.type;
  }
}

const KIND = {
  stage_start: 'work', stage_end: 'work', stage: 'move', claimed: 'move', groomed_ticket: 'move',
  question: 'person', approval_needed: 'person', reminder: 'person', escalation: 'person',
  answered: 'ok', approved: 'ok', merged: 'ok', released: 'ok', done: 'ok', pr_opened: 'ok',
  rejected: 'warn', rework: 'warn', fix_attempt: 'warn', retry: 'warn', push_retry: 'warn', blocked: 'warn',
  declined: 'bad', handed_back: 'bad', error: 'bad', taken_over: 'warn',
};

function timeline(events) {
  return events.map((e) => ({
    at: e.at,
    type: e.type,
    kind: KIND[e.type] || 'move',
    text: describe(e),
    stage: e.stage || '',
    costUsd: typeof e.costUsd === 'number' ? e.costUsd : undefined,
    seconds: typeof e.durationMs === 'number' ? Math.round(e.durationMs / 1000) : undefined,
    summary: e.summary || '',
    assumptions: Array.isArray(e.assumptions) ? e.assumptions : [],
    questions: Array.isArray(e.questions) ? e.questions : [],
  }));
}

// What a person is asked at each stop, in their words, and which document answers it.
const ASK = {
  requirements: { title: 'Approve the requirements?', doc: 'requirements.md', reports: ['groom'] },
  design: { title: 'Approve the design?', doc: 'design.md', reports: ['design'] },
  merge: { title: 'Approve the code for merge?', doc: '', reports: ['build', 'test', 'playwright', 'review'] },
  release: { title: 'Approve the release?', doc: '', reports: [] },
};
const DOCS = [
  ['requirements.md', 'Requirements'], ['design.md', 'Design'], ['test-plan.md', 'Test plan'], ['decisions-log.md', 'Answers so far'],
];
const MAX_DOC = 300000;

/** "asha:secret1,ravi:secret2" -> Map. One password per person, so a decision has a name on it. */
function parseUsers(text) {
  const users = new Map();
  for (const part of String(text || '').split(',')) {
    const i = part.indexOf(':');
    if (i <= 0) continue;
    const name = part.slice(0, i).trim();
    const pass = part.slice(i + 1).trim();
    if (name && pass) users.set(name, pass);
  }
  return users;
}

function same(a, b) {
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());
}

/**
 * @param {{store: object, config: object, password?: string, users?: Map<string, string>, now?: () => Date}} opts
 *   `password` lets anyone look. `users` lets a named person decide.
 * @returns {import('node:http').Server}
 */
function createUiServer(opts) {
  const { store, config } = opts;
  const now = opts.now || (() => new Date());
  const password = opts.password || '';
  const users = opts.users || new Map();
  const single = config.trial && config.trial.singleAccount === true;

  function overview(user) {
    const control = store.control();
    const tickets = store.all().map((run) => {
      const t = summarise(run, store.events(run.ticketId), store.live(run.ticketId));
      t.youCanDecide = permission(run, user).can;
      return t;
    });
    return {
      project: config.project,
      generatedAt: now().toISOString(),
      signedInAs: user,
      paused: control.paused === true,
      spentTodayUsd: store.spentToday(),
      dailyLimitUsd: config.limits.costPerDayUsd,
      ticketLimitUsd: config.limits.costPerTicketUsd,
      concurrency: config.concurrency,
      gates: { requirements: config.gates.requirements === true, design: config.gates.design === true, merge: true, release: true },
      singleAccountTrial: single,
      columns: COLUMNS,
      tickets,
    };
  }

  /** Who is asking. `user` is '' for someone who may only look. */
  function identify(req) {
    const open = !password && users.size === 0;
    const header = String(req.headers.authorization || '');
    if (!header.startsWith('Basic ')) return { ok: open, user: '' };
    const given = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const i = given.indexOf(':');
    const name = i === -1 ? '' : given.slice(0, i);
    const pass = i === -1 ? given : given.slice(i + 1);
    if (users.has(name) && same(pass, users.get(name))) return { ok: true, user: name };
    if (password && same(pass, password)) return { ok: true, user: '' };
    return { ok: open, user: '' };
  }

  /** May this person decide what this ticket is waiting for? The factory checks again before acting. */
  function permission(run, user) {
    const p = run.pending;
    if (!p || !['waiting_answer', 'waiting_approval'].includes(run.status)) return { can: false, why: 'Nothing is waiting for a decision on this ticket.' };
    const role = p.kind === 'answer' ? 'answer' : GATE_ROLE[p.gate];
    const who = roleNames(config, role, run.reporter);
    if (p.kind === 'approval' && p.gate === 'merge' && !single) {
      return { can: false, why: `Code is approved on the pull request itself, with a review from ${who}.` };
    }
    if (!user) return { can: false, signIn: true, why: `You are signed in to look only. To decide, sign in with your own name. This one is for ${who}.` };
    if (!inRole(config, role, user, run.reporter)) return { can: false, why: `This decision is for ${who}. You are signed in as ${user}.` };
    return { can: true, why: '' };
  }

  function workspaceDir(run) {
    return path.join(store.dataDir, 'workspaces', safeId(run.ticketId), 'repo');
  }

  function documents(run) {
    const out = [];
    if (!run.featureDir) return out;
    for (const [file, name] of DOCS) {
      try {
        const full = path.join(workspaceDir(run), run.featureDir, file);
        const text = fs.readFileSync(full, 'utf8');
        out.push({ name, path: `${run.featureDir}/${file}`, text: text.length > MAX_DOC ? `${text.slice(0, MAX_DOC)}\n\n(cut short: the file is very long)` : text });
      } catch { /* not written yet */ }
    }
    return out;
  }

  function changes(run) {
    try {
      const out = execFileSync('git', ['-c', 'safe.directory=*', 'diff', '--numstat', `origin/${config.repo.baseBranch}...HEAD`], {
        cwd: workspaceDir(run), encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'],
      });
      return out.split('\n').filter(Boolean).map((line) => {
        const [added, removed, file] = line.split('\t');
        return { path: file, added: Number(added) || 0, removed: Number(removed) || 0 };
      });
    } catch {
      return [];
    }
  }

  /** Everything a person needs to decide, and nothing else. */
  function review(run, user) {
    const events = store.events(run.ticketId);
    const p = run.pending;
    const docs = documents(run);
    const lastEnd = (stage) => events.filter((e) => e.type === 'stage_end' && e.stage === stage && e.status).pop();
    let ask = null;
    let reports = [];
    let doc = null;
    if (p && p.kind === 'approval') {
      const a = ASK[p.gate] || { title: `Approve ${p.gate}?`, doc: '', reports: [] };
      ask = { kind: 'approval', gate: p.gate, title: a.title, since: p.since };
      reports = a.reports.map(lastEnd).filter(Boolean);
      doc = docs.find((d) => d.path.endsWith(`/${a.doc}`)) || null;
    } else if (p && p.kind === 'answer') {
      ask = { kind: 'answer', stage: p.stage, title: `The agent needs an answer to continue (${p.stage})`, since: p.since };
      reports = [lastEnd(p.stage)].filter(Boolean);
    }
    return {
      ticket: summarise(run, events, store.live(run.ticketId)),
      signedInAs: user,
      ask,
      permission: permission(run, user),
      questions: p && p.questions ? p.questions : [],
      reports: reports.map((e) => ({ stage: e.stage, summary: e.summary || '', assumptions: Array.isArray(e.assumptions) ? e.assumptions : [] })),
      document: doc,
      otherDocuments: docs.filter((d) => d !== doc),
      changes: p && p.kind === 'approval' && p.gate === 'merge' ? changes(run) : [],
      ticketText: run.body || '',
      releaseLevel: config.release.level,
    };
  }

  function send(res, code, type, body) {
    res.writeHead(code, {
      'content-type': type,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'",
    });
    res.end(body);
  }
  const json = (res, code, value) => send(res, code, 'application/json; charset=utf-8', JSON.stringify(value));

  function readBody(req, limit = 20000) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > limit) { reject(new Error('too large')); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  /** A person's decision. Written to the factory's inbox; the factory acts on its next pass. */
  async function decide(req, res, id, user) {
    // A browser sends the saved sign-in to this address even from another site's page, so a
    // decision must also prove it came from this page.
    const origin = req.headers.origin;
    if (req.headers['x-factory-action'] !== 'decide' || (origin && new URL(origin).host !== req.headers.host)) {
      return json(res, 403, { error: 'This request did not come from the status page.' });
    }
    const run = store.load(id);
    if (!run) return json(res, 404, { error: 'No such ticket.' });
    const allowed = permission(run, user);
    if (!allowed.can) return json(res, 403, { error: allowed.why });
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'The request could not be read.' }); }
    const kind = body && body.kind;
    const text = String((body && body.text) || '').trim().slice(0, 8000);
    const p = run.pending;
    if (p.kind === 'answer') {
      if (kind !== 'answer') return json(res, 400, { error: 'This ticket is waiting for an answer.' });
      if (!text) return json(res, 400, { error: 'Write the answer first.' });
      store.addDecision(id, { by: user, kind: 'answer', stage: p.stage, text });
    } else {
      if (!['approve', 'reject'].includes(kind)) return json(res, 400, { error: 'Choose approve or send back.' });
      if (kind === 'reject' && !text) return json(res, 400, { error: 'Say what should change, so the work can be redone.' });
      store.addDecision(id, { by: user, kind, gate: p.gate, text: kind === 'reject' ? text : '' });
    }
    return json(res, 202, { ok: true, message: 'Recorded. The factory acts on it at its next pass, usually within a minute.' });
  }

  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://factory.local');
    if (url.pathname === '/healthz') return send(res, 200, 'text/plain; charset=utf-8', 'ok');
    const who = identify(req);
    if (!who.ok) {
      res.writeHead(401, { 'www-authenticate': 'Basic realm="Agentic Factory", charset="UTF-8"', 'cache-control': 'no-store' });
      return res.end('Sign in to see the factory.');
    }
    // "Sign in with your own name". A browser keeps using the sign-in it already has and offers
    // no way to change it, so this address refuses the view-only sign-in, which makes the browser
    // ask again, and sends a named person back to the page they came from.
    if (url.pathname === '/signin') {
      if (!who.user) {
        res.writeHead(401, { 'www-authenticate': 'Basic realm="Agentic Factory", charset="UTF-8"', 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' });
        return res.end('Sign in with your own name and password to approve, send back or answer. Then reload this page.');
      }
      const back = url.searchParams.get('ticket');
      res.writeHead(302, { location: back ? `/#review=${encodeURIComponent(back)}` : '/', 'cache-control': 'no-store' });
      return res.end();
    }
    const decision = url.pathname.match(/^\/api\/tickets\/([^/]+)\/decision$/);
    if (req.method === 'POST' && decision) {
      return decide(req, res, decodeURIComponent(decision[1]), who.user)
        .catch((err) => json(res, 500, { error: `The decision could not be recorded: ${err.message}` }));
    }
    // Everything else only reads.
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'text/plain; charset=utf-8', 'Not allowed.');
    try {
      if (url.pathname === '/') return send(res, 200, 'text/html; charset=utf-8', PAGE);
      if (url.pathname === '/api/overview') return json(res, 200, overview(who.user));
      const m = url.pathname.match(/^\/api\/tickets\/([^/]+)(\/review)?$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        const run = store.load(id);
        if (!run) return json(res, 404, { error: 'No such ticket' });
        if (m[2]) return json(res, 200, review(run, who.user));
        const events = store.events(id);
        const live = store.live(id);
        const ticket = summarise(run, events, live);
        ticket.youCanDecide = permission(run, who.user).can;
        // Steps of the stage in flight only: once a stage ends, its report in the timeline replaces them.
        const activity = ticket.workingSince ? live.filter((s) => s.stage === ticket.stage) : [];
        return json(res, 200, { ticket, stageCost: run.stageCost || {}, activity, timeline: timeline(events) });
      }
      return send(res, 404, 'text/plain; charset=utf-8', 'Not found');
    } catch (err) {
      return send(res, 500, 'text/plain; charset=utf-8', `The status page could not read the factory's data: ${err.message}`);
    }
  });
}

/**
 * Decide where the page may listen. Anything other than this machine needs a sign-in.
 *   FACTORY_UI_PASSWORD  one shared password: anyone with it may look, nobody may decide.
 *   FACTORY_UI_USERS     "name:password,name2:password2": each person may look, and may decide
 *                        what the config names them for. Use the same names as in `roles`.
 * @returns {{host: string, port: number, password: string, users: Map<string, string>, problem: string}}
 */
function listenPlan(config, env = process.env) {
  const ui = config.ui || {};
  const host = env.FACTORY_UI_HOST || ui.host || '127.0.0.1';
  const port = Number(env.FACTORY_UI_PORT || ui.port || 8080);
  const password = env.FACTORY_UI_PASSWORD || '';
  const users = parseUsers(env.FACTORY_UI_USERS);
  const local = ['127.0.0.1', 'localhost', '::1'].includes(host);
  const problem = !local && !password && users.size === 0
    ? `The status page is set to listen on ${host}, which other machines can reach, but neither FACTORY_UI_PASSWORD nor FACTORY_UI_USERS is set. Set one, or use host 127.0.0.1.`
    : '';
  return { host, port, password, users, problem };
}

module.exports = { createUiServer, listenPlan, parseUsers, summarise, timeline, describe, columnOf, COLUMNS };
