'use strict';
// An in-memory GitLab for tests: the REST endpoints the factory's GitLab board and code host call,
// answered from memory. Merges are real git merges in a bare repo on disk, so a pipeline test can
// check what actually reached the base branch. It is handed to GitLabApi as its `fetch`.
//
// It models the parts of GitLab the adapter depends on:
//   - labels and one-or-more assignees on issues, system notes next to people's notes
//   - a merge request "version" per push, approvals, and the system note an approval leaves
//   - a merge that is refused when the given sha is not the branch head, or on a conflict

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

class FakeGitLab {
  /**
   * @param {{project?: string, token?: string, botUser?: string, remote?: string, now?: () => Date,
   *          pageSize?: number, accessLevel?: number}} [opts] `remote` is a bare repo on disk
   */
  constructor(opts = {}) {
    this.project = opts.project || 'grp/app';
    this.token = opts.token || 'gl-test-token';
    this.botUser = opts.botUser || 'orbit-factory';
    this.remote = opts.remote || '';
    this.now = opts.now || (() => new Date());
    this.pageSize = opts.pageSize || 0; // 0 = honour per_page
    this.accessLevel = opts.accessLevel === undefined ? 40 : opts.accessLevel;
    this.site = 'https://gitlab.test';
    this.users = new Map();
    this.issues = new Map();
    this.mrs = new Map();
    this.labels = new Set();
    this.protectedBranches = new Set();
    this.approvalRules = null; // null = endpoint not available (free tier)
    this.requests = [];
    this.refuseMerge = false;
    this.nextNote = 1;
    for (const name of [this.botUser, 'alice', 'po', 'lead', 'dev2', 'rel', 'boss', 'mallory']) this.user(name);
    this.fetch = this.fetch.bind(this);
  }

  user(username) {
    if (!this.users.has(username)) this.users.set(username, { id: this.users.size + 1, username });
    return this.users.get(username);
  }

  _stamp() { return this.now().toISOString(); }

  _note(author, body, system = false) {
    const note = { id: this.nextNote, author: this.user(author), body, system, created_at: this._stamp() };
    this.nextNote += 1;
    return note;
  }

  // ------------------------------------------------------------ what a person does in the UI

  addIssue(fields = {}) {
    const iid = fields.iid || this.issues.size + 1;
    const issue = {
      iid,
      title: fields.title || `Ticket ${iid}`,
      description: fields.body === undefined ? 'Add a greeting to the home page.' : fields.body,
      labels: (fields.labels || ['factory-ready']).slice(),
      assignees: (fields.assignees || []).map((u) => this.user(u)),
      author: this.user(fields.reporter || 'alice'),
      state: 'opened',
      web_url: `${this.site}/${this.project}/-/issues/${iid}`,
      notes: [],
    };
    this.issues.set(String(iid), issue);
    return issue;
  }

  issueComment(iid, author, body) {
    const note = this._note(author, body);
    this.issues.get(String(iid)).notes.push(note);
    return note;
  }

  mrComment(iid, author, body) {
    const mr = this._synced(iid);
    const note = this._note(author, body);
    mr.notes.push(note);
    return note;
  }

  approve(iid, author) {
    const mr = this._synced(iid);
    if (!mr.approved_by.includes(author)) mr.approved_by.push(author);
    mr.notes.push(this._note(author, 'approved this merge request', true));
  }

  unapprove(iid, author) {
    const mr = this._synced(iid);
    mr.approved_by = mr.approved_by.filter((u) => u !== author);
    mr.notes.push(this._note(author, 'unapproved this merge request', true));
  }

  closeMr(iid) { this.mrs.get(String(iid)).state = 'closed'; }

  // ------------------------------------------------------------ git

  _head(branch) {
    if (!this.remote) return '';
    try { return git(this.remote, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`); } catch { return ''; }
  }

  /** Notice a push: a new head on the source branch is a new version of the merge request. */
  _synced(iid) {
    const mr = this.mrs.get(String(iid));
    if (!mr) return null;
    if (mr.state !== 'opened') return mr;
    const head = this._head(mr.source_branch) || mr.sha;
    if (head && head !== mr.sha) {
      mr.sha = head;
      mr.versions.unshift({ id: mr.versions.length + 1, head_commit_sha: head, created_at: this._stamp() });
      if (this.resetApprovalsOnPush) mr.approved_by = [];
    }
    return mr;
  }

  _merge(mr, squash) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-gitlab-merge-'));
    const id = ['-c', 'user.name=gitlab', '-c', 'user.email=gitlab@localhost', '-c', 'commit.gpgsign=false'];
    try {
      git(tmp, 'clone', '--quiet', this.remote, 'r');
      const r = path.join(tmp, 'r');
      git(r, 'checkout', '--quiet', mr.target_branch);
      try {
        if (squash) {
          git(r, ...id, 'merge', '--squash', '--quiet', `origin/${mr.source_branch}`);
          git(r, ...id, 'commit', '--quiet', '-m', mr.title);
        } else {
          git(r, ...id, 'merge', '--no-ff', '--quiet', '-m', `Merge ${mr.source_branch}`, `origin/${mr.source_branch}`);
        }
      } catch {
        return false;
      }
      git(r, 'push', '--quiet', 'origin', mr.target_branch);
      return true;
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
    }
  }

  // ------------------------------------------------------------ the REST API

  _issueJson(i) {
    const { notes, ...rest } = i;
    return { ...rest, labels: i.labels.slice(), assignees: i.assignees.slice() };
  }

  _mrJson(m) {
    return {
      iid: m.iid, title: m.title, description: m.description, state: m.state, sha: m.sha,
      source_branch: m.source_branch, target_branch: m.target_branch, squash: m.squash,
      has_conflicts: m.has_conflicts, merge_status: m.merge_status,
      web_url: `${this.site}/${this.project}/-/merge_requests/${m.iid}`,
    };
  }

  _respond(status, data, headers = {}) {
    const text = data === undefined ? '' : JSON.stringify(data);
    const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
    return { ok: status >= 200 && status < 300, status, text: async () => text, headers: { get: (k) => h[String(k).toLowerCase()] || null } };
  }

  _page(list, query) {
    const per = this.pageSize || Number(query.get('per_page')) || 20;
    const page = Number(query.get('page')) || 1;
    const slice = list.slice((page - 1) * per, page * per);
    return this._respond(200, slice, { 'x-next-page': page * per < list.length ? page + 1 : '' });
  }

  _labelEdit(issue, body) {
    const split = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (body.add_labels !== undefined || body.remove_labels !== undefined) {
      const add = split(body.add_labels);
      const remove = split(body.remove_labels);
      const before = issue.labels.join(',');
      issue.labels = issue.labels.filter((l) => !remove.includes(l));
      for (const l of add) if (!issue.labels.includes(l)) issue.labels.push(l);
      if (issue.labels.join(',') !== before) issue.notes.push(this._note(this.botUser, 'changed labels', true));
    }
  }

  async fetch(input, init = {}) {
    const url = new URL(String(input));
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : {};
    const route = url.pathname.replace(/^\/api\/v4/, '');
    this.requests.push({ method, route, query: Object.fromEntries(url.searchParams), body });
    if ((init.headers || {})['PRIVATE-TOKEN'] !== this.token) return this._respond(401, { message: '401 Unauthorized' });
    const q = url.searchParams;
    const P = `/projects/${encodeURIComponent(this.project)}`;
    let m;

    if (route === '/user') return this._respond(200, this.user(this.botUser));
    if (route === '/users') {
      const u = this.users.get(q.get('username'));
      return this._respond(200, u ? [u] : []);
    }
    if (!route.startsWith(P)) return this._respond(404, { message: '404 Project Not Found' });
    const rest = route.slice(P.length);

    if (rest === '') {
      return this._respond(200, { id: 1, path_with_namespace: this.project, permissions: { project_access: { access_level: this.accessLevel }, group_access: null } });
    }
    if (rest === '/labels' && method === 'POST') {
      if (this.labels.has(body.name)) return this._respond(409, { message: 'Label already exists' });
      this.labels.add(body.name);
      return this._respond(201, { name: body.name });
    }
    if (rest === '/issues' && method === 'GET') {
      const want = String(q.get('labels') || '').split(',').filter(Boolean);
      const list = [...this.issues.values()]
        .filter((i) => (q.get('state') ? i.state === q.get('state') : true))
        .filter((i) => want.every((l) => i.labels.includes(l)))
        .map((i) => this._issueJson(i));
      return this._page(list, q);
    }
    if ((m = rest.match(/^\/issues\/(\d+)$/))) {
      const issue = this.issues.get(m[1]);
      if (!issue) return this._respond(404, { message: '404 Not found' });
      if (method === 'PUT') {
        this._labelEdit(issue, body);
        if (body.assignee_ids) {
          const ids = body.assignee_ids.filter((x) => x !== 0);
          issue.assignees = [...this.users.values()].filter((u) => ids.includes(u.id));
          issue.notes.push(this._note(this.botUser, 'changed assignee', true));
        }
        if (body.state_event === 'close') issue.state = 'closed';
      }
      return this._respond(200, this._issueJson(issue));
    }
    if ((m = rest.match(/^\/issues\/(\d+)\/notes$/))) {
      const issue = this.issues.get(m[1]);
      if (!issue) return this._respond(404, { message: '404 Not found' });
      if (method === 'POST') {
        const note = this._note(this.botUser, body.body);
        issue.notes.push(note);
        return this._respond(201, note);
      }
      return this._page(issue.notes, q);
    }
    if (rest === '/merge_requests' && method === 'POST') {
      const open = [...this.mrs.values()].find((x) => x.state === 'opened' && x.source_branch === body.source_branch);
      if (open) return this._respond(409, { message: [`Another open merge request already exists for this source branch: !${open.iid}`] });
      const iid = this.mrs.size + 1;
      const sha = this._head(body.source_branch) || `sha-${iid}`;
      const mr = {
        iid, title: body.title, description: body.description, state: 'opened', sha,
        source_branch: body.source_branch, target_branch: body.target_branch, squash: body.squash === true,
        has_conflicts: false, merge_status: 'can_be_merged', approved_by: [], notes: [],
        versions: [{ id: 1, head_commit_sha: sha, created_at: this._stamp() }],
      };
      this.mrs.set(String(iid), mr);
      return this._respond(201, this._mrJson(mr));
    }
    if (rest === '/merge_requests' && method === 'GET') {
      const list = [...this.mrs.values()]
        .filter((x) => (q.get('state') ? x.state === q.get('state') : true))
        .filter((x) => (q.get('source_branch') ? x.source_branch === q.get('source_branch') : true))
        .map((x) => this._mrJson(x));
      return this._page(list, q);
    }
    if ((m = rest.match(/^\/merge_requests\/(\d+)(\/[a-z_]+)?$/))) {
      const mr = this._synced(m[1]);
      if (!mr) return this._respond(404, { message: '404 Not found' });
      const sub = m[2] || '';
      if (sub === '' && method === 'GET') return this._respond(200, this._mrJson(mr));
      if (sub === '/approvals') return this._respond(200, { approved_by: mr.approved_by.map((u) => ({ user: this.user(u) })) });
      if (sub === '/notes') return this._page(mr.notes, q);
      if (sub === '/versions') return this._page(mr.versions, q);
      if (sub === '/merge' && method === 'PUT') {
        if (this.refuseMerge) return this._respond(405, { message: '405 Method Not Allowed' });
        if (mr.state !== 'opened') return this._respond(405, { message: '405 Method Not Allowed' });
        if (body.sha && body.sha !== mr.sha) return this._respond(409, { message: 'SHA does not match HEAD of source branch' });
        if (this.remote) {
          if (!this._merge(mr, body.squash === true)) {
            mr.has_conflicts = true;
            mr.merge_status = 'cannot_be_merged';
            return this._respond(422, { message: 'Branch cannot be merged' });
          }
        }
        mr.state = 'merged';
        mr.mergedWith = body;
        return this._respond(200, this._mrJson(mr));
      }
    }
    if ((m = rest.match(/^\/protected_branches\/(.+)$/))) {
      const name = decodeURIComponent(m[1]);
      return this.protectedBranches.has(name) ? this._respond(200, { name }) : this._respond(404, { message: '404 Not found' });
    }
    if (rest === '/approval_rules') {
      return this.approvalRules === null ? this._respond(404, { message: '404 Not found' }) : this._respond(200, this.approvalRules);
    }
    return this._respond(404, { message: `404 no fake route for ${method} ${route}` });
  }
}

module.exports = { FakeGitLab };
