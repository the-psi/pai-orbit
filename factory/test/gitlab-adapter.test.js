'use strict';
// Unit tests for the GitLab client, board and code host, against an in-memory GitLab
// (fake-gitlab.js). No network. The one real process is `git credential fill`, which proves the
// credential helper hands the token to git for the right site only.

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { GitLabApi, GitLabError, parseRepoUrl } = require('../src/gitlab-api');
const { GitLabBoard } = require('../src/boards/gitlab');
const { GitLabCodeHost } = require('../src/codehosts/gitlab');
const { fromObject } = require('../src/config');
const { preflight } = require('../src/preflight');
const { FakeGitLab } = require('./fake-gitlab');

const LABELS = {
  readyLabel: 'factory-ready', groomedLabel: 'factory-groomed', ownedLabel: 'factory-owned',
  waitingLabel: 'factory-waiting', declinedLabel: 'factory-declined', botUser: 'orbit-factory',
};

/** A clock that moves one second on every reading, so every timestamp is unique and ordered. */
function ticking(start = '2026-11-23T09:00:00.000Z') {
  let t = Date.parse(start);
  return () => { t += 1000; return new Date(t); };
}

function setup(opts = {}) {
  const gl = new FakeGitLab({ now: ticking(), ...opts });
  const api = new GitLabApi({ baseUrl: gl.site, project: gl.project, token: opts.badToken || gl.token, fetch: gl.fetch });
  const board = new GitLabBoard({ api, ...LABELS });
  const calls = [];
  const exec = async (command, args, o = {}) => {
    calls.push({ command, args, cwd: o.cwd });
    return { code: opts.gitExit || 0, stdout: '', stderr: opts.gitExit ? 'remote: rejected' : '', timedOut: false, aborted: false };
  };
  const host = new GitLabCodeHost({ api, mergeMethod: opts.mergeMethod || 'squash', exec });
  return { gl, api, board, host, calls };
}

// ---------------------------------------------------------------------------- client

test('parseRepoUrl reads the site and the project from every clone URL form', () => {
  assert.deepEqual(parseRepoUrl('https://git.example.com/grp/sub/app.git'), { baseUrl: 'https://git.example.com', project: 'grp/sub/app' });
  assert.deepEqual(parseRepoUrl('https://gitlab.com/grp/app'), { baseUrl: 'https://gitlab.com', project: 'grp/app' });
  assert.deepEqual(parseRepoUrl('http://git.local:8080/grp/app.git'), { baseUrl: 'http://git.local:8080', project: 'grp/app' });
  assert.deepEqual(parseRepoUrl('git@git.example.com:grp/sub/app.git'), { baseUrl: 'https://git.example.com', project: 'grp/sub/app' });
  assert.deepEqual(parseRepoUrl('ssh://git@git.example.com:2222/grp/app.git'), { baseUrl: 'https://git.example.com', project: 'grp/app' });
  assert.deepEqual(parseRepoUrl('https://user@git.example.com/grp/app.git/'), { baseUrl: 'https://git.example.com', project: 'grp/app' });
});

test('parseRepoUrl refuses a URL that names no project', () => {
  assert.throws(() => parseRepoUrl('https://git.example.com/app.git'), /does not name a GitLab project/);
  assert.throws(() => parseRepoUrl('/srv/repos/app.git'), /not a GitLab repository URL/);
  assert.throws(() => parseRepoUrl(''), /not a GitLab repository URL/);
});

test('the client accepts a site URL or an API URL and encodes the project path', () => {
  const noop = async () => ({});
  const a = new GitLabApi({ baseUrl: 'https://git.example.com/', project: 'grp/sub/app', token: 't', fetch: noop });
  const b = new GitLabApi({ baseUrl: 'https://host/gitlab/api/v4', project: 'grp/app', token: 't', fetch: noop });
  assert.equal(a.apiUrl, 'https://git.example.com/api/v4');
  assert.equal(a.siteUrl, 'https://git.example.com');
  assert.equal(a.p('/issues'), '/projects/grp%2Fsub%2Fapp/issues');
  assert.equal(b.apiUrl, 'https://host/gitlab/api/v4');
  assert.equal(b.siteUrl, 'https://host/gitlab');
});

test('a request without a token fails before anything is sent', async () => {
  let sent = 0;
  const api = new GitLabApi({ baseUrl: 'https://x.test', project: 'g/p', token: '', fetch: async () => { sent += 1; } });
  await assert.rejects(() => api.get('/user'), /No GitLab token is set/);
  assert.equal(sent, 0);
});

test('a refused request raises GitLabError with the status and never the token', async () => {
  const { api } = setup({ badToken: 'wrong-secret-token' });
  await assert.rejects(() => api.get('/user'), (err) => {
    assert.ok(err instanceof GitLabError);
    assert.equal(err.status, 401);
    assert.ok(!err.message.includes('wrong-secret-token'));
    return true;
  });
});

test('a network failure is reported as a GitLabError, not a crash', async () => {
  const api = new GitLabApi({ baseUrl: 'https://x.test', project: 'g/p', token: 't', fetch: async () => { throw new Error('ECONNREFUSED'); } });
  await assert.rejects(() => api.get('/user'), /did not complete: ECONNREFUSED/);
});

test('all() follows every page', async () => {
  const { gl, api } = setup({ pageSize: 2 });
  for (let i = 0; i < 5; i += 1) gl.addIssue();
  const issues = await api.all(api.p('/issues'), { state: 'opened' });
  assert.equal(issues.length, 5);
  assert.equal(gl.requests.filter((r) => r.route.endsWith('/issues')).length, 3);
});

// ---------------------------------------------------------------------------- board

test('listEligible: either start label, not owned, and assigned to nobody but the factory', async () => {
  const { gl, board } = setup();
  gl.addIssue({ labels: ['factory-ready'] }); // 1 yes
  gl.addIssue({ labels: ['factory-groomed'] }); // 2 yes
  gl.addIssue({ labels: ['factory-ready', 'factory-owned'] }); // 3 already owned
  gl.addIssue({ labels: ['factory-ready'], assignees: ['dev2'] }); // 4 someone is on it
  gl.addIssue({ labels: ['factory-ready'], assignees: ['orbit-factory'] }); // 5 yes
  gl.addIssue({ labels: ['bug'] }); // 6 not handed over
  gl.addIssue({ labels: ['factory-ready', 'factory-groomed'] }); // 7 yes, once
  const ids = (await board.listEligible()).map((t) => t.id).sort();
  assert.deepEqual(ids, ['1', '2', '5', '7']);
});

test('get maps a GitLab issue to a ticket', async () => {
  const { gl, board } = setup();
  gl.addIssue({ title: 'Add Spain', body: 'Tax 21%', labels: ['factory-ready', 'tax'], reporter: 'po' });
  assert.deepEqual(await board.get('1'), {
    id: '1', title: 'Add Spain', body: 'Tax 21%', labels: ['factory-ready', 'tax'], assignees: [],
    reporter: 'po', state: 'open', url: 'https://gitlab.test/grp/app/-/issues/1',
  });
});

test('claim adds the owned label, removes both start labels and assigns the factory', async () => {
  const { gl, board } = setup();
  gl.addIssue({ labels: ['factory-ready', 'factory-groomed', 'tax'] });
  await board.claim('1');
  const t = await board.get('1');
  assert.deepEqual(t.labels.sort(), ['factory-owned', 'tax']);
  assert.deepEqual(t.assignees, ['orbit-factory']);
});

test('release removes the factory labels and its assignment, and can mark the ticket declined', async () => {
  const { gl, board } = setup();
  gl.addIssue({ labels: ['factory-owned', 'factory-waiting'], assignees: ['orbit-factory', 'dev2'] });
  await board.release('1');
  let t = await board.get('1');
  assert.deepEqual(t.labels, []);
  assert.deepEqual(t.assignees, ['dev2'], 'another person stays assigned');

  gl.addIssue({ labels: ['factory-owned'], assignees: ['orbit-factory'] });
  await board.release('2', { declined: true });
  t = await board.get('2');
  assert.deepEqual(t.labels, ['factory-declined']);
  assert.deepEqual(t.assignees, []);
});

test('an unknown bot user is a clear error', async () => {
  const gl = new FakeGitLab();
  const api = new GitLabApi({ baseUrl: gl.site, project: gl.project, token: gl.token, fetch: gl.fetch });
  const board = new GitLabBoard({ api, ...LABELS, botUser: 'nobody-here' });
  gl.addIssue();
  await assert.rejects(() => board.claim('1'), /GitLab user "nobody-here" \(board.botUser\) was not found/);
});

test('comment posts a note and returns it with the server time', async () => {
  const { gl, board } = setup();
  gl.addIssue();
  const c = await board.comment('1', 'Line one\n\nLine two');
  assert.equal(c.author, 'orbit-factory');
  assert.equal(c.body, 'Line one\n\nLine two');
  assert.equal(c.createdAt, gl.issues.get('1').notes[0].created_at);
});

test('commentsSince returns people\'s comments after the time, oldest first, without system notes', async () => {
  const { gl, board } = setup();
  gl.addIssue();
  gl.issueComment('1', 'alice', 'before');
  const mark = gl.issues.get('1').notes[0].created_at;
  await board.setState('1', { waiting: true }); // GitLab writes a system note for the label change
  gl.issueComment('1', 'po', 'first');
  gl.issueComment('1', 'lead', 'second');
  const got = await board.commentsSince('1', mark);
  assert.deepEqual(got.map((c) => [c.author, c.body]), [['po', 'first'], ['lead', 'second']]);
});

test('setState adds and removes the waiting label and ignores a column', async () => {
  const { gl, board } = setup();
  gl.addIssue({ labels: ['factory-owned'] });
  await board.setState('1', { waiting: true });
  assert.ok((await board.get('1')).labels.includes('factory-waiting'));
  await board.setState('1', { waiting: false });
  assert.ok(!(await board.get('1')).labels.includes('factory-waiting'));
  const before = gl.requests.length;
  await board.setState('1', { column: 'In review' });
  assert.equal(gl.requests.length, before, 'a column move makes no request');
});

test('close closes the issue; ensureLabels can run twice', async () => {
  const { gl, board } = setup();
  gl.addIssue();
  await board.close('1');
  assert.equal((await board.get('1')).state, 'closed');
  await board.ensureLabels();
  await board.ensureLabels();
  assert.deepEqual([...gl.labels].sort(), ['factory-declined', 'factory-groomed', 'factory-owned', 'factory-ready', 'factory-waiting']);
});

test('an issue number that is not a number is refused before any request', async () => {
  const { gl, board } = setup();
  await assert.rejects(() => board.get('1/../../users'), /Invalid GitLab issue number/);
  assert.equal(gl.requests.length, 0);
});

// ---------------------------------------------------------------------------- code host

test('the credential helper gives git the token for the GitLab site, and only for it', () => {
  const api = new GitLabApi({ baseUrl: 'https://git.example.com', project: 'g/p', token: 't', fetch: async () => ({}) });
  const host = new GitLabCodeHost({ api });
  const args = host.gitAuthArgs();
  assert.ok(!args.join(' ').includes('s3cret'), 'the token is never an argument');
  const env = { ...process.env, GITLAB_TOKEN: 's3cret-token', GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', SSH_ASKPASS: '' };
  const fill = (hostName) => {
    try {
      return execFileSync('git', [...args, 'credential', 'fill'], {
        input: `protocol=https\nhost=${hostName}\n\n`, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'],
      });
    } catch (err) {
      return String(err.stdout || '');
    }
  };
  const ours = fill('git.example.com');
  assert.match(ours, /username=oauth2/);
  assert.match(ours, /password=s3cret-token/);
  assert.ok(!fill('other.example.com').includes('s3cret-token'), 'another site does not get the token');
});

test('a token variable name that is not a plain name is refused', () => {
  const api = new GitLabApi({ baseUrl: 'https://x.test', project: 'g/p', token: 't', fetch: async () => ({}) });
  assert.throws(() => new GitLabCodeHost({ api, tokenEnv: 'X; rm -rf /' }), /Invalid token variable name/);
  assert.throws(() => new GitLabCodeHost({ api, mergeMethod: 'rebase' }), /Unknown mergeMethod "rebase" for GitLab/);
});

test('push force-pushes a ticket branch with lease and pushes the base branch plainly', async () => {
  const { host, calls } = setup();
  await host.push('/work/7', 'factory/7-fix');
  await host.push('/work/7', 'main', { shared: true });
  await host.pushTags('/work/7');
  const tail = (c) => c.args.slice(host.gitAuthArgs().length);
  assert.deepEqual(tail(calls[0]), ['push', '--force-with-lease', 'origin', 'factory/7-fix:factory/7-fix']);
  assert.deepEqual(tail(calls[1]), ['push', 'origin', 'main:main']);
  assert.deepEqual(tail(calls[2]), ['push', 'origin', '--tags']);
  assert.equal(calls[0].cwd, '/work/7');
  await assert.rejects(() => host.push('/work/7', '--upload-pack=evil'), /Invalid branch name/);
});

test('a refused push is an error that carries git\'s message', async () => {
  const { host } = setup({ gitExit: 1 });
  await assert.rejects(() => host.push('/work/7', 'factory/7-fix'), /git push origin factory\/7-fix failed \(exit 1\): remote: rejected/);
});

test('openPr opens a merge request, and returns the open one when it already exists', async () => {
  const { gl, host } = setup();
  const pr = { branch: 'factory/7-fix', base: 'main', title: 'Fix (#7)', body: 'Ticket: #7' };
  const first = await host.openPr(pr);
  assert.deepEqual(first, { id: '1', url: 'https://gitlab.test/grp/app/-/merge_requests/1' });
  const sent = gl.requests.find((r) => r.method === 'POST' && r.route.endsWith('/merge_requests')).body;
  assert.equal(sent.source_branch, 'factory/7-fix');
  assert.equal(sent.target_branch, 'main');
  assert.equal(sent.squash, true);
  assert.equal(sent.remove_source_branch, true);
  assert.deepEqual(await host.openPr(pr), first, 'a second call finds the same merge request');
  assert.equal(gl.mrs.size, 1);
});

test('prStatus: an approval counts for the commit the merge request had when it was given', async () => {
  const { gl, host } = setup();
  await host.openPr({ branch: 'b', base: 'main', title: 't', body: '' });
  const mr = gl.mrs.get('1');
  let s = await host.prStatus('1');
  assert.deepEqual(s, { state: 'open', headSha: 'sha-1', mergeable: true, reviews: [] });

  gl.approve('1', 'lead');
  s = await host.prStatus('1');
  assert.equal(s.reviews.length, 1);
  assert.deepEqual([s.reviews[0].author, s.reviews[0].state, s.reviews[0].sha], ['lead', 'approved', 'sha-1']);

  // A new commit arrives after the approval: the approval still names the old commit.
  mr.sha = 'sha-2';
  mr.versions.unshift({ id: 2, head_commit_sha: 'sha-2', created_at: gl._stamp() });
  s = await host.prStatus('1');
  assert.equal(s.headSha, 'sha-2');
  assert.equal(s.reviews[0].sha, 'sha-1', 'an approval of the old commit is not an approval of the new one');

  // Approving again after the push names the new commit.
  gl.unapprove('1', 'lead');
  gl.approve('1', 'lead');
  s = await host.prStatus('1');
  assert.equal(s.reviews.find((r) => r.state === 'approved').sha, 'sha-2');
});

test('prStatus: a withdrawn approval is gone, and an approval with no note does not count', async () => {
  const { gl, host } = setup();
  await host.openPr({ branch: 'b', base: 'main', title: 't', body: '' });
  gl.approve('1', 'lead');
  gl.unapprove('1', 'lead');
  assert.deepEqual((await host.prStatus('1')).reviews, []);

  gl.mrs.get('1').approved_by.push('dev2'); // approved, but GitLab shows no note for it
  const s = await host.prStatus('1');
  assert.deepEqual([s.reviews[0].author, s.reviews[0].sha], ['dev2', ''], 'no commit can be established, so it carries none');
});

test('prStatus: a comment that starts with reject sends the work back; other comments do not', async () => {
  const { gl, host } = setup();
  await host.openPr({ branch: 'b', base: 'main', title: 't', body: '' });
  gl.mrComment('1', 'dev2', 'Looks fine to me, small nit on naming.');
  gl.mrComment('1', 'orbit-factory', 'reject this is the factory quoting someone\n\n<!-- orbit-factory -->');
  gl.mrComment('1', 'lead', '> quoted text\n\nreject: the rate must come from config\nand add a test');
  const s = await host.prStatus('1');
  assert.equal(s.reviews.length, 1);
  assert.deepEqual([s.reviews[0].author, s.reviews[0].state, s.reviews[0].sha], ['lead', 'changes_requested', 'sha-1']);
  assert.equal(s.reviews[0].body, 'the rate must come from config\nand add a test');
});

test('prStatus maps merge request states and the conflict check', async () => {
  const { gl, host } = setup();
  await host.openPr({ branch: 'b', base: 'main', title: 't', body: '' });
  const mr = gl.mrs.get('1');
  mr.merge_status = 'checking';
  assert.equal((await host.prStatus('1')).mergeable, null, 'GitLab has not decided yet');
  mr.merge_status = 'cannot_be_merged';
  mr.has_conflicts = true;
  assert.equal((await host.prStatus('1')).mergeable, false);
  mr.state = 'merged';
  assert.equal((await host.prStatus('1')).state, 'merged');
  mr.state = 'closed';
  assert.equal((await host.prStatus('1')).state, 'closed');
  mr.state = 'weird';
  await assert.rejects(() => host.prStatus('1'), /unknown merge request state/);
});

test('merge sends the head it checked, and squashes when the method is squash', async () => {
  const { gl, host } = setup();
  await host.openPr({ branch: 'b', base: 'main', title: 't', body: '' });
  await host.merge('1');
  const mr = gl.mrs.get('1');
  assert.equal(mr.state, 'merged');
  assert.deepEqual(mr.mergedWith, { sha: 'sha-1', squash: true, should_remove_source_branch: true });

  const plain = setup({ mergeMethod: 'merge' });
  await plain.host.openPr({ branch: 'b', base: 'main', title: 't', body: '' });
  await plain.host.merge('1');
  assert.equal(plain.gl.mrs.get('1').mergedWith.squash, false);
});

test('a merge GitLab refuses is an error and is never forced', async () => {
  const { gl, host } = setup();
  await host.openPr({ branch: 'b', base: 'main', title: 't', body: '' });
  gl.refuseMerge = true;
  await assert.rejects(() => host.merge('1'), (err) => {
    assert.match(err.message, /GitLab refused to merge merge request 1/);
    assert.notEqual(err.conflict, true);
    return true;
  });
  assert.equal(gl.mrs.get('1').state, 'opened');
  assert.equal(gl.requests.filter((r) => r.route.endsWith('/merge')).length, 1, 'no second attempt');

  gl.mrs.get('1').has_conflicts = true;
  await assert.rejects(() => host.merge('1'), (err) => err.conflict === true, 'a conflict is marked, so the ticket is reworked');
});

test('baseProtected: not protected, protected with required approvals, protected but unconfirmed', async () => {
  const { gl, host } = setup();
  assert.equal(await host.baseProtected('main'), false);
  gl.protectedBranches.add('main');
  assert.equal(await host.baseProtected('main'), null, 'free tier: no approval rules to read');
  gl.approvalRules = [{ name: 'All', approvals_required: 0 }];
  assert.equal(await host.baseProtected('main'), null);
  gl.approvalRules = [{ name: 'Leads', approvals_required: 1 }];
  assert.equal(await host.baseProtected('main'), true);
});

test('checkAccess reports who the token is and refuses too little access', async () => {
  let s = setup();
  assert.deepEqual(await s.host.checkAccess(), { ok: true, user: 'orbit-factory', detail: 'orbit-factory on grp/app, access level 40' });
  s = setup({ accessLevel: 20 });
  const low = await s.host.checkAccess();
  assert.equal(low.ok, false);
  assert.match(low.detail, /access level 20.*needs Developer/);
  s = setup({ badToken: 'nope' });
  const bad = await s.host.checkAccess();
  assert.equal(bad.ok, false);
  assert.match(bad.detail, /token was not accepted/);
});

// ---------------------------------------------------------------------------- config and preflight

const BASE = { repo: { url: 'https://git.example.com/grp/app.git' }, roles: { mergeApprover: ['lead'], releaseApprover: ['rel'] } };

test('config accepts gitlab and validates its settings', () => {
  const cfg = fromObject({ ...BASE, board: { type: 'gitlab' }, codeHost: { type: 'gitlab' } });
  assert.equal(cfg.gitlab.tokenEnv, 'GITLAB_TOKEN');
  assert.throws(() => fromObject({ ...BASE, codeHost: { type: 'gitlab', mergeMethod: 'rebase' } }), /mergeMethod must be squash or merge for GitLab/);
  assert.throws(() => fromObject({ ...BASE, board: { type: 'gitlab' }, gitlab: { tokenEnv: 'bad name' } }), /gitlab.tokenEnv must be the name/);
  assert.throws(() => fromObject({ ...BASE, board: { type: 'gitlab' }, gitlab: { apiUrl: 'https://h/gitlab/api/v4' } }), /must be set together/);
  assert.throws(() => fromObject({ ...BASE, board: { type: 'bitbucket' } }), /board.type must be local, github or gitlab/);
});

function preflightExec() {
  const calls = [];
  const exec = async (command, args) => {
    calls.push({ command, args });
    const out = args.includes('ls-remote') ? 'abc\trefs/heads/main\n' : 'ok';
    return { code: 0, stdout: out, stderr: '', timedOut: false, aborted: false };
  };
  return { exec, calls };
}

test('preflight: GitLab access is checked with the token, and the repository is listed with credentials', async () => {
  const cfg = fromObject({ ...BASE, board: { type: 'gitlab', botUser: 'orbit-factory' }, codeHost: { type: 'gitlab' }, runner: { type: 'fake' } });
  const { host } = setup();
  const { exec, calls } = preflightExec();
  const report = await preflight(cfg, { env: { GITLAB_TOKEN: 'x' }, exec, codeHost: host });
  const by = Object.fromEntries(report.checks.map((c) => [c.name, c]));
  assert.equal(by['GitLab access'].level, 'ok');
  assert.equal(by['GitLab identity'], undefined);
  assert.ok(!by['GitHub access'], 'gh is not asked about a GitLab project');
  const ls = calls.find((c) => c.args.includes('ls-remote'));
  assert.deepEqual(ls.args.slice(0, host.gitAuthArgs().length), host.gitAuthArgs());
});

test('preflight fails when the token is missing, too weak, or belongs to another account', async () => {
  const mk = (botUser) => fromObject({ ...BASE, board: { type: 'gitlab', botUser }, codeHost: { type: 'gitlab' }, runner: { type: 'fake' } });
  const level = async (cfg, env, host) => {
    const report = await preflight(cfg, { env, exec: preflightExec().exec, codeHost: host });
    return { ok: report.ok, by: Object.fromEntries(report.checks.map((c) => [c.name, c])) };
  };
  let r = await level(mk('orbit-factory'), {}, setup().host);
  assert.equal(r.by['GitLab access'].level, 'fail');
  assert.match(r.by['GitLab access'].detail, /GITLAB_TOKEN is not set/);

  r = await level(mk('orbit-factory'), { GITLAB_TOKEN: 'x' }, setup({ accessLevel: 10 }).host);
  assert.equal(r.by['GitLab access'].level, 'fail');

  r = await level(mk('someone-else'), { GITLAB_TOKEN: 'x' }, setup().host);
  assert.equal(r.by['GitLab identity'].level, 'fail');
  assert.match(r.by['GitLab identity'].detail, /token belongs to orbit-factory, but board.botUser is someone-else/);
  assert.equal(r.ok, false);
});
