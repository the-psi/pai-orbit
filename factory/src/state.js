'use strict';
// Run state and audit trail on disk (design decision 3).
//
// The board and the ticket branch are the source of truth for what was produced. This store
// holds only what they cannot: session ids, cost, timers, and the append-only audit log.
//
//   <dataDir>/runs/<ticketId>/state.json     current state of one ticket's run
//   <dataDir>/runs/<ticketId>/events.jsonl   audit trail, one JSON object per line
//   <dataDir>/runs/<ticketId>/transcripts/   raw runner output per stage attempt
//   <dataDir>/spend.json                     spend per project per day
//   <dataDir>/control.json                   operator controls (pause, stop requests)

const fs = require('node:fs');
const path = require('node:path');

const ACTIVE = ['running', 'waiting_answer', 'waiting_approval'];
const TERMINAL = ['done', 'declined', 'handed_back', 'taken_over'];

function safeId(id) {
  const safe = String(id).replace(/[^A-Za-z0-9._-]/g, '_');
  // '.', '..' and '' would alias or escape the runs directory.
  return /^\.*$/.test(safe) ? `_${safe}` : safe;
}

class StateStore {
  /** @param {string} dataDir @param {{now?: () => Date}} [opts] */
  constructor(dataDir, opts = {}) {
    this.dataDir = path.resolve(dataDir);
    this.now = opts.now || (() => new Date());
    fs.mkdirSync(path.join(this.dataDir, 'runs'), { recursive: true });
  }

  runDir(ticketId) {
    return path.join(this.dataDir, 'runs', safeId(ticketId));
  }

  transcriptPath(ticketId, stage, attempt) {
    const dir = path.join(this.runDir(ticketId), 'transcripts');
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `${stage}-${String(attempt).padStart(2, '0')}-${Date.now()}.json`);
  }

  _readJson(file, fallback) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return fallback;
    }
  }

  _writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
    fs.renameSync(tmp, file);
  }

  /** @returns {object|null} */
  load(ticketId) {
    return this._readJson(path.join(this.runDir(ticketId), 'state.json'), null);
  }

  save(run) {
    run.updatedAt = this.now().toISOString();
    this._writeJson(path.join(this.runDir(run.ticketId), 'state.json'), run);
    return run;
  }

  /** Every run on disk. */
  all() {
    const dir = path.join(this.dataDir, 'runs');
    const out = [];
    for (const name of fs.readdirSync(dir)) {
      const run = this._readJson(path.join(dir, name, 'state.json'), null);
      if (run) out.push(run);
    }
    return out.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  active() {
    return this.all().filter((r) => ACTIVE.includes(r.status));
  }

  /** Append one audit event (REQ-27). Never rewritten. */
  event(ticketId, type, data = {}) {
    const dir = this.runDir(ticketId);
    fs.mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({ at: this.now().toISOString(), ticketId: String(ticketId), type, ...data });
    fs.appendFileSync(path.join(dir, 'events.jsonl'), `${line}\n`);
  }

  events(ticketId) {
    try {
      return fs.readFileSync(path.join(this.runDir(ticketId), 'events.jsonl'), 'utf8')
        .split('\n').filter(Boolean).map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  }

  // ---- spend per day (REQ-44) ----

  dayKey(date = this.now()) {
    return date.toISOString().slice(0, 10);
  }

  spentToday() {
    const spend = this._readJson(path.join(this.dataDir, 'spend.json'), {});
    return Number(spend[this.dayKey()] || 0);
  }

  addSpend(usd) {
    if (!(usd > 0)) return;
    const file = path.join(this.dataDir, 'spend.json');
    const spend = this._readJson(file, {});
    const key = this.dayKey();
    spend[key] = Math.round((Number(spend[key] || 0) + usd) * 1e6) / 1e6;
    this._writeJson(file, spend);
  }

  // ---- operator controls (REQ-29) ----

  control() {
    return { paused: false, stop: [], dailyLimitNotified: '', ...this._readJson(path.join(this.dataDir, 'control.json'), {}) };
  }

  setControl(patch) {
    const next = { ...this.control(), ...patch };
    this._writeJson(path.join(this.dataDir, 'control.json'), next);
    return next;
  }

  requestStop(ticketId) {
    const c = this.control();
    const id = String(ticketId);
    if (!c.stop.includes(id)) c.stop.push(id);
    this.setControl({ stop: c.stop });
  }

  clearStop(ticketId) {
    const c = this.control();
    this.setControl({ stop: c.stop.filter((x) => x !== String(ticketId)) });
  }
}

module.exports = { StateStore, ACTIVE, TERMINAL, safeId };
