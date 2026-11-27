'use strict';
// GitHub as the code host. Pushes use git with gh as a one-off credential helper; pull requests,
// reviews and merges go through the `gh` CLI with an explicit --repo. Nothing here bypasses branch
// protection: a merge the repository's rules refuse is a failure, not something to force.

const { run } = require('../exec');

const MERGE_METHODS = ['squash', 'merge', 'rebase'];
const PR_STATES = { OPEN: 'open', MERGED: 'merged', CLOSED: 'closed' };
const REVIEW_STATES = { APPROVED: 'approved', CHANGES_REQUESTED: 'changes_requested', COMMENTED: 'commented' };

/** Pull request numbers go on the command line; refuse anything that could be read as a flag. */
function prNumber(id) {
  const n = String(id);
  if (!/^\d+$/.test(n)) throw new Error(`Invalid GitHub pull request number: ${JSON.stringify(id)}`);
  return n;
}

function refName(name, what) {
  const s = String(name || '');
  if (!s || s.startsWith('-') || /\s/.test(s)) throw new Error(`Invalid ${what} name: ${JSON.stringify(name)}`);
  return s;
}

class GitHubCodeHost {
  /** @param {{repo: string, mergeMethod?: 'squash'|'merge'|'rebase', exec?: Function, now?: () => Date}} opts */
  constructor(opts) {
    if (!opts || !opts.repo) throw new Error('GitHubCodeHost needs a repo (owner/name)');
    const mergeMethod = opts.mergeMethod || 'squash';
    if (!MERGE_METHODS.includes(mergeMethod)) {
      throw new Error(`Unknown mergeMethod "${mergeMethod}" (expected ${MERGE_METHODS.join(', ')})`);
    }
    this.opts = opts;
    this.repo = opts.repo;
    this.mergeMethod = mergeMethod;
    this.exec = opts.exec || run;
    this.now = opts.now || (() => new Date());
  }

  gitAuthArgs() {
    // The empty helper clears any helper inherited from system or user config.
    return ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential'];
  }

  _fail(what, res) {
    const detail = (res.stderr || res.stdout || '').trim().split('\n').slice(-5).join('\n');
    return new Error(`${what} failed (exit ${res.code}): ${detail}`);
  }

  /** Run gh and throw, naming the subcommand, when it fails. Returns trimmed stdout. */
  async _gh(args, opts = {}) {
    const res = await this.exec('gh', args, opts);
    if (res.code !== 0) throw this._fail(`gh ${args.slice(0, 3).join(' ')}`, res);
    return String(res.stdout || '').trim();
  }

  _json(text, what) {
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error(`gh ${what} returned output that is not JSON: ${err.message}`);
    }
  }

  async push(dir, branch, opts = {}) {
    const b = refName(branch, 'branch');
    // A ticket branch belongs to the factory and may be rewritten by a rework. The base branch
    // is shared: it is pushed plainly, so GitHub refuses if it has moved or is protected.
    const force = opts.shared ? [] : ['--force-with-lease'];
    const res = await this.exec(
      'git', [...this.gitAuthArgs(), 'push', ...force, 'origin', `${b}:${b}`], { cwd: dir },
    );
    if (res.code !== 0) throw this._fail(`git push origin ${b}`, res);
  }

  /** Push tags created by the release stage. */
  async pushTags(dir) {
    const res = await this.exec('git', [...this.gitAuthArgs(), 'push', 'origin', '--tags'], { cwd: dir });
    if (res.code !== 0) throw this._fail('git push origin --tags', res);
  }

  async openPr(pr) {
    const branch = refName(pr.branch, 'branch');
    const base = refName(pr.base, 'base branch');
    const args = [
      'pr', 'create', '--repo', this.repo, '--head', branch, '--base', base,
      '--title', pr.title, '--body-file', '-',
    ];
    // The body is multi-line markdown: it goes on stdin, never on the command line.
    const res = await this.exec('gh', args, { input: pr.body || '' });
    if (res.code === 0) {
      const urls = String(res.stdout || '').match(/https?:\/\/\S+\/pull\/\d+/g);
      if (!urls) throw new Error(`gh pr create did not print a pull request URL: ${String(res.stdout || '').trim()}`);
      const url = urls[urls.length - 1];
      return { id: url.slice(url.lastIndexOf('/') + 1), url };
    }
    if (!/already exists/i.test(`${res.stderr || ''}\n${res.stdout || ''}`)) {
      throw this._fail('gh pr create --repo', res);
    }
    const out = await this._gh([
      'pr', 'list', '--repo', this.repo, '--head', branch, '--state', 'open', '--json', 'number,url',
    ]);
    const existing = this._json(out || '[]', 'pr list')[0];
    if (!existing) {
      throw new Error(`gh pr create said a pull request for ${branch} already exists, but gh pr list found none`);
    }
    return { id: String(existing.number), url: existing.url };
  }

  async prStatus(id) {
    const out = await this._gh([
      'pr', 'view', prNumber(id), '--repo', this.repo, '--json', 'state,headRefOid,mergeable,reviews',
    ]);
    const pr = this._json(out, 'pr view');
    let mergeable = null; // UNKNOWN: GitHub has not computed it yet
    if (pr.mergeable === 'MERGEABLE') mergeable = true;
    else if (pr.mergeable === 'CONFLICTING') mergeable = false;
    const reviews = (pr.reviews || [])
      .filter((r) => REVIEW_STATES[r.state]) // drops DISMISSED and PENDING
      .map((r) => ({
        author: (r.author && r.author.login) || '',
        state: REVIEW_STATES[r.state],
        sha: (r.commit && r.commit.oid) || '',
        body: r.body || '',
        submittedAt: r.submittedAt || '',
      }))
      .sort((a, b) => (Date.parse(a.submittedAt) || 0) - (Date.parse(b.submittedAt) || 0));
    const state = PR_STATES[pr.state];
    if (!state) throw new Error(`gh pr view returned an unknown pull request state: ${JSON.stringify(pr.state)}`);
    return { state, headSha: pr.headRefOid || '', mergeable, reviews };
  }

  async merge(id) {
    // No --admin and no --auto: the merge either satisfies the branch's rules now or fails.
    await this._gh(['pr', 'merge', prNumber(id), '--repo', this.repo, `--${this.mergeMethod}`]);
  }

  async baseProtected(base) {
    const res = await this.exec('gh', ['api', `repos/${this.repo}/branches/${refName(base, 'base branch')}/protection`], {});
    if (res.code === 0) {
      try {
        return Boolean(JSON.parse(res.stdout).required_pull_request_reviews);
      } catch {
        return null;
      }
    }
    if (/HTTP 404|Branch not protected/i.test(`${res.stderr || ''}\n${res.stdout || ''}`)) return false;
    return null; // no permission, network trouble, rate limit: the host cannot say
  }
}

module.exports = { GitHubCodeHost };
