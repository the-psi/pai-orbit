'use strict';
// File-based board for trials and tests. One JSON file per ticket under <dir>/tickets/.
// It lets the whole factory run with no external service.

const fs = require('node:fs');
const path = require('node:path');

class LocalBoard {
  /**
   * @param {{dir: string, readyLabel: string, ownedLabel: string, waitingLabel: string,
   *          declinedLabel: string, botUser: string, now?: () => Date}} opts
   */
  constructor(opts) {
    this.opts = opts;
    this.dir = path.join(path.resolve(opts.dir), 'tickets');
    this.now = opts.now || (() => new Date());
    fs.mkdirSync(this.dir, { recursive: true });
  }

  _file(id) {
    return path.join(this.dir, `${String(id).replace(/[^A-Za-z0-9._-]/g, '_')}.json`);
  }

  _read(id) {
    const file = this._file(id);
    if (!fs.existsSync(file)) throw new Error(`Ticket ${id} not found on the local board`);
    const t = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      id: String(t.id),
      title: t.title || '',
      body: t.body || '',
      labels: t.labels || [],
      assignees: t.assignees || [],
      reporter: t.reporter || '',
      state: t.state || 'open',
      url: t.url || `local://ticket/${t.id}`,
      column: t.column || '',
      comments: t.comments || [],
    };
  }

  _write(t) {
    fs.writeFileSync(this._file(t.id), `${JSON.stringify(t, null, 2)}\n`);
  }

  _public(t) {
    const { comments, column, ...ticket } = t;
    return ticket;
  }

  /** Create a ticket (used by tests and by `factory ticket add`). */
  async create(ticket) {
    const t = {
      id: String(ticket.id),
      title: ticket.title || '',
      body: ticket.body || '',
      labels: ticket.labels || [],
      assignees: ticket.assignees || [],
      reporter: ticket.reporter || '',
      state: 'open',
      comments: [],
    };
    this._write(t);
    return this._public(this._read(t.id));
  }

  async listEligible() {
    const { readyLabel, ownedLabel, botUser } = this.opts;
    const out = [];
    for (const name of fs.readdirSync(this.dir).sort()) {
      if (!name.endsWith('.json')) continue;
      const t = this._read(name.slice(0, -5));
      const humanAssignee = t.assignees.some((a) => a !== botUser);
      if (t.state === 'open' && t.labels.includes(readyLabel) && !t.labels.includes(ownedLabel) && !humanAssignee) {
        out.push(this._public(t));
      }
    }
    return out;
  }

  async get(id) {
    return this._public(this._read(id));
  }

  async claim(id) {
    const { readyLabel, ownedLabel, botUser } = this.opts;
    const t = this._read(id);
    t.labels = t.labels.filter((l) => l !== readyLabel);
    if (!t.labels.includes(ownedLabel)) t.labels.push(ownedLabel);
    if (!t.assignees.includes(botUser)) t.assignees.push(botUser);
    this._write(t);
  }

  async release(id, opts = {}) {
    const { ownedLabel, waitingLabel, declinedLabel, botUser } = this.opts;
    const t = this._read(id);
    t.labels = t.labels.filter((l) => l !== ownedLabel && l !== waitingLabel);
    t.assignees = t.assignees.filter((a) => a !== botUser);
    if (opts.declined && !t.labels.includes(declinedLabel)) t.labels.push(declinedLabel);
    this._write(t);
  }

  async comment(id, body, author) {
    const t = this._read(id);
    const c = {
      id: `c${t.comments.length + 1}`,
      author: author || this.opts.botUser,
      body,
      createdAt: this.now().toISOString(),
    };
    t.comments.push(c);
    this._write(t);
    return c;
  }

  async commentsSince(id, sinceIso) {
    const t = this._read(id);
    return t.comments.filter((c) => new Date(c.createdAt) > new Date(sinceIso));
  }

  async setState(id, state) {
    const { waitingLabel } = this.opts;
    const t = this._read(id);
    if (state.waiting === true && !t.labels.includes(waitingLabel)) t.labels.push(waitingLabel);
    if (state.waiting === false) t.labels = t.labels.filter((l) => l !== waitingLabel);
    if (state.column) t.column = state.column;
    this._write(t);
  }

  async close(id) {
    const t = this._read(id);
    t.state = 'closed';
    this._write(t);
  }

  /** Full ticket including comments and column (tests and `factory status`). */
  raw(id) {
    return this._read(id);
  }
}

module.exports = { LocalBoard };
