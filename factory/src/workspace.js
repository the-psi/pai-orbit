'use strict';
// One clone and one branch per ticket (REQ-20). All git commands here are run by the
// orchestrator. Credentials are passed per command and never stored in the clone's config, so
// the agent working in the clone cannot push with them.

const fs = require('node:fs');
const path = require('node:path');
const { run, runOk } = require('./exec');
const { safeId } = require('./state');

const BOT_NAME = 'orbit-factory';
const BOT_EMAIL = 'orbit-factory@users.noreply.local';

function slugify(text, max = 40) {
  const slug = String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (slug.slice(0, max).replace(/-+$/g, '')) || 'ticket';
}

class WorkspaceManager {
  /**
   * @param {{root: string, repoUrl: string, baseBranch: string, authArgs?: () => string[], exec?: Function}} opts
   */
  constructor(opts) {
    this.opts = opts;
    this.root = path.resolve(opts.root);
    this.exec = opts.exec || run;
    fs.mkdirSync(this.root, { recursive: true });
  }

  dirFor(ticketId) {
    return path.join(this.root, safeId(ticketId), 'repo');
  }

  _auth() {
    return this.opts.authArgs ? this.opts.authArgs() : [];
  }

  async git(args, cwd) {
    return runOk('git', args, { cwd, exec: this.exec });
  }

  /**
   * Make sure the ticket's clone exists and is on its branch. Safe to call again after a restart.
   * @returns {Promise<string>} the workspace directory
   */
  async prepare(ticketId, branch) {
    const dir = this.dirFor(ticketId);
    const base = this.opts.baseBranch;
    if (!fs.existsSync(path.join(dir, '.git'))) {
      fs.mkdirSync(path.dirname(dir), { recursive: true });
      await this.git([...this._auth(), 'clone', '--quiet', this.opts.repoUrl, dir]);
      await this.git(['config', 'user.name', BOT_NAME], dir);
      await this.git(['config', 'user.email', BOT_EMAIL], dir);
    }
    const current = await this.git(['rev-parse', '--abbrev-ref', 'HEAD'], dir);
    if (current !== branch) {
      const exists = await this.exec('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: dir });
      if (exists.code === 0) {
        await this.git(['checkout', '--quiet', branch], dir);
      } else {
        const remote = await this.exec('git', ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`], { cwd: dir });
        const from = remote.code === 0 ? `origin/${branch}` : `origin/${base}`;
        await this.git(['checkout', '--quiet', '-b', branch, from], dir);
      }
    }
    return dir;
  }

  /** Commit everything not yet committed. Returns true when a commit was made. */
  async commitAll(dir, message) {
    const status = await this.git(['status', '--porcelain'], dir);
    if (!status) return false;
    await this.git(['add', '-A'], dir);
    await this.git(['commit', '--quiet', '-m', message], dir);
    return true;
  }

  async headSha(dir) {
    return this.git(['rev-parse', 'HEAD'], dir);
  }

  /** Files changed and lines changed against the base branch (the measured size of a ticket). */
  async diffSize(dir) {
    const out = await this.git(['diff', '--numstat', `origin/${this.opts.baseBranch}...HEAD`], dir);
    let files = 0;
    let changedLines = 0;
    const paths = [];
    for (const line of out.split('\n').filter(Boolean)) {
      const [add, del, file] = line.split('\t');
      files += 1;
      changedLines += (Number(add) || 0) + (Number(del) || 0);
      paths.push(file);
    }
    return { files, changedLines, paths };
  }

  /** Bring the base branch into the clone, for conflict checks and for release. */
  async fetch(dir) {
    await this.git([...this._auth(), 'fetch', '--quiet', 'origin'], dir);
  }

  /** Put the clone on a clean, current copy of the base branch (release stage). */
  async checkoutBase(dir) {
    const base = this.opts.baseBranch;
    await this.fetch(dir);
    // Make the clone's tags exactly the remote's. A tag left behind by an earlier release attempt
    // that never reached the remote would otherwise mislead the next release and block its push.
    await this.git([...this._auth(), 'fetch', '--quiet', '--force', '--prune', '--prune-tags', 'origin', '+refs/tags/*:refs/tags/*'], dir);
    await this.git(['checkout', '--quiet', '-B', base, `origin/${base}`], dir);
  }

  /** Append text to a file inside the workspace, creating folders as needed. */
  appendFile(dir, relPath, text) {
    const file = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, text);
  }

  exists(dir, relPath) {
    return fs.existsSync(path.join(dir, relPath));
  }
}

module.exports = { WorkspaceManager, slugify, BOT_NAME, BOT_EMAIL };
