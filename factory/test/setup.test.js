'use strict';
// The setup page: answers in, deployment files out. And the read-only Settings view of the
// status page, which shows what a running factory was set up with.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const build = require('../src/setup/build');
const { createSetupServer, setupListenPlan, newCode, testConnection } = require('../src/setup/server');
const { fromObject, modelFor } = require('../src/config');
const { createUiServer, parseUsers } = require('../src/ui/server');
const { StateStore } = require('../src/state');
const { FakeGitLab } = require('./fake-gitlab');

const GOOD = {
  project: 'Spardha', platform: 'gitlab', repoUrl: 'https://git.example.com/grp/app.git', botUser: 'orbit-factory',
  gates: { requirements: true, design: false },
  people: { requirements: 'po', design: 'ignored', merge: 'lead, dev2', release: 'rel', answer: 'po', escalation: 'boss' },
  stages: { review: true, independentReview: true },
  models: { default: 'sonnet', groom: 'haiku', verify: 'opus' },
  limits: { costPerTicketUsd: 20, costPerDayUsd: 100 }, concurrency: 3,
  target: 'server', image: 'ghcr.io/acme/orbit-factory:0.1.0', port: 8080,
};
const SECRETS = { ai: 'sk-ai-key-value', token: 'glpat-token-value', users: { po: 'passw0rd-po', lead: 'passw0rd-lead', dev2: 'passw0rd-dev2', rel: 'passw0rd-rel' } };
const steps = (problems) => problems.map((p) => p.step);

// ---------------------------------------------------------------------------- answers to files

test('good answers have no problems and make a config the factory accepts', () => {
  assert.deepEqual(build.check(GOOD), []);
  const cfg = fromObject(build.configObject(GOOD));
  assert.equal(cfg.board.type, 'gitlab');
  assert.equal(cfg.codeHost.type, 'gitlab');
  assert.equal(cfg.repo.url, GOOD.repoUrl);
  assert.deepEqual(cfg.gates, { requirements: true, design: false });
  assert.deepEqual(cfg.roles.requirementsApprover, ['po']);
  assert.deepEqual(cfg.roles.designApprover, [], 'a stop that is off names nobody');
  assert.deepEqual(cfg.roles.mergeApprover, ['lead', 'dev2']);
  assert.deepEqual(cfg.roles.answer, ['@reporter', 'po']);
  assert.equal(modelFor(cfg, 'groom'), 'haiku');
  assert.equal(modelFor(cfg, 'build'), 'sonnet');
  assert.equal(modelFor(cfg, 'verify'), 'opus');
  assert.equal(cfg.limits.costPerTicketUsd, 20);
  assert.equal(cfg.concurrency, 3);
  assert.equal(cfg.trial.singleAccount, false);
});

test('the two fixed stops cannot be written into the config by any answer', () => {
  const cfg = build.configObject({ ...GOOD, gates: { requirements: false, design: false, merge: false, release: false } });
  assert.deepEqual(Object.keys(cfg.gates).sort(), ['design', 'requirements']);
});

test('empty answers are reported step by step, in plain words', () => {
  const problems = build.check({});
  assert.deepEqual([...new Set(steps(problems))], ['project', 'people', 'run']);
  assert.ok(problems.some((p) => /Enter the repository URL/.test(p.message)));
  assert.ok(problems.some((p) => /approves the code/.test(p.message)));
});

test('answers that do not fit together are caught', () => {
  const has = (form, re) => assert.ok(build.check(form).some((p) => re.test(p.message)), `no problem matching ${re}`);
  has({ ...GOOD, platform: 'github' }, /does not look like a GitHub repository URL/);
  has({ ...GOOD, repoUrl: 'https://git.example.com/app.git' }, /does not look like a GitLab repository URL/);
  has({ ...GOOD, people: { ...GOOD.people, requirements: '' } }, /approves requirements, or switch that stop off/);
  has({ ...GOOD, people: { ...GOOD.people, merge: 'orbit-factory' } }, /own account \(orbit-factory\) cannot be the code approver/);
  has({ ...GOOD, limits: { costPerTicketUsd: 50, costPerDayUsd: 10 } }, /per day should not be lower/);
  has({ ...GOOD, concurrency: 9 }, /from 1 to 5/);
  has({ ...GOOD, image: '' }, /Enter the image name/);
  assert.doesNotThrow(() => build.check({ ...GOOD, models: 'opus', people: null, limits: 'x', gates: 7 }), 'answers of the wrong type are a problem list, never a crash');
  assert.deepEqual(build.check({ ...GOOD, singleAccount: true, people: { ...GOOD.people, merge: 'orbit-factory' } }), [], 'a one-person trial may name the factory account');
});

test('names are cleaned: spaces, a leading @, blanks and repeats', () => {
  assert.deepEqual(build.names(' @lead , dev2,,lead\n rel '), ['lead', 'dev2', 'rel']);
  assert.deepEqual(build.names(['@reporter', 'po']), ['@reporter', 'po']);
});

test('the credentials file names the right variables and holds what was typed', () => {
  const env = build.envFile(GOOD, SECRETS);
  assert.match(env, /^ANTHROPIC_API_KEY=sk-ai-key-value$/m);
  assert.match(env, /^GITLAB_TOKEN=glpat-token-value$/m);
  assert.ok(!/GH_TOKEN/.test(env));
  const users = parseUsers(env.match(/^FACTORY_UI_USERS=(.*)$/m)[1]);
  assert.deepEqual([...users.keys()].sort(), ['dev2', 'lead', 'po', 'rel'], 'the status page can read the sign-ins');
  assert.equal(users.get('lead'), 'passw0rd-lead');
  assert.ok(!/SLACK/.test(env));

  const gh = build.envFile({ ...GOOD, platform: 'github', aiKey: 'subscription', slack: true }, {});
  assert.match(gh, /^CLAUDE_CODE_OAUTH_TOKEN=$/m);
  assert.match(gh, /^GH_TOKEN=$/m);
  assert.match(gh, /^FACTORY_SLACK_WEBHOOK_URL=$/m);
});

test('credentials that would break the file are refused; a half-filled sign-in list too', () => {
  const p = (secrets) => build.checkSecrets(GOOD, secrets).map((x) => x.message).join(' | ');
  assert.equal(p(SECRETS), '');
  assert.equal(p({}), '', 'everything may be left empty and filled in later');
  assert.match(p({ users: { po: 'passw0rd-po' } }), /No status page password for lead, dev2, rel/);
  assert.match(p({ users: { ...SECRETS.users, po: 'short' } }), /password for po is shorter than 8/);
  assert.match(p({ users: { ...SECRETS.users, po: 'has:colon123' } }), /password for po cannot contain/);
  assert.match(p({ users: { ...SECRETS.users, po: 'has$dollar12' } }), /password for po cannot contain/);
  assert.match(p({ token: 'two words' }), /GitLab token contains a space or a quote/);
  assert.ok(build.checkSecrets(GOOD, { users: { po: 'x' } }).every((x) => x.step === 'secrets'));
  assert.deepEqual(build.checkSecrets({ ...GOOD, target: 'containerapps' }, { users: { po: 'x' } }), [], 'on Azure nothing is typed here');
});

test('the compose file runs the published image, keeps tokens away from the status page, and binds by target', () => {
  const server = build.composeFile(GOOD);
  assert.equal((server.match(/image: ghcr\.io\/acme\/orbit-factory:0\.1\.0/g) || []).length, 2);
  assert.ok(!/build:/.test(server), 'nothing is built on the machine');
  assert.match(server, /name: factory-spardha/);
  assert.match(server, /- "8080:8080"/);
  const ui = server.slice(server.indexOf('  ui:'));
  assert.ok(!/env_file/.test(ui), 'the status page container is not given the tokens');
  assert.match(ui, /FACTORY_UI_USERS: \$\{FACTORY_UI_USERS:-\}/);
  const local = build.composeFile({ ...GOOD, target: 'local', port: 8090 });
  assert.match(local, /- "127\.0\.0\.1:8090:8080"/, 'on a laptop the page is for this computer only');
});

test('each place to run gets its own files and steps', () => {
  const docker = build.buildAll(GOOD, SECRETS);
  assert.deepEqual(docker.files.map((f) => f.name), ['factory.config.json', '.env', 'docker-compose.yml']);
  assert.deepEqual(docker.files.filter((f) => f.secret).map((f) => f.name), ['.env']);
  assert.ok(docker.steps.some((s) => s.command === 'docker compose up -d'));
  assert.ok(docker.steps.some((s) => /firewall/.test(s.text)), 'a server is told to restrict the port');

  const local = build.buildAll({ ...GOOD, target: 'local' }, SECRETS);
  assert.ok(local.steps.some((s) => s.command === 'http://localhost:8080'));
  assert.ok(!local.steps.some((s) => /firewall/.test(s.text)));

  const azure = build.buildAll({ ...GOOD, target: 'containerapps' }, SECRETS);
  assert.deepEqual(azure.files.map((f) => f.name), ['factory.config.json'], 'no credentials file for Key Vault');
  assert.ok(!JSON.stringify(azure).includes('glpat-token-value'), 'typed credentials never appear in the Azure output');
  assert.deepEqual(azure.env.filter((e) => e.required).map((e) => e.name), ['ANTHROPIC_API_KEY', 'GITLAB_TOKEN', 'FACTORY_UI_USERS']);
  assert.ok(azure.steps.some((s) => /Key Vault/.test(s.text)));
});

test('the config file never contains a credential', () => {
  const out = build.buildAll(GOOD, SECRETS);
  const cfg = out.files.find((f) => f.name === 'factory.config.json').content;
  for (const secret of [SECRETS.ai, SECRETS.token, ...Object.values(SECRETS.users)]) assert.ok(!cfg.includes(secret));
});

// ---------------------------------------------------------------------------- the server

function rig(t, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-factory-setup-'));
  const logs = [];
  const code = newCode();
  const server = createSetupServer({ code, outDir: opts.noOut ? '' : dir, fetch: opts.fetch, log: (m) => logs.push(m) });
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      const call = (p, body, headers = {}) => fetch(base + p, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'x-setup-code': code, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
        body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
      });
      resolve({ dir, base, code, call, logs });
    });
  });
}

test('the page is served, and every API call needs the setup code', async (t) => {
  const r = await rig(t);
  const page = await fetch(r.base + '/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Agentic Factory setup/);
  assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(page.headers.get('x-frame-options'), 'DENY');

  assert.equal((await fetch(r.base + '/api/options')).status, 401);
  assert.equal((await r.call('/api/options', undefined, { 'x-setup-code': 'wrong' })).status, 401);
  assert.equal((await r.call('/api/build', { form: GOOD }, { 'x-setup-code': '' })).status, 401);
  const ok = await r.call('/api/options');
  assert.equal(ok.status, 200);
  const o = await ok.json();
  assert.equal(o.canSave, true);
  assert.equal(o.image, '', 'no image is suggested unless the page was told one');
  assert.deepEqual(o.stages.map((s) => s.name), ['groom', 'design', 'build', 'test', 'playwright', 'review', 'verify', 'release']);
});

test('a call from another site is refused even with the right code', async (t) => {
  const r = await rig(t);
  assert.equal((await r.call('/api/options', undefined, { Origin: 'https://evil.example' })).status, 401);
  assert.equal((await r.call('/api/options', undefined, { Origin: r.base })).status, 200);
});

test('a setup code is long and different every time', () => {
  const a = newCode();
  assert.ok(a.length >= 24);
  assert.notEqual(a, newCode());
  assert.throws(() => createSetupServer({}), /needs a setup code/);
});

test('check and build answer with problems or files', async (t) => {
  const r = await rig(t);
  const bad = await (await r.call('/api/check', { form: {} })).json();
  assert.ok(bad.problems.length >= 3);
  const refused = await r.call('/api/build', { form: {} });
  assert.equal(refused.status, 422);
  const good = await r.call('/api/build', { form: GOOD, secrets: SECRETS });
  assert.equal(good.status, 200);
  const out = await good.json();
  assert.deepEqual(out.files.map((f) => f.name), ['factory.config.json', '.env', 'docker-compose.yml']);
  assert.match(out.files[1].content, /GITLAB_TOKEN=glpat-token-value/);
});

test('save writes the files, keeps the credentials file private, and never overwrites unasked', async (t) => {
  const r = await rig(t);
  const first = await r.call('/api/save', { form: GOOD, secrets: SECRETS });
  assert.equal(first.status, 200);
  assert.deepEqual((await first.json()).written, ['factory.config.json', '.env', 'docker-compose.yml']);
  assert.deepEqual(fs.readdirSync(r.dir).sort(), ['.env', 'docker-compose.yml', 'factory.config.json']);
  fromObject(JSON.parse(fs.readFileSync(path.join(r.dir, 'factory.config.json'), 'utf8')));
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(r.dir, '.env')).mode & 0o777, 0o600);

  fs.writeFileSync(path.join(r.dir, '.env'), 'MINE=1\n');
  const again = await r.call('/api/save', { form: GOOD, secrets: SECRETS });
  assert.equal(again.status, 409);
  assert.deepEqual((await again.json()).existing.sort(), ['.env', 'docker-compose.yml', 'factory.config.json']);
  assert.equal(fs.readFileSync(path.join(r.dir, '.env'), 'utf8'), 'MINE=1\n', 'an existing file was replaced without asking');
  assert.equal((await r.call('/api/save', { form: GOOD, secrets: SECRETS, overwrite: true })).status, 200);
  assert.match(fs.readFileSync(path.join(r.dir, '.env'), 'utf8'), /GITLAB_TOKEN=glpat-token-value/);

  assert.ok(r.logs.length >= 1);
  for (const line of r.logs) for (const s of [SECRETS.ai, SECRETS.token, 'passw0rd']) assert.ok(!line.includes(s), 'a credential was logged');
});

test('without a folder, save is refused and download still works', async (t) => {
  const r = await rig(t, { noOut: true });
  assert.equal((await (await r.call('/api/options')).json()).canSave, false);
  assert.equal((await r.call('/api/save', { form: GOOD, secrets: SECRETS })).status, 400);
  assert.equal((await r.call('/api/build', { form: GOOD, secrets: SECRETS })).status, 200);
});

test('bad requests are refused without echoing what was sent', async (t) => {
  const r = await rig(t);
  const junk = await r.call('/api/check', '{"form": {"token":"super-secret-value"');
  assert.equal(junk.status, 400);
  assert.ok(!(await junk.text()).includes('super-secret-value'));
  const big = await r.call('/api/check', JSON.stringify({ form: { project: 'x'.repeat(80 * 1024) } })).catch(() => ({ status: 413 }));
  assert.equal(big.status, 413);
  assert.equal((await r.call('/api/nothing', {})).status, 404);
  assert.equal((await fetch(r.base + '/somewhere')).status, 404);
});

test('where the setup page listens: this machine by default, all interfaces inside the container', () => {
  assert.deepEqual(setupListenPlan({}, {}), { host: '127.0.0.1', port: 8080 });
  assert.deepEqual(setupListenPlan({}, { FACTORY_SANDBOXED: '1' }), { host: '0.0.0.0', port: 8080 });
  assert.deepEqual(setupListenPlan({ port: '9000', host: '127.0.0.1' }, { FACTORY_SANDBOXED: '1' }), { host: '127.0.0.1', port: 9000 });
});

// ---------------------------------------------------------------------------- testing a token

test('test connection on GitLab: a good token, a token of another account, a bad token', async () => {
  const gl = new FakeGitLab({ project: 'grp/app' });
  const form = { ...GOOD, repoUrl: `${gl.site}/grp/app.git` };
  let out = await testConnection(form, { token: gl.token }, gl.fetch);
  assert.equal(out.ok, true);
  assert.match(out.lines.join(' '), /token works: orbit-factory on grp\/app/);
  out = await testConnection({ ...form, botUser: 'someone-else' }, { token: gl.token }, gl.fetch);
  assert.equal(out.ok, false);
  assert.match(out.lines.join(' '), /belongs to "orbit-factory", but the factory's account name is "someone-else"/);
  out = await testConnection(form, { token: 'wrong-token-value' }, gl.fetch);
  assert.equal(out.ok, false);
  assert.ok(!out.lines.join(' ').includes('wrong-token-value'), 'the token was echoed');
  assert.equal((await testConnection(form, {}, gl.fetch)).ok, false);
});

test('test connection on GitHub: write access and the account are checked', async () => {
  const gh = (repoStatus, push, login) => async (url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer gh-token-value');
    const isUser = String(url).endsWith('/user');
    const status = isUser ? 200 : repoStatus;
    const data = isUser ? { login } : { permissions: { push } };
    return { status, json: async () => data };
  };
  const form = { ...GOOD, platform: 'github', repoUrl: 'https://github.com/acme/app.git', botUser: 'acme-bot' };
  const secrets = { token: 'gh-token-value' };
  let out = await testConnection(form, secrets, gh(200, true, 'acme-bot'));
  assert.equal(out.ok, true);
  assert.match(out.lines.join(' '), /can read and write acme\/app/);
  out = await testConnection(form, secrets, gh(200, false, 'acme-bot'));
  assert.equal(out.ok, false);
  assert.match(out.lines.join(' '), /cannot write/);
  out = await testConnection(form, secrets, gh(200, true, 'someone'));
  assert.equal(out.ok, false);
  assert.match(out.lines.join(' '), /belongs to "someone"/);
  assert.match((await testConnection(form, secrets, gh(404, true, 'acme-bot'))).lines[0], /cannot see the repository/);
  assert.match((await testConnection(form, secrets, gh(401, true, 'acme-bot'))).lines[0], /did not accept the token/);
  const down = await testConnection(form, secrets, async () => { throw new Error('ENOTFOUND'); });
  assert.match(down.lines[0], /Could not reach GitHub .*network problem, not a problem with the token/);
  const glDown = await testConnection(GOOD, { token: 'any-token-value' }, async () => { throw new Error('ETIMEDOUT'); });
  assert.equal(glDown.ok, false);
  assert.match(glDown.lines[0], /Could not reach GitLab \(https:\/\/git\.example\.com\).*never checked/);
});

// ---------------------------------------------------------------------------- Settings view

test('the status page shows how the factory is set up, read only and without credentials', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-factory-settings-'));
  const config = fromObject({
    ...build.configObject(GOOD),
    repo: { url: 'https://deploy:s3cr3t-in-url@git.example.com/grp/app.git', baseBranch: 'main' },
  });
  const server = createUiServer({ store: new StateStore(dir), config, password: '' });
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); });
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(base + '/api/settings');
  assert.equal(res.status, 200);
  const raw = await res.text();
  assert.ok(!raw.includes('s3cr3t-in-url'), 'a credential in the repository URL was shown');
  const s = JSON.parse(raw);
  assert.equal(s.repository, 'https://git.example.com/grp/app.git');
  assert.equal(s.platform, 'gitlab');
  assert.deepEqual(s.stops.map((g) => [g.name, g.on, g.always]), [
    ['After requirements', true, false], ['After design', false, false],
    ['Before merging code', true, true], ['Before release', true, true],
  ]);
  assert.deepEqual(s.stops[2].who, ['lead', 'dev2']);
  assert.deepEqual(Object.fromEntries(s.models.map((m) => [m.step, m.model])), {
    Groom: 'haiku', Design: 'sonnet', Build: 'sonnet', Test: 'sonnet', Review: 'sonnet', 'Second AI review': 'opus', Release: 'sonnet',
  });
  assert.equal(s.limits.costPerTicketUsd, 20);
  assert.equal((await fetch(base + '/api/settings', { method: 'POST' })).status, 405, 'settings cannot be changed from the page');
  assert.match(await (await fetch(base + '/')).text(), /id="setbtn"/);
});
