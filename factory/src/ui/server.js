'use strict';
// Read-only status page for the factory: a board of tickets by stage, one ticket's timeline, and
// the totals. It reads the same files the factory writes (state.js) and changes nothing.
//
// Rules this file keeps:
//   - GET only. There is no route that approves, rejects, stops or edits anything. Approvals stay
//     on the ticket, where the record is.
//   - Reachable from another machine only with a password (HTTP Basic). Without one it binds to
//     this machine only.
//   - No credential is ever sent to the browser.

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');

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

function summarise(run, events) {
  const working = run.status === 'running' ? activeStage(events) : null;
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

/**
 * @param {{store: object, config: object, password?: string, now?: () => Date}} opts
 * @returns {import('node:http').Server}
 */
function createUiServer(opts) {
  const { store, config } = opts;
  const now = opts.now || (() => new Date());
  const password = opts.password || '';

  function overview() {
    const control = store.control();
    const tickets = store.all().map((run) => summarise(run, store.events(run.ticketId)));
    return {
      project: config.project,
      generatedAt: now().toISOString(),
      paused: control.paused === true,
      spentTodayUsd: store.spentToday(),
      dailyLimitUsd: config.limits.costPerDayUsd,
      ticketLimitUsd: config.limits.costPerTicketUsd,
      concurrency: config.concurrency,
      gates: { requirements: config.gates.requirements === true, design: config.gates.design === true, merge: true, release: true },
      singleAccountTrial: config.trial && config.trial.singleAccount === true,
      columns: COLUMNS,
      tickets,
    };
  }

  function authorised(req) {
    if (!password) return true;
    const header = String(req.headers.authorization || '');
    if (!header.startsWith('Basic ')) return false;
    const given = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const pass = given.slice(given.indexOf(':') + 1);
    const a = crypto.createHash('sha256').update(pass).digest();
    const b = crypto.createHash('sha256').update(password).digest();
    return crypto.timingSafeEqual(a, b);
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

  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://factory.local');
    if (url.pathname === '/healthz') return send(res, 200, 'text/plain; charset=utf-8', 'ok');
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'text/plain; charset=utf-8', 'This page is read-only.');
    if (!authorised(req)) {
      res.writeHead(401, { 'www-authenticate': 'Basic realm="Agentic Factory", charset="UTF-8"', 'cache-control': 'no-store' });
      return res.end('A password is required.');
    }
    try {
      if (url.pathname === '/') return send(res, 200, 'text/html; charset=utf-8', PAGE);
      if (url.pathname === '/api/overview') return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(overview()));
      const m = url.pathname.match(/^\/api\/tickets\/([^/]+)$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        const run = store.load(id);
        if (!run) return send(res, 404, 'application/json; charset=utf-8', JSON.stringify({ error: 'No such ticket' }));
        const events = store.events(id);
        return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ticket: summarise(run, events), stageCost: run.stageCost || {}, timeline: timeline(events) }));
      }
      return send(res, 404, 'text/plain; charset=utf-8', 'Not found');
    } catch (err) {
      return send(res, 500, 'text/plain; charset=utf-8', `The status page could not read the factory's data: ${err.message}`);
    }
  });
}

/**
 * Decide where the page may listen. Anything other than this machine needs a password.
 * @returns {{host: string, port: number, password: string, problem: string}}
 */
function listenPlan(config, env = process.env) {
  const ui = config.ui || {};
  const host = env.FACTORY_UI_HOST || ui.host || '127.0.0.1';
  const port = Number(env.FACTORY_UI_PORT || ui.port || 8080);
  const password = env.FACTORY_UI_PASSWORD || '';
  const local = ['127.0.0.1', 'localhost', '::1'].includes(host);
  const problem = !local && !password
    ? `The status page is set to listen on ${host}, which other machines can reach, but FACTORY_UI_PASSWORD is not set. Set a password, or use host 127.0.0.1.`
    : '';
  return { host, port, password, problem };
}

module.exports = { createUiServer, listenPlan, summarise, timeline, describe, columnOf, COLUMNS };
