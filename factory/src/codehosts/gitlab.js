'use strict';
// GitLab as the code host. Pushes use git with a one-off credential helper that reads the token
// from the orchestrator's environment; merge requests, approvals and merges go through the GitLab
// REST API. Nothing here bypasses a protected branch or an approval rule: a merge GitLab refuses
// is a failure, not something to force.
//
// How a person's review maps to the factory's merge gate:
//   approve    -> the Approve button on the merge request (or the `/approve` quick action)
//   send back  -> a comment on the merge request that starts with `reject <what to change>`
// GitLab's "Request changes" exists only on paid tiers, so the comment is the one way that works
// everywhere.

const { run } = require('../exec');
const { iid } = require('../gitlab-api');
const { decisionOf, isFactoryComment } = require('../decision');

const MERGE_METHODS = ['squash', 'merge'];
const MR_STATES = { opened: 'open', locked: 'open', merged: 'merged', closed: 'closed' };
// Access levels: 30 Developer, 40 Maintainer.
const DEVELOPER = 30;

function refName(name, what) {
  const s = String(name || '');
  if (!s || s.startsWith('-') || /\s/.test(s)) throw new Error(`Invalid ${what} name: ${JSON.stringify(name)}`);
  return s;
}

class GitLabCodeHost {
  /**
   * @param {{api: object, mergeMethod?: 'squash'|'merge', tokenEnv?: string, exec?: Function,
   *          now?: () => Date}} opts
   */
  constructor(opts) {
    if (!opts || !opts.api) throw new Error('GitLabCodeHost needs a GitLab API client');
    const mergeMethod = opts.mergeMethod || 'squash';
    if (!MERGE_METHODS.includes(mergeMethod)) {
      throw new Error(`Unknown mergeMethod "${mergeMethod}" for GitLab (expected ${MERGE_METHODS.join(' or ')}; rebase and fast-forward are a project setting in GitLab)`);
    }
    const tokenEnv = opts.tokenEnv || 'GITLAB_TOKEN';
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tokenEnv)) throw new Error(`Invalid token variable name: ${JSON.stringify(tokenEnv)}`);
    this.opts = opts;
    this.api = opts.api;
    this.mergeMethod = mergeMethod;
    this.tokenEnv = tokenEnv;
    this.exec = opts.exec || run;
    this.now = opts.now || (() => new Date());
    this.words = {
      prNote: 'This merge request needs an approval from a named merge approver before the factory merges it. To send it back, comment `reject <what to change>` on the merge request.',
      approveHow: (who) => `Approve the merge request with its Approve button. Only an approval from ${who} counts, and it must be on the latest commit. To send it back, comment \`reject <what to change>\` on the merge request.`,
    };
  }

  gitAuthArgs() {
    // The empty helper clears any helper inherited from system or user config. The second one
    // answers only for this GitLab site, and reads the token from the environment when git asks,
    // so the token is never on a command line and never in the clone's config.
    const helper = `!f() { test "$1" = get && echo username=oauth2 && echo "password=$${this.tokenEnv}"; }; f`;
    return ['-c', 'credential.helper=', '-c', `credential.${this.api.siteUrl}.helper=${helper}`];
  }

  _fail(what, res) {
    const detail = (res.stderr || res.stdout || '').trim().split('\n').slice(-5).join('\n');
    return new Error(`${what} failed (exit ${res.code}): ${detail}`);
  }

  _mr(id, suffix = '') {
    return this.api.p(`/merge_requests/${iid(id, 'merge request')}${suffix}`);
  }

  async push(dir, branch, opts = {}) {
    const b = refName(branch, 'branch');
    // A ticket branch belongs to the factory and may be rewritten by a rework. The base branch
    // is shared: it is pushed plainly, so GitLab refuses if it has moved or is protected.
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
    try {
      const mr = await this.api.post(this.api.p('/merge_requests'), {
        source_branch: branch,
        target_branch: base,
        title: pr.title,
        description: pr.body || '',
        remove_source_branch: true,
        squash: this.mergeMethod === 'squash',
      });
      return { id: String(mr.iid), url: mr.web_url || '' };
    } catch (err) {
      if (err.status !== 409) throw err; // 409: an open merge request for this branch already exists
    }
    const open = await this.api.get(this.api.p('/merge_requests'), {
      source_branch: branch, target_branch: base, state: 'opened',
    });
    const existing = Array.isArray(open) ? open[0] : null;
    if (!existing) {
      throw new Error(`GitLab said a merge request for ${branch} already exists, but none is open`);
    }
    return { id: String(existing.iid), url: existing.web_url || '' };
  }

  /**
   * The commit a merge request pointed at, at a given time. GitLab does not say which commit an
   * approval was given for, so it is worked out from the merge request's versions (one per push).
   * @param {{head_commit_sha: string, created_at: string}[]} versions
   */
  _headAt(versions, whenIso) {
    const when = Date.parse(whenIso);
    let best = null;
    for (const v of versions) {
      const t = Date.parse(v.created_at);
      if (Number.isNaN(t) || t > when) continue;
      if (!best || t > best.t) best = { t, sha: v.head_commit_sha || '' };
    }
    return best ? best.sha : '';
  }

  async prStatus(id) {
    const mr = await this.api.get(this._mr(id));
    const state = MR_STATES[mr.state];
    if (!state) throw new Error(`GitLab returned an unknown merge request state: ${JSON.stringify(mr.state)}`);
    let mergeable = true;
    if (mr.has_conflicts === true || mr.merge_status === 'cannot_be_merged') mergeable = false;
    else if (['unchecked', 'checking', 'cannot_be_merged_recheck'].includes(mr.merge_status)) mergeable = null;

    const reviews = [];
    if (state === 'open') {
      const [approvals, notes, versions] = await Promise.all([
        this.api.get(this._mr(id, '/approvals')),
        this.api.all(this._mr(id, '/notes'), { sort: 'asc', order_by: 'created_at' }),
        this.api.all(this._mr(id, '/versions')),
      ]);
      // When each person last approved, from the system notes GitLab writes.
      const approvedAt = new Map();
      for (const n of notes) {
        const who = n.author && n.author.username;
        if (!n.system || !who) continue;
        if (/^approved this merge request/i.test(n.body || '')) approvedAt.set(who, n.created_at);
        else if (/^unapproved this merge request/i.test(n.body || '')) approvedAt.delete(who);
      }
      for (const a of (approvals && approvals.approved_by) || []) {
        const who = a && a.user && a.user.username;
        if (!who) continue;
        const at = approvedAt.get(who) || '';
        // No note found means the commit cannot be established, so the approval carries no sha
        // and will not count: the factory fails closed rather than merge on a guess.
        reviews.push({ author: who, state: 'approved', sha: at ? this._headAt(versions, at) : '', body: '', submittedAt: at });
      }
      // Sending back: a person's comment on the merge request that starts with `reject`.
      for (const n of notes) {
        if (n.system || isFactoryComment(n)) continue;
        const decision = decisionOf(n.body);
        if (!decision || !decision.reject) continue;
        reviews.push({
          author: (n.author && n.author.username) || '',
          state: 'changes_requested',
          sha: this._headAt(versions, n.created_at),
          body: decision.text || '',
          submittedAt: n.created_at,
        });
      }
      reviews.sort((a, b) => (Date.parse(a.submittedAt) || 0) - (Date.parse(b.submittedAt) || 0));
    }
    return { state, headSha: mr.sha || '', mergeable, reviews };
  }

  async merge(id) {
    const before = await this.api.get(this._mr(id));
    try {
      // `sha` makes GitLab refuse if the branch moved since the approval was checked. There is no
      // "merge when pipeline succeeds" and no override here: it merges now or it fails.
      await this.api.put(this._mr(id, '/merge'), {
        sha: before.sha,
        squash: this.mergeMethod === 'squash',
        should_remove_source_branch: true,
      });
    } catch (err) {
      let after = null;
      try { after = await this.api.get(this._mr(id)); } catch { /* keep the original error */ }
      if (after && after.state === 'merged') return;
      const e = new Error(`GitLab refused to merge merge request ${id}: ${err.message}`);
      // The pipeline sends a conflicting ticket back for rework instead of failing it.
      if ((after && after.has_conflicts === true) || before.has_conflicts === true) e.conflict = true;
      throw e;
    }
  }

  /**
   * Whether the base branch requires review before merge.
   *   false: the branch is not protected at all.
   *   true:  it is protected and the project requires at least one approval.
   *   null:  it is protected, but required approvals cannot be confirmed (GitLab's free tier has
   *          no required approvals; or the token may not read the rules).
   */
  async baseProtected(base) {
    const name = refName(base, 'base branch');
    try {
      await this.api.get(this.api.p(`/protected_branches/${encodeURIComponent(name)}`));
    } catch (err) {
      return err.status === 404 ? false : null;
    }
    try {
      const rules = await this.api.get(this.api.p('/approval_rules'));
      if (Array.isArray(rules) && rules.some((r) => Number(r.approvals_required) > 0)) return true;
    } catch { /* not available on this tier or to this token */ }
    return null;
  }

  /**
   * Who the token is and whether it may write to the project (preflight).
   * @returns {Promise<{ok: boolean, user: string, detail: string}>}
   */
  async checkAccess() {
    let user;
    try {
      user = await this.api.get('/user');
    } catch (err) {
      return { ok: false, user: '', detail: `the GitLab token was not accepted: ${err.message}` };
    }
    const name = (user && user.username) || '';
    let project;
    try {
      project = await this.api.get(this.api.p());
    } catch (err) {
      return { ok: false, user: name, detail: `${name} cannot read project ${this.api.project}: ${err.message}` };
    }
    const perms = (project && project.permissions) || {};
    const level = Math.max(
      (perms.project_access && perms.project_access.access_level) || 0,
      (perms.group_access && perms.group_access.access_level) || 0,
    );
    if (level < DEVELOPER) {
      return { ok: false, user: name, detail: `${name} has access level ${level} on ${this.api.project}; the factory needs Developer (30) or higher to push and open merge requests` };
    }
    return { ok: true, user: name, detail: `${name} on ${this.api.project}, access level ${level}` };
  }
}

module.exports = { GitLabCodeHost };
