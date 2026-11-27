'use strict';
// Unit tests for the GitHub code host. No gh or git process is started: a fake exec records every
// call and answers from canned results.

const test = require('node:test');
const assert = require('node:assert/strict');
const { GitHubCodeHost } = require('../src/codehosts/github');

const REPO = 'acme/widgets';

/** True when `tokens` appear in `args` as a consecutive run. */
function seq(...tokens) {
  return (command, args) => {
    for (let i = 0; i + tokens.length <= args.length; i += 1) {
      if (tokens.every((t, j) => args[i + j] === t)) return true;
    }
    return false;
  };
}

/** routes: [matcher(command, args), result | (command, args, opts) => result][] — first match wins. */
function fakeExec(routes = []) {
  const calls = [];
  const exec = async (command, args, opts = {}) => {
    calls.push({ command, args, input: opts.input, cwd: opts.cwd });
    for (const [match, result] of routes) {
      if (match(command, args)) {
        const r = typeof result === 'function' ? result(command, args, opts) : result;
        return { code: 0, stdout: '', stderr: '', timedOut: false, aborted: false, ...r };
      }
    }
    return { code: 0, stdout: '', stderr: '', timedOut: false, aborted: false };
  };
  return { exec, calls };
}

function host(routes, mergeMethod = 'squash') {
  const fake = fakeExec(routes);
  const h = new GitHubCodeHost({ repo: REPO, mergeMethod, exec: fake.exec });
  return { h, calls: fake.calls };
}

const AUTH = ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential'];

test('gitAuthArgs clears inherited helpers, then uses gh', () => {
  const { h, calls } = host();
  assert.deepEqual(h.gitAuthArgs(), AUTH);
  assert.equal(calls.length, 0);
});

test('the constructor rejects an unknown merge method', () => {
  assert.throws(() => new GitHubCodeHost({ repo: REPO, mergeMethod: 'admin' }), /Unknown mergeMethod/);
});

test('push runs git with the auth args in the clone directory', async () => {
  const { h, calls } = host();
  await h.push('/work/t-7', 'factory/7-fix');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'git');
  assert.deepEqual(calls[0].args, [...AUTH, 'push', '--force-with-lease', 'origin', 'factory/7-fix:factory/7-fix']);
  assert.equal(calls[0].cwd, '/work/t-7');
  assert.ok(!calls[0].args.includes('--force'));
});

test('a failing push throws an Error that names the command', async () => {
  const { h } = host([[(command) => command === 'git', { code: 1, stderr: '! [rejected] (stale info)' }]]);
  await assert.rejects(() => h.push('/work/t-7', 'factory/7-fix'), (err) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /git push origin factory\/7-fix failed \(exit 1\)/);
    assert.match(err.message, /stale info/);
    return true;
  });
});

test('openPr creates the PR with the body on stdin and returns its number and URL', async () => {
  const body = '## Summary\n\n- multi-line\n- markdown';
  const url = `https://github.com/${REPO}/pull/42`;
  const { h, calls } = host([[seq('pr', 'create'), { stdout: `${url}\n` }]]);
  const pr = await h.openPr({ branch: 'factory/7-fix', base: 'main', title: 'Fix the widget', body });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'gh');
  assert.deepEqual(calls[0].args, [
    'pr', 'create', '--repo', REPO, '--head', 'factory/7-fix', '--base', 'main',
    '--title', 'Fix the widget', '--body-file', '-',
  ]);
  assert.equal(calls[0].input, body);
  assert.ok(!calls[0].args.some((a) => a.includes('Summary')));
  assert.deepEqual(pr, { id: '42', url });
});

test('openPr takes the PR URL even when gh prints other lines first', async () => {
  const url = `https://github.com/${REPO}/pull/43`;
  const { h } = host([[seq('pr', 'create'), { stdout: `Creating pull request for factory/7-fix into main\n\n${url}\n` }]]);
  assert.deepEqual(await h.openPr({ branch: 'factory/7-fix', base: 'main', title: 't', body: 'b' }), { id: '43', url });
});

test('openPr falls back to the existing PR when one already exists for the head', async () => {
  const url = `https://github.com/${REPO}/pull/40`;
  const { h, calls } = host([
    [seq('pr', 'create'), {
      code: 1,
      stderr: `a pull request for branch "factory/7-fix" into branch "main" already exists:\n${url}\n`,
    }],
    [seq('pr', 'list'), { stdout: JSON.stringify([{ number: 40, url }]) }],
  ]);
  const pr = await h.openPr({ branch: 'factory/7-fix', base: 'main', title: 't', body: 'b' });
  assert.deepEqual(pr, { id: '40', url });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].args, [
    'pr', 'list', '--repo', REPO, '--head', 'factory/7-fix', '--state', 'open', '--json', 'number,url',
  ]);
});

test('openPr fails when gh says a PR exists but the lookup finds none', async () => {
  const { h } = host([
    [seq('pr', 'create'), { code: 1, stderr: 'a pull request for branch "x" into branch "main" already exists' }],
    [seq('pr', 'list'), { stdout: '[]' }],
  ]);
  await assert.rejects(() => h.openPr({ branch: 'x', base: 'main', title: 't', body: 'b' }), /already exists.*found none/);
});

test('openPr surfaces any other gh failure as an Error that names the command', async () => {
  const { h, calls } = host([[seq('pr', 'create'), { code: 1, stderr: 'GraphQL: No commits between main and x' }]]);
  await assert.rejects(() => h.openPr({ branch: 'x', base: 'main', title: 't', body: 'b' }), (err) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /gh pr create/);
    assert.match(err.message, /No commits between/);
    return true;
  });
  assert.equal(calls.length, 1);
});

function prJson(extra = {}) {
  return JSON.stringify({ state: 'OPEN', headRefOid: 'abc123', mergeable: 'MERGEABLE', reviews: [], ...extra });
}

test('prStatus asks gh for the four fields', async () => {
  const { h, calls } = host([[seq('pr', 'view'), { stdout: prJson() }]]);
  const status = await h.prStatus('42');
  assert.deepEqual(calls[0].args, ['pr', 'view', '42', '--repo', REPO, '--json', 'state,headRefOid,mergeable,reviews']);
  assert.deepEqual(status, { state: 'open', headSha: 'abc123', mergeable: true, reviews: [] });
});

test('prStatus maps every state', async () => {
  for (const [gh, mapped] of [['OPEN', 'open'], ['MERGED', 'merged'], ['CLOSED', 'closed']]) {
    const { h } = host([[seq('pr', 'view'), { stdout: prJson({ state: gh }) }]]);
    assert.equal((await h.prStatus('42')).state, mapped);
  }
});

test('prStatus maps every mergeable value', async () => {
  const cases = [['MERGEABLE', true], ['CONFLICTING', false], ['UNKNOWN', null], ['', null], [undefined, null]];
  for (const [gh, mapped] of cases) {
    const { h } = host([[seq('pr', 'view'), { stdout: prJson({ mergeable: gh }) }]]);
    assert.equal((await h.prStatus('42')).mergeable, mapped, `mergeable ${gh}`);
  }
});

test('prStatus maps reviews oldest first and drops DISMISSED and PENDING', async () => {
  const reviews = [
    { author: { login: 'carol' }, state: 'COMMENTED', body: 'nit', submittedAt: '2026-03-03T09:00:00Z', commit: { oid: 'sha3' } },
    { author: { login: 'alice' }, state: 'CHANGES_REQUESTED', body: 'please fix', submittedAt: '2026-03-01T09:00:00Z', commit: { oid: 'sha1' } },
    { author: { login: 'eve' }, state: 'DISMISSED', body: 'was approved', submittedAt: '2026-03-01T12:00:00Z', commit: { oid: 'sha1' } },
    { author: { login: 'alice' }, state: 'APPROVED', body: '', submittedAt: '2026-03-02T09:00:00Z', commit: { oid: 'sha2' } },
    { author: { login: 'dave' }, state: 'PENDING', body: 'draft', submittedAt: null, commit: { oid: 'sha2' } },
  ];
  const { h } = host([[seq('pr', 'view'), { stdout: prJson({ reviews }) }]]);
  const status = await h.prStatus('42');
  assert.deepEqual(status.reviews, [
    { author: 'alice', state: 'changes_requested', sha: 'sha1', body: 'please fix', submittedAt: '2026-03-01T09:00:00Z' },
    { author: 'alice', state: 'approved', sha: 'sha2', body: '', submittedAt: '2026-03-02T09:00:00Z' },
    { author: 'carol', state: 'commented', sha: 'sha3', body: 'nit', submittedAt: '2026-03-03T09:00:00Z' },
  ]);
});

test('prStatus surfaces a failing gh call as an Error that names the command', async () => {
  const { h } = host([[seq('pr', 'view'), { code: 1, stderr: 'GraphQL: Could not resolve to a PullRequest' }]]);
  await assert.rejects(() => h.prStatus('999'), (err) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /gh pr view 999 failed \(exit 1\)/);
    assert.match(err.message, /Could not resolve to a PullRequest/);
    return true;
  });
});

test('merge uses the configured method and never bypasses protection', async () => {
  for (const method of ['squash', 'merge', 'rebase']) {
    const { h, calls } = host([], method);
    await h.merge('42');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, 'gh');
    assert.deepEqual(calls[0].args, ['pr', 'merge', '42', '--repo', REPO, `--${method}`]);
    assert.ok(!calls[0].args.includes('--admin'));
    assert.ok(!calls[0].args.includes('--auto'));
  }
});

test('a refused merge throws and is not retried with stronger flags', async () => {
  const { h, calls } = host([[seq('pr', 'merge'), { code: 1, stderr: 'Pull request is not mergeable: the base branch policy prohibits the merge' }]]);
  await assert.rejects(() => h.merge('42'), /gh pr merge 42 failed/);
  assert.equal(calls.length, 1);
  assert.ok(!calls.some((c) => c.args.includes('--admin')));
});

test('baseProtected is true when the branch requires pull request reviews', async () => {
  const protection = { required_pull_request_reviews: { required_approving_review_count: 1 }, enforce_admins: { enabled: true } };
  const { h, calls } = host([[seq('api'), { stdout: JSON.stringify(protection) }]]);
  assert.equal(await h.baseProtected('main'), true);
  assert.deepEqual(calls[0].args, ['api', `repos/${REPO}/branches/main/protection`]);
});

test('baseProtected is false when protection exists without required reviews', async () => {
  const { h } = host([[seq('api'), { stdout: JSON.stringify({ required_status_checks: { strict: true } }) }]]);
  assert.equal(await h.baseProtected('main'), false);
});

test('baseProtected is false when the branch is not protected (404)', async () => {
  const { h } = host([[seq('api'), {
    code: 1,
    stdout: '{"message":"Branch not protected","status":"404"}',
    stderr: 'gh: Branch not protected (HTTP 404)',
  }]]);
  assert.equal(await h.baseProtected('main'), false);
});

test('baseProtected is null for any other failure', async () => {
  const forbidden = host([[seq('api'), { code: 1, stderr: 'gh: Resource not accessible by integration (HTTP 403)' }]]);
  assert.equal(await forbidden.h.baseProtected('main'), null);
  const network = host([[seq('api'), { code: 1, stderr: 'error connecting to api.github.com' }]]);
  assert.equal(await network.h.baseProtected('main'), null);
  const garbage = host([[seq('api'), { stdout: 'not json' }]]);
  assert.equal(await garbage.h.baseProtected('main'), null);
});

test('ids and branch names that could be read as flags are refused before any call', async () => {
  const { h, calls } = host();
  await assert.rejects(() => h.merge('--admin'), /Invalid GitHub pull request number/);
  await assert.rejects(() => h.prStatus('42 --admin'), /Invalid GitHub pull request number/);
  await assert.rejects(() => h.push('/work', '--mirror'), /Invalid branch name/);
  assert.equal(calls.length, 0);
});
