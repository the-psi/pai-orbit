'use strict';
// GitHub Issues as the board. Every call goes through the `gh` CLI with an explicit --repo, so the
// factory needs no GitHub client library and authenticates with the GH_TOKEN already in the
// orchestrator's environment. Labels carry the factory's state; Projects v2 columns are not moved.

const { run, runOk } = require('../exec');

const ISSUE_FIELDS = 'number,title,body,labels,assignees,author,url,state';

/** Issue numbers go on the command line; refuse anything that could be read as a flag. */
function issueNumber(id) {
  const n = String(id);
  if (!/^\d+$/.test(n)) throw new Error(`Invalid GitHub issue number: ${JSON.stringify(id)}`);
  return n;
}

function toTicket(issue) {
  return {
    id: String(issue.number),
    title: issue.title || '',
    body: issue.body || '',
    labels: (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean),
    assignees: (issue.assignees || []).map((a) => (typeof a === 'string' ? a : a.login)).filter(Boolean),
    reporter: (issue.author && issue.author.login) || '',
    state: String(issue.state || 'open').toLowerCase() === 'closed' ? 'closed' : 'open',
    url: issue.url || '',
  };
}

/**
 * Parse one or more JSON values printed back to back (`gh api --paginate` prints one array per
 * page with nothing between them) and return their items as one flat list.
 */
function parseJsonStream(text) {
  const out = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '[' || ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const value = JSON.parse(text.slice(start, i + 1));
        if (Array.isArray(value)) out.push(...value);
        else out.push(value);
        start = -1;
      }
    }
  }
  if (depth !== 0 || inString) throw new Error('Incomplete JSON in gh api output');
  return out;
}

class GitHubBoard {
  /**
   * @param {{repo: string, readyLabel: string, ownedLabel: string, waitingLabel: string,
   *          declinedLabel: string, botUser: string, exec?: Function, now?: () => Date}} opts
   */
  constructor(opts) {
    if (!opts || !opts.repo) throw new Error('GitHubBoard needs a repo (owner/name)');
    this.opts = opts;
    this.repo = opts.repo;
    this.exec = opts.exec || run;
    this.now = opts.now || (() => new Date());
  }

  async _gh(args, input) {
    return runOk('gh', args, { exec: this.exec, input });
  }

  _json(text, what) {
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error(`gh ${what} returned output that is not JSON: ${err.message}`);
    }
  }

  async listEligible() {
    const { readyLabel, groomedLabel, ownedLabel, botUser } = this.opts;
    const seen = new Map();
    // `--label a --label b` means "has both", so each start label gets its own query.
    for (const label of [readyLabel, groomedLabel].filter(Boolean)) {
      const out = await this._gh([
        'issue', 'list', '--repo', this.repo, '--state', 'open', '--label', label,
        '--limit', '100', '--json', ISSUE_FIELDS,
      ]);
      for (const t of this._json(out || '[]', 'issue list').map(toTicket)) seen.set(t.id, t);
    }
    return [...seen.values()]
      .filter((t) => !t.labels.includes(ownedLabel) && !t.assignees.some((a) => a !== botUser));
  }

  async get(id) {
    const out = await this._gh(['issue', 'view', issueNumber(id), '--repo', this.repo, '--json', ISSUE_FIELDS]);
    return toTicket(this._json(out, 'issue view'));
  }

  async claim(id) {
    const { readyLabel, groomedLabel, ownedLabel, botUser } = this.opts;
    const args = ['issue', 'edit', issueNumber(id), '--repo', this.repo, '--add-label', ownedLabel, '--remove-label', readyLabel];
    if (groomedLabel) args.push('--remove-label', groomedLabel);
    args.push('--add-assignee', botUser);
    await this._gh(args);
  }

  async release(id, opts = {}) {
    const { ownedLabel, waitingLabel, declinedLabel, botUser } = this.opts;
    const args = [
      'issue', 'edit', issueNumber(id), '--repo', this.repo,
      '--remove-label', ownedLabel, '--remove-label', waitingLabel, '--remove-assignee', botUser,
    ];
    if (opts.declined) args.push('--add-label', declinedLabel);
    await this._gh(args);
  }

  async comment(id, body) {
    // The body is multi-line markdown: it goes on stdin, never on the command line.
    const out = await this._gh(['issue', 'comment', issueNumber(id), '--repo', this.repo, '--body-file', '-'], body);
    const m = out.match(/issuecomment-(\d+)/);
    return {
      id: m ? m[1] : '',
      author: this.opts.botUser,
      body,
      createdAt: this.now().toISOString(),
    };
  }

  async commentsSince(id, sinceIso) {
    const out = await this._gh([
      'api', '--paginate', `repos/${this.repo}/issues/${issueNumber(id)}/comments?since=${sinceIso}&per_page=100`,
    ]);
    // GitHub's `since` is inclusive and matches on update time, and its timestamps have no
    // milliseconds, so the strict "created after" rule is applied here on parsed times.
    const since = Date.parse(sinceIso);
    return parseJsonStream(out)
      .map((c) => ({
        id: String(c.id),
        author: (c.user && c.user.login) || '',
        body: c.body || '',
        createdAt: c.created_at,
      }))
      .filter((c) => Date.parse(c.createdAt) > since)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }

  async setState(id, state = {}) {
    const { waitingLabel } = this.opts;
    // `state.column` is deliberately ignored: moving a Projects v2 card through gh is unreliable,
    // and the contract says a column that cannot be set must not fail the call.
    if (state.waiting !== true && state.waiting !== false) return;
    await this._gh([
      'issue', 'edit', issueNumber(id), '--repo', this.repo,
      state.waiting ? '--add-label' : '--remove-label', waitingLabel,
    ]);
  }

  async close(id) {
    await this._gh(['issue', 'close', issueNumber(id), '--repo', this.repo]);
  }

  /** Create the four factory labels; --force makes it safe to run again. */
  async ensureLabels() {
    const { readyLabel, ownedLabel, waitingLabel, declinedLabel, groomedLabel } = this.opts;
    for (const name of [readyLabel, ownedLabel, waitingLabel, declinedLabel, groomedLabel].filter(Boolean)) {
      await this._gh(['label', 'create', name, '--repo', this.repo, '--force']);
    }
  }
}

module.exports = { GitHubBoard };
