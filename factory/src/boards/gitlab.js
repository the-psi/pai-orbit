'use strict';
// GitLab Issues as the board. Labels carry the factory's state, exactly as on GitHub; issue board
// lists are not moved. Every call is a GitLab REST API request made with the token in the
// orchestrator's environment.

const { iid } = require('../gitlab-api');

const LABEL_COLOURS = {
  ready: '#1f75cb', groomed: '#6b4fc4', owned: '#1a7f4b', waiting: '#b45309', declined: '#5b6676',
};

function toTicket(issue) {
  return {
    id: String(issue.iid),
    title: issue.title || '',
    body: issue.description || '',
    labels: (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean),
    assignees: (issue.assignees || []).map((a) => a && a.username).filter(Boolean),
    reporter: (issue.author && issue.author.username) || '',
    state: String(issue.state || 'opened').toLowerCase() === 'closed' ? 'closed' : 'open',
    url: issue.web_url || '',
  };
}

class GitLabBoard {
  /**
   * @param {{api: object, readyLabel: string, groomedLabel?: string, ownedLabel: string,
   *          waitingLabel: string, declinedLabel: string, botUser: string, now?: () => Date}} opts
   */
  constructor(opts) {
    if (!opts || !opts.api) throw new Error('GitLabBoard needs a GitLab API client');
    this.opts = opts;
    this.api = opts.api;
    this.now = opts.now || (() => new Date());
    this._botId = null;
  }

  _issue(id, suffix = '') {
    return this.api.p(`/issues/${iid(id, 'issue')}${suffix}`);
  }

  /** The numeric id of the factory's own user (assignments are by id). Looked up once. */
  async _botUserId() {
    if (this._botId !== null) return this._botId;
    const users = await this.api.get('/users', { username: this.opts.botUser });
    const user = Array.isArray(users) ? users.find((u) => u.username === this.opts.botUser) : null;
    if (!user) throw new Error(`GitLab user "${this.opts.botUser}" (board.botUser) was not found`);
    this._botId = user.id;
    return this._botId;
  }

  async listEligible() {
    const { readyLabel, groomedLabel, ownedLabel, botUser } = this.opts;
    const seen = new Map();
    // `labels=a,b` means "has both", so each start label gets its own query.
    for (const label of [readyLabel, groomedLabel].filter(Boolean)) {
      const issues = await this.api.all(this.api.p('/issues'), { state: 'opened', labels: label });
      for (const t of issues.map(toTicket)) seen.set(t.id, t);
    }
    return [...seen.values()]
      .filter((t) => !t.labels.includes(ownedLabel) && !t.assignees.some((a) => a !== botUser));
  }

  async get(id) {
    return toTicket(await this.api.get(this._issue(id)));
  }

  async claim(id) {
    const { readyLabel, groomedLabel, ownedLabel } = this.opts;
    const issue = await this.api.get(this._issue(id));
    const botId = await this._botUserId();
    const ids = new Set((issue.assignees || []).map((a) => a.id));
    ids.add(botId);
    await this.api.put(this._issue(id), {
      add_labels: ownedLabel,
      remove_labels: [readyLabel, groomedLabel].filter(Boolean).join(','),
      assignee_ids: [...ids],
    });
  }

  async release(id, opts = {}) {
    const { ownedLabel, waitingLabel, declinedLabel } = this.opts;
    const issue = await this.api.get(this._issue(id));
    const botId = await this._botUserId();
    const rest = (issue.assignees || []).map((a) => a.id).filter((x) => x !== botId);
    const body = {
      remove_labels: [ownedLabel, waitingLabel].join(','),
      // GitLab reads [0] as "nobody".
      assignee_ids: rest.length ? rest : [0],
    };
    if (opts.declined) body.add_labels = declinedLabel;
    await this.api.put(this._issue(id), body);
  }

  async comment(id, body) {
    const note = await this.api.post(this._issue(id, '/notes'), { body });
    return {
      id: String((note && note.id) || ''),
      author: (note && note.author && note.author.username) || this.opts.botUser,
      body,
      createdAt: (note && note.created_at) || this.now().toISOString(),
    };
  }

  async commentsSince(id, sinceIso) {
    const since = Date.parse(sinceIso);
    const notes = await this.api.all(this._issue(id, '/notes'), { sort: 'asc', order_by: 'created_at' });
    return notes
      .filter((n) => !n.system) // "added label", "assigned to" and the like
      .map((n) => ({
        id: String(n.id),
        author: (n.author && n.author.username) || '',
        body: n.body || '',
        createdAt: n.created_at,
      }))
      .filter((c) => Date.parse(c.createdAt) > since)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }

  async setState(id, state = {}) {
    // `state.column` is deliberately ignored: issue board lists differ per project, and the
    // contract says a column that cannot be set must not fail the call.
    if (state.waiting !== true && state.waiting !== false) return;
    const key = state.waiting ? 'add_labels' : 'remove_labels';
    await this.api.put(this._issue(id), { [key]: this.opts.waitingLabel });
  }

  async close(id) {
    await this.api.put(this._issue(id), { state_event: 'close' });
  }

  /** Create the factory's labels in the project. Safe to run again: an existing label is kept. */
  async ensureLabels() {
    const { readyLabel, groomedLabel, ownedLabel, waitingLabel, declinedLabel } = this.opts;
    const wanted = [
      [readyLabel, LABEL_COLOURS.ready], [groomedLabel, LABEL_COLOURS.groomed],
      [ownedLabel, LABEL_COLOURS.owned], [waitingLabel, LABEL_COLOURS.waiting],
      [declinedLabel, LABEL_COLOURS.declined],
    ].filter(([name]) => name);
    for (const [name, color] of wanted) {
      try {
        await this.api.post(this.api.p('/labels'), { name, color });
      } catch (err) {
        if (err.status !== 409) throw err; // 409: the label already exists
      }
    }
  }
}

module.exports = { GitLabBoard, toTicket };
