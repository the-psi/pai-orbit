'use strict';
// File-based code host for trials and tests. The "remote" is any git URL or path (a bare repo on
// disk works). Pull requests and reviews are JSON files under <dir>/prs/.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run, runOk } = require('../exec');

class LocalCodeHost {
  /** @param {{dir: string, repoUrl: string, exec?: Function, now?: () => Date}} opts */
  constructor(opts) {
    this.opts = opts;
    this.dir = path.join(path.resolve(opts.dir), 'prs');
    this.exec = opts.exec || run;
    this.now = opts.now || (() => new Date());
    fs.mkdirSync(this.dir, { recursive: true });
  }

  gitAuthArgs() {
    return [];
  }

  _file(id) {
    return path.join(this.dir, `${id}.json`);
  }

  _read(id) {
    const file = this._file(id);
    if (!fs.existsSync(file)) throw new Error(`Pull request ${id} not found on the local code host`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  _write(pr) {
    fs.writeFileSync(this._file(pr.id), `${JSON.stringify(pr, null, 2)}\n`);
  }

  async _git(args, cwd) {
    return runOk('git', args, { cwd, exec: this.exec });
  }

  async _remoteSha(branch) {
    const out = await this._git(['ls-remote', this.opts.repoUrl, `refs/heads/${branch}`]);
    return out ? out.split(/\s+/)[0] : '';
  }

  async push(dir, branch, opts = {}) {
    // A ticket branch belongs to the factory and may be rewritten by a rework. The base branch
    // is shared: it is pushed plainly, so the host refuses if it has moved.
    const force = opts.shared ? [] : ['--force-with-lease'];
    await this._git(['push', ...force, 'origin', `${branch}:${branch}`], dir);
  }

  async pushTags(dir) {
    await this._git(['push', '--quiet', 'origin', '--tags'], dir);
  }

  async openPr(pr) {
    const id = String(fs.readdirSync(this.dir).filter((n) => n.endsWith('.json')).length + 1);
    this._write({
      id, branch: pr.branch, base: pr.base, title: pr.title, body: pr.body,
      state: 'open', mergeable: true, reviews: [], createdAt: this.now().toISOString(),
    });
    return { id, url: `local://pr/${id}` };
  }

  async prStatus(id) {
    const pr = this._read(id);
    const headSha = pr.state === 'open' ? await this._remoteSha(pr.branch) : (pr.headSha || '');
    return { state: pr.state, headSha, mergeable: pr.mergeable, reviews: pr.reviews || [] };
  }

  async merge(id) {
    const pr = this._read(id);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-merge-'));
    try {
      await this._git(['clone', '--quiet', this.opts.repoUrl, tmp]);
      await this._git(['checkout', '--quiet', pr.base], tmp);
      const merged = await this.exec('git', [
        '-c', 'user.name=orbit-factory', '-c', 'user.email=orbit-factory@localhost',
        'merge', '--no-ff', '--quiet', '-m', `Merge ${pr.branch}: ${pr.title}`, `origin/${pr.branch}`,
      ], { cwd: tmp });
      if (merged.code !== 0) {
        const err = new Error(`${pr.branch} does not merge cleanly into ${pr.base}`);
        err.conflict = true; // the pipeline sends the ticket back for rework instead of failing it
        throw err;
      }
      await this._git(['push', '--quiet', 'origin', pr.base], tmp);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    pr.headSha = await this._remoteSha(pr.branch);
    pr.state = 'merged';
    this._write(pr);
  }

  async baseProtected() {
    return null; // a local repo has no branch protection to check
  }

  /** Record a review (tests and `factory review`). The sha defaults to the current head. */
  async addReview(id, review) {
    const pr = this._read(id);
    pr.reviews.push({
      author: review.author,
      state: review.state,
      sha: review.sha || await this._remoteSha(pr.branch),
      body: review.body || '',
      submittedAt: review.submittedAt || this.now().toISOString(),
    });
    this._write(pr);
  }

  /** Set fields directly (tests): state, mergeable. */
  patch(id, fields) {
    this._write({ ...this._read(id), ...fields });
  }
}

module.exports = { LocalCodeHost };
