'use strict';
// Unit tests for src/preflight.js with a fake `exec`: no git, gh or agent CLI is started.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fromObject } = require('../src/config');
const { preflight } = require('../src/preflight');

const URL = 'https://example.invalid/acme/app.git';
// PATH is empty so the agent command is never resolved against this machine.
const ENV = { PATH: '', ANTHROPIC_API_KEY: 'test-key' };

function config(over = {}) {
  return fromObject({
    repo: { url: URL, baseBranch: 'main' },
    roles: { mergeApprover: ['lead'], releaseApprover: ['rel'] },
    ...over,
  });
}

const okRes = (stdout = '') => ({ code: 0, stdout, stderr: '', timedOut: false, aborted: false });
const failRes = (stderr = 'failed') => ({ code: 1, stdout: '', stderr, timedOut: false, aborted: false });

/**
 * A fake exec. `over` replaces the answer of one step: gitVersion, lsRemote, cli, gh.
 * Records every call.
 */
function fakeExec(over = {}) {
  const calls = [];
  const exec = async (command, args, opts) => {
    calls.push({ command, args, opts });
    if (command === 'git' && args[0] === '--version') return over.gitVersion || okRes('git version 2.47.0\n');
    if (command === 'git' && args[0] === 'ls-remote') return over.lsRemote || okRes('abc123\trefs/heads/main\n');
    if (command === 'gh') return over.gh || okRes('Logged in');
    if (args[0] === '--version') return over.cli || okRes('2.1.308 (Claude Code)\n');
    throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
  };
  exec.calls = calls;
  return exec;
}

function check(report, name) {
  const found = report.checks.filter((c) => c.name === name);
  assert.equal(found.length, 1, `expected exactly one "${name}" check, got ${JSON.stringify(report.checks.map((c) => c.name))}`);
  return found[0];
}

function has(report, name) {
  return report.checks.some((c) => c.name === name);
}

test('all good: ok is true and no check fails', async () => {
  const exec = fakeExec();
  const report = await preflight(config(), { env: ENV, exec, codeHost: { baseProtected: async () => true } });
  assert.equal(report.ok, true);
  assert.deepEqual(report.checks.filter((c) => c.level !== 'ok'), []);
  assert.equal(check(report, 'git').detail, 'git version 2.47.0');
  assert.equal(check(report, 'repository').level, 'ok');
  assert.equal(check(report, 'plugin').level, 'ok');
  assert.equal(check(report, 'agent CLI').level, 'ok');
  assert.equal(check(report, 'model credential').level, 'ok');
  assert.equal(check(report, 'branch protection').level, 'ok');
  for (const c of report.checks) {
    assert.ok(['ok', 'warn', 'fail'].includes(c.level));
    assert.equal(typeof c.detail, 'string');
  }
});

test('the repository check asks for the configured URL and base branch', async () => {
  const exec = fakeExec();
  await preflight(config({ repo: { url: URL, baseBranch: 'develop' } }), { env: ENV, exec });
  const ls = exec.calls.find((c) => c.command === 'git' && c.args[0] === 'ls-remote');
  assert.ok(ls.args.includes(URL));
  assert.ok(ls.args.includes('develop'));
  assert.ok(ls.opts.timeoutMs > 0, 'a remote that hangs cannot hang preflight');
  for (const c of exec.calls) assert.equal(c.opts.env, ENV, 'the given environment is used for every command');
});

test('git missing: fail', async () => {
  const exec = fakeExec({ gitVersion: { code: null, stdout: '', stderr: 'spawn git ENOENT', timedOut: false, aborted: false } });
  const report = await preflight(config(), { env: ENV, exec });
  assert.equal(report.ok, false);
  assert.equal(check(report, 'git').level, 'fail');
  assert.match(check(report, 'git').detail, /not installed/);
});

test('unreachable repository: fail, naming the URL', async () => {
  const exec = fakeExec({ lsRemote: { code: 128, stdout: '', stderr: 'fatal: could not read from remote repository', timedOut: false, aborted: false } });
  const report = await preflight(config(), { env: ENV, exec });
  assert.equal(report.ok, false);
  const c = check(report, 'repository');
  assert.equal(c.level, 'fail');
  assert.ok(c.detail.includes(URL));
  assert.match(c.detail, /cannot reach/);
});

test('repository check that times out: fail', async () => {
  const exec = fakeExec({ lsRemote: { code: null, stdout: '', stderr: '', timedOut: true, aborted: false } });
  const report = await preflight(config(), { env: ENV, exec });
  assert.equal(report.ok, false);
  assert.equal(check(report, 'repository').level, 'fail');
});

test('base branch not found: fail, naming the branch', async () => {
  for (const stdout of ['', '\n', '  \n']) {
    const exec = fakeExec({ lsRemote: okRes(stdout) });
    const report = await preflight(config({ repo: { url: URL, baseBranch: 'release-9' } }), { env: ENV, exec });
    assert.equal(report.ok, false);
    const c = check(report, 'repository');
    assert.equal(c.level, 'fail');
    assert.match(c.detail, /base branch release-9 not found/);
  }
});

test('missing plugin manifest: fail, naming the plugin directory', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-factory-unit-preflight-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  const report = await preflight(config({ runner: { pluginDir: dir } }), { env: ENV, exec: fakeExec() });
  assert.equal(report.ok, false);
  const c = check(report, 'plugin');
  assert.equal(c.level, 'fail');
  assert.ok(c.detail.includes(dir));
});

test('a plugin directory with a manifest passes', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-factory-unit-preflight-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  fs.mkdirSync(path.join(dir, '.claude-plugin'));
  fs.writeFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), '{"name":"pai-orbit"}');
  const report = await preflight(config({ runner: { pluginDir: dir } }), { env: ENV, exec: fakeExec() });
  assert.equal(check(report, 'plugin').level, 'ok');
  assert.equal(report.ok, true);
});

test('agent CLI that cannot run: fail, naming the command', async () => {
  const exec = fakeExec({ cli: { code: null, stdout: '', stderr: 'spawn my-claude ENOENT', timedOut: false, aborted: false } });
  const report = await preflight(config({ runner: { command: 'my-claude' } }), { env: ENV, exec });
  assert.equal(report.ok, false);
  const c = check(report, 'agent CLI');
  assert.equal(c.level, 'fail');
  assert.ok(c.detail.includes('my-claude'));
  assert.ok(exec.calls.some((call) => call.command === 'my-claude' && call.args[0] === '--version'));
});

for (const [value, level] of [[true, 'ok'], [false, 'fail'], [null, 'warn']]) {
  test(`codeHost.baseProtected ${String(value)}: branch protection is ${level}`, async () => {
    const asked = [];
    const codeHost = { baseProtected: async (branch) => { asked.push(branch); return value; } };
    const report = await preflight(config(), { env: ENV, exec: fakeExec(), codeHost });
    const c = check(report, 'branch protection');
    assert.equal(c.level, level);
    assert.ok(c.detail.includes('main'));
    assert.deepEqual(asked, ['main']);
    assert.equal(report.ok, level !== 'fail');
  });
}

test('codeHost.baseProtected that throws: warn, not a crash', async () => {
  const codeHost = { baseProtected: async () => { throw new Error('403 forbidden'); } };
  const report = await preflight(config(), { env: ENV, exec: fakeExec(), codeHost });
  assert.equal(check(report, 'branch protection').level, 'warn');
  assert.equal(report.ok, true);
});

test('no code host given: no branch protection check', async () => {
  const report = await preflight(config(), { env: ENV, exec: fakeExec() });
  assert.equal(has(report, 'branch protection'), false);
});

test('fake runner: warn, and no plugin, CLI or credential check', async () => {
  const exec = fakeExec();
  const report = await preflight(config({ runner: { type: 'fake' } }), { env: { PATH: '' }, exec });
  const c = check(report, 'runner');
  assert.equal(c.level, 'warn');
  assert.match(c.detail, /fake runner/);
  assert.equal(report.ok, true, 'a warning does not stop the factory');
  assert.equal(has(report, 'plugin'), false);
  assert.equal(has(report, 'agent CLI'), false);
  assert.equal(has(report, 'model credential'), false);
  assert.deepEqual(exec.calls.map((call) => call.command), ['git', 'git'], 'the agent CLI is not started');
});

test('only CLAUDE_CODE_OAUTH_TOKEN: warn mentioning the subscription', async () => {
  const report = await preflight(config(), { env: { PATH: '', CLAUDE_CODE_OAUTH_TOKEN: 'oauth-value-9' }, exec: fakeExec() });
  const c = check(report, 'model credential');
  assert.equal(c.level, 'warn');
  assert.match(c.detail, /subscription/);
  assert.ok(!c.detail.includes('oauth-value-9'), 'the token itself is never printed');
  assert.equal(report.ok, true);
});

test('no credential: warn', async () => {
  const report = await preflight(config(), { env: { PATH: '' }, exec: fakeExec() });
  const c = check(report, 'model credential');
  assert.equal(c.level, 'warn');
  assert.match(c.detail, /no credential/);
  assert.equal(report.ok, true);
});

for (const name of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX']) {
  test(`${name} counts as an API credential`, async () => {
    const report = await preflight(config(), { env: { PATH: '', [name]: 'value-1', CLAUDE_CODE_OAUTH_TOKEN: 'tok' }, exec: fakeExec() });
    const c = check(report, 'model credential');
    assert.equal(c.level, 'ok');
    assert.ok(!c.detail.includes('value-1'), 'the credential itself is never printed');
  });
}

test('GitHub board or code host: gh must be authenticated', async () => {
  for (const over of [{ board: { type: 'github' } }, { codeHost: { type: 'github' } }]) {
    const good = await preflight(config(over), { env: ENV, exec: fakeExec() });
    assert.equal(check(good, 'GitHub access').level, 'ok');
    assert.equal(good.ok, true);
    const bad = await preflight(config(over), { env: ENV, exec: fakeExec({ gh: failRes('not logged in') }) });
    assert.equal(check(bad, 'GitHub access').level, 'fail');
    assert.equal(bad.ok, false);
  }
});

test('local board and code host: gh is not consulted', async () => {
  const exec = fakeExec();
  const report = await preflight(config(), { env: ENV, exec });
  assert.equal(has(report, 'GitHub access'), false);
  assert.ok(!exec.calls.some((c) => c.command === 'gh'));
});

test('slack notifier without its webhook variable: warn', async () => {
  const cfg = config({ notifier: { type: 'slack' } });
  const without = await preflight(cfg, { env: ENV, exec: fakeExec() });
  assert.equal(check(without, 'chat alerts').level, 'warn');
  assert.ok(check(without, 'chat alerts').detail.includes('FACTORY_SLACK_WEBHOOK_URL'));
  assert.equal(without.ok, true);
  const withHook = await preflight(cfg, { env: { ...ENV, FACTORY_SLACK_WEBHOOK_URL: 'https://hooks.example.invalid/x' }, exec: fakeExec() });
  assert.equal(has(withHook, 'chat alerts'), false);
});

test('production release level with no release credentials named: warn', async () => {
  const without = await preflight(config({ release: { level: 'production' } }), { env: ENV, exec: fakeExec() });
  assert.equal(check(without, 'release').level, 'warn');
  const named = await preflight(config({ release: { level: 'production', envPassthrough: ['DEPLOY_KEY'] } }), { env: ENV, exec: fakeExec() });
  assert.equal(has(named, 'release'), false);
  const tag = await preflight(config(), { env: ENV, exec: fakeExec() });
  assert.equal(has(tag, 'release'), false);
});

test('several failures are all reported, and ok is false', async () => {
  const exec = fakeExec({ gitVersion: failRes(), lsRemote: failRes(), cli: failRes() });
  const report = await preflight(config(), { env: { PATH: '' }, exec, codeHost: { baseProtected: async () => false } });
  assert.equal(report.ok, false);
  assert.deepEqual(
    report.checks.filter((c) => c.level === 'fail').map((c) => c.name).sort(),
    ['agent CLI', 'branch protection', 'git', 'repository'],
  );
});
