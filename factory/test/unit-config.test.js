'use strict';
// Unit tests for src/config.js: defaults, merging, validation, loading.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DEFAULTS, load, fromObject } = require('../src/config');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** The smallest config that is valid. */
function base(over = {}) {
  return {
    repo: { url: 'https://example.invalid/acme/app.git' },
    roles: { mergeApprover: ['lead'], releaseApprover: ['rel'] },
    ...over,
  };
}

/** A valid config with one nested value replaced, e.g. set('limits.costPerDayUsd', 0). */
function withValue(dotted, value) {
  const raw = base();
  const keys = dotted.split('.');
  let at = raw;
  for (const k of keys.slice(0, -1)) {
    at[k] = at[k] || {};
    at = at[k];
  }
  at[keys[keys.length - 1]] = value;
  return raw;
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-factory-unit-config-'));
}

function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
}

test('fromObject applies every default to a minimal config', () => {
  const cfg = fromObject(base());
  assert.equal(cfg.project, 'project');
  assert.equal(cfg.repo.baseBranch, 'main');
  assert.equal(cfg.docsRoot, 'docs');
  assert.equal(cfg.board.type, 'local');
  assert.equal(cfg.board.botUser, 'orbit-factory');
  assert.equal(cfg.codeHost.type, 'local');
  assert.equal(cfg.notifier.type, 'console');
  assert.equal(cfg.runner.type, 'claude-cli');
  assert.equal(cfg.runner.permissionMode, 'acceptEdits');
  assert.deepEqual(cfg.stages, { playwright: false, review: true });
  assert.deepEqual(cfg.gates, { requirements: false, design: false });
  assert.deepEqual(cfg.roles.answer, ['@reporter']);
  assert.deepEqual(cfg.limits, { ...DEFAULTS.limits });
  assert.deepEqual(cfg.waiting, { ...DEFAULTS.waiting });
  assert.deepEqual(cfg.calendar, { timeZone: 'UTC', days: [1, 2, 3, 4, 5], startHour: 9, endHour: 18 });
  assert.equal(cfg.concurrency, 2);
  assert.equal(cfg.release.level, 'tag');
  assert.equal(cfg.pollSeconds, 60);
  assert.ok(cfg.runner.disallowedTools.includes('AskUserQuestion'));
  assert.ok(cfg.runner.disallowedTools.includes('Bash(git push:*)'));
});

test('fromObject deep-merges: a partial section keeps its sibling defaults', () => {
  const cfg = fromObject(base({
    limits: { costPerDayUsd: 10 },
    calendar: { timeZone: 'Asia/Kolkata' },
    board: { columns: { groom: 'Doing', custom: 'Somewhere' } },
    stages: { playwright: true },
  }));
  assert.equal(cfg.limits.costPerDayUsd, 10);
  assert.equal(cfg.limits.costPerTicketUsd, 50);
  assert.equal(cfg.limits.stageRetries, 1);
  assert.equal(cfg.calendar.timeZone, 'Asia/Kolkata');
  assert.equal(cfg.calendar.startHour, 9);
  assert.equal(cfg.stages.playwright, true);
  assert.equal(cfg.stages.review, true);
  assert.equal(cfg.board.columns.groom, 'Doing');
  assert.equal(cfg.board.columns.pr, 'In review');
  assert.equal(cfg.board.columns.custom, 'Somewhere', 'unknown column keys are kept');
  assert.equal(cfg.repo.baseBranch, 'main');
});

test('fromObject replaces arrays rather than merging them', () => {
  const cfg = fromObject(base({ calendar: { days: [0, 6] }, runner: { allowedTools: ['Read'] } }));
  assert.deepEqual(cfg.calendar.days, [0, 6]);
  assert.deepEqual(cfg.runner.allowedTools, ['Read']);
});

test('fromObject never hands out the shared default arrays', () => {
  const cfg = fromObject(base());
  cfg.runner.allowedTools.push('Mutated');
  cfg.calendar.days.push(0);
  assert.ok(!DEFAULTS.runner.allowedTools.includes('Mutated'));
  assert.deepEqual(DEFAULTS.calendar.days, [1, 2, 3, 4, 5]);
  assert.ok(!fromObject(base()).runner.allowedTools.includes('Mutated'));
});

test('repo.url is required', () => {
  assert.throws(() => fromObject({ roles: base().roles }), /repo\.url is required/);
  assert.throws(() => fromObject(base({ repo: { url: '' } })), /repo\.url is required/);
});

test('repo.baseBranch must not be empty', () => {
  assert.throws(() => fromObject(base({ repo: { url: 'x', baseBranch: '' } })), /repo\.baseBranch is required/);
});

test('an invalid config lists every problem in one readable error', () => {
  assert.throws(
    () => fromObject({ concurrency: 0 }),
    (err) => {
      assert.match(err.message, /^Invalid factory config:/);
      assert.match(err.message, /repo\.url is required/);
      assert.match(err.message, /concurrency/);
      assert.match(err.message, /roles\.mergeApprover/);
      assert.match(err.message, /roles\.releaseApprover/);
      return true;
    },
  );
});

// ---- numeric ranges ----

const OUT_OF_RANGE = [
  ['concurrency', [0, 6, -1]],
  ['limits.costPerTicketUsd', [0, -5]],
  ['limits.costPerStageUsd', [0, -5]],
  ['limits.costPerDayUsd', [0, -5]],
  ['limits.costWarnShare', [-0.01, 1.01]],
  ['limits.activeHoursPerTicket', [0, -1]],
  ['limits.hoursPerStage', [0, -1]],
  ['limits.reworkCyclesPerGate', [-1]],
  ['limits.testFixAttempts', [-1]],
  ['limits.stageRetries', [-1, 4]],
  ['waiting.reminderHours', [-1]],
  ['waiting.escalationHours', [-1]],
  ['waiting.maxParkedDays', [0, -1]],
  ['calendar.startHour', [-1, 24]],
  ['calendar.endHour', [0, 25]],
];

for (const [key, bad] of OUT_OF_RANGE) {
  test(`${key} rejects out-of-range and non-numeric values`, () => {
    const pattern = new RegExp(`${key.replace('.', '\\.')} must be a number`);
    for (const value of [...bad, '3', null, Number.NaN]) {
      assert.throws(() => fromObject(withValue(key, value)), pattern, `${key}=${String(value)} should be rejected`);
    }
  });
}

const IN_RANGE = [
  ['concurrency', [1, 5]],
  ['limits.costWarnShare', [0, 1]],
  ['limits.stageRetries', [0, 3]],
  ['limits.reworkCyclesPerGate', [0, 10]],
  ['limits.testFixAttempts', [0, 10]],
  ['limits.costPerTicketUsd', [0.01, 5000]],
  ['waiting.reminderHours', [0]],
  ['waiting.escalationHours', [0]],
];

for (const [key, good] of IN_RANGE) {
  test(`${key} accepts its boundary values`, () => {
    for (const value of good) {
      assert.doesNotThrow(() => fromObject(withValue(key, value)), `${key}=${value} should be accepted`);
    }
  });
}

test('calendar.endHour must be after calendar.startHour', () => {
  assert.throws(() => fromObject(base({ calendar: { startHour: 10, endHour: 10 } })), /endHour must be after/);
  assert.throws(() => fromObject(base({ calendar: { startHour: 12, endHour: 8 } })), /endHour must be after/);
  assert.doesNotThrow(() => fromObject(base({ calendar: { startHour: 0, endHour: 24 } })));
});

test('calendar.days must list at least one weekday', () => {
  assert.throws(() => fromObject(base({ calendar: { days: [] } })), /calendar\.days/);
  assert.throws(() => fromObject(base({ calendar: { days: 'mon' } })), /calendar\.days/);
});

// ---- swappable part types ----

test('unknown board, code host, notifier and runner types are rejected', () => {
  assert.throws(() => fromObject(base({ board: { type: 'jira' } })), /board\.type must be local or github/);
  assert.throws(() => fromObject(base({ codeHost: { type: 'gitlab' } })), /codeHost\.type must be local or github/);
  assert.throws(() => fromObject(base({ notifier: { type: 'email' } })), /notifier\.type must be console or slack/);
  assert.throws(() => fromObject(base({ runner: { type: 'codex' } })), /runner\.type must be claude-cli or fake/);
});

test('every known board, code host, notifier and runner type is accepted', () => {
  for (const type of ['local', 'github']) {
    assert.equal(fromObject(base({ board: { type } })).board.type, type);
    assert.equal(fromObject(base({ codeHost: { type } })).codeHost.type, type);
  }
  for (const type of ['console', 'slack']) assert.equal(fromObject(base({ notifier: { type } })).notifier.type, type);
  for (const type of ['claude-cli', 'fake']) assert.equal(fromObject(base({ runner: { type } })).runner.type, type);
});

test('release.level must be tag, staging or production', () => {
  assert.throws(() => fromObject(base({ release: { level: 'canary' } })), /release\.level must be one of/);
  for (const level of ['tag', 'staging', 'production']) {
    assert.equal(fromObject(base({ release: { level } })).release.level, level);
  }
});

// ---- the two fixed gates ----

test('a config that names gates.merge is rejected, whatever the value', () => {
  for (const value of [false, true, null, 'off']) {
    assert.throws(
      () => fromObject(base({ gates: { merge: value } })),
      /gates\.merge: the merge gate is fixed and cannot be configured/,
      `gates.merge=${String(value)}`,
    );
  }
});

test('a config that names gates.release is rejected, whatever the value', () => {
  for (const value of [false, true, null, 'off']) {
    assert.throws(
      () => fromObject(base({ gates: { release: value } })),
      /gates\.release: the release gate is fixed and cannot be configured/,
      `gates.release=${String(value)}`,
    );
  }
});

test('the optional gates can still be configured', () => {
  const cfg = fromObject(base({
    gates: { requirements: true, design: true },
    roles: { ...base().roles, requirementsApprover: ['po'], designApprover: ['lead'] },
  }));
  assert.deepEqual(cfg.gates, { requirements: true, design: true });
  assert.ok(!('merge' in DEFAULTS.gates) && !('release' in DEFAULTS.gates), 'the fixed gates are not settings');
});

// ---- roles ----

test('roles.mergeApprover, roles.releaseApprover and roles.answer must each name someone', () => {
  assert.throws(() => fromObject(base({ roles: { mergeApprover: [], releaseApprover: ['rel'] } })),
    /roles\.mergeApprover must name at least one person/);
  assert.throws(() => fromObject(base({ roles: { mergeApprover: ['lead'], releaseApprover: [] } })),
    /roles\.releaseApprover must name at least one person/);
  assert.throws(() => fromObject(base({ roles: { mergeApprover: ['lead'], releaseApprover: ['rel'], answer: [] } })),
    /roles\.answer must name at least one person/);
  assert.throws(() => fromObject({ repo: { url: 'x' } }), /roles\.mergeApprover must name at least one person/);
});

test('a role must be a list of strings', () => {
  assert.throws(() => fromObject(base({ roles: { mergeApprover: 'lead', releaseApprover: ['rel'] } })),
    /roles\.mergeApprover must be a list of user names/);
  assert.throws(() => fromObject(base({ roles: { mergeApprover: ['lead', 7], releaseApprover: ['rel'] } })),
    /roles\.mergeApprover must be a list of user names/);
  assert.throws(() => fromObject(base({ roles: { ...base().roles, escalation: 'boss' } })),
    /roles\.escalation must be a list of user names/);
});

test("roles.releaseApprover must name people: '*' is rejected", () => {
  assert.throws(() => fromObject(base({ roles: { mergeApprover: ['lead'], releaseApprover: ['*'] } })),
    /roles\.releaseApprover must name people/);
  assert.throws(() => fromObject(base({ roles: { mergeApprover: ['lead'], releaseApprover: ['rel', '*'] } })),
    /roles\.releaseApprover must name people/);
});

test("roles.mergeApprover may be '*'", () => {
  assert.deepEqual(fromObject(base({ roles: { mergeApprover: ['*'], releaseApprover: ['rel'] } })).roles.mergeApprover, ['*']);
});

for (const role of ['requirementsApprover', 'designApprover', 'mergeApprover', 'releaseApprover']) {
  test(`the factory's own identity cannot be listed in roles.${role}`, () => {
    const roles = { ...base().roles, [role]: ['someone', 'orbit-factory'] };
    assert.throws(() => fromObject(base({ roles })), new RegExp(`roles\\.${role} must not include the factory's own identity`));
  });

  test(`a renamed bot user cannot be listed in roles.${role}`, () => {
    const roles = { ...base().roles, [role]: ['my-bot'] };
    assert.throws(
      () => fromObject(base({ roles, board: { botUser: 'my-bot' } })),
      new RegExp(`roles\\.${role} must not include the factory's own identity \\(my-bot\\)`),
    );
  });
}

test('requirementsApprover is required only when gates.requirements is on', () => {
  assert.doesNotThrow(() => fromObject(base({ gates: { requirements: false } })));
  assert.throws(() => fromObject(base({ gates: { requirements: true } })),
    /roles\.requirementsApprover must name at least one person/);
  assert.doesNotThrow(() => fromObject(base({
    gates: { requirements: true }, roles: { ...base().roles, requirementsApprover: ['po'] },
  })));
});

test('designApprover is required only when gates.design is on', () => {
  assert.doesNotThrow(() => fromObject(base({ gates: { design: false } })));
  assert.throws(() => fromObject(base({ gates: { design: true } })),
    /roles\.designApprover must name at least one person/);
  assert.doesNotThrow(() => fromObject(base({
    gates: { design: true }, roles: { ...base().roles, designApprover: ['lead'] },
  })));
});

// ---- runner ----

test('permissionMode bypassPermissions is rejected outside the sandbox and allowed inside it', () => {
  const saved = process.env.FACTORY_SANDBOXED;
  try {
    delete process.env.FACTORY_SANDBOXED;
    assert.throws(
      () => fromObject(base({ runner: { permissionMode: 'bypassPermissions' } })),
      /bypassPermissions is allowed only inside the factory container/,
    );
    process.env.FACTORY_SANDBOXED = '1';
    assert.equal(fromObject(base({ runner: { permissionMode: 'bypassPermissions' } })).runner.permissionMode, 'bypassPermissions');
  } finally {
    if (saved === undefined) delete process.env.FACTORY_SANDBOXED;
    else process.env.FACTORY_SANDBOXED = saved;
  }
});

test('a relative runner.pluginDir is resolved against the base directory', () => {
  const baseDir = path.join(os.tmpdir(), 'orbit-factory-unit-base');
  const cfg = fromObject(base({ runner: { pluginDir: 'vendor/plugin' } }), baseDir);
  assert.equal(cfg.runner.pluginDir, path.resolve(baseDir, 'vendor', 'plugin'));
  assert.ok(path.isAbsolute(cfg.runner.pluginDir));
});

test('an absolute runner.pluginDir is kept as given', () => {
  const abs = path.resolve(os.tmpdir(), 'some-plugin');
  assert.equal(fromObject(base({ runner: { pluginDir: abs } }), '/elsewhere').runner.pluginDir, abs);
});

test('the default runner.pluginDir is the built Claude Code plugin, and it exists', () => {
  const cfg = fromObject(base());
  const expected = path.join(REPO_ROOT, 'plugins', 'pai-orbit', 'dist', 'claude-code');
  assert.equal(cfg.runner.pluginDir, expected);
  assert.ok(fs.existsSync(expected), `${expected} must exist`);
  const manifest = path.join(expected, '.claude-plugin', 'plugin.json');
  assert.ok(fs.existsSync(manifest), `${manifest} must exist`);
  assert.equal(JSON.parse(fs.readFileSync(manifest, 'utf8')).name, cfg.runner.pluginName);
});

// ---- load ----

test('load on a missing file throws a readable error naming the file', () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'nope.json');
    assert.throws(() => load(file), (err) => {
      assert.match(err.message, /^Cannot read factory config /);
      assert.ok(err.message.includes(file));
      return true;
    });
  } finally {
    rm(dir);
  }
});

test('load on malformed JSON throws a readable error naming the file', () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'bad.json');
    fs.writeFileSync(file, '{ "repo": { "url": ');
    assert.throws(() => load(file), (err) => {
      assert.match(err.message, /^Cannot read factory config /);
      assert.ok(err.message.includes(file));
      return true;
    });
  } finally {
    rm(dir);
  }
});

test('load reads, defaults and validates a file, resolving pluginDir against its folder', () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'factory.config.json');
    fs.writeFileSync(file, JSON.stringify(base({ project: 'acme', runner: { pluginDir: './plugin' } })));
    const cfg = load(file);
    assert.equal(cfg.project, 'acme');
    assert.equal(cfg.concurrency, 2);
    assert.equal(cfg.runner.pluginDir, path.resolve(dir, 'plugin'));
  } finally {
    rm(dir);
  }
});

test('load reports validation problems of the file', () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'factory.config.json');
    fs.writeFileSync(file, JSON.stringify(base({ gates: { merge: false } })));
    assert.throws(() => load(file), /Invalid factory config:[\s\S]*gates\.merge/);
  } finally {
    rm(dir);
  }
});

// ---- the shipped example ----

const EXAMPLE = path.join(__dirname, '..', 'config', 'factory.example.json');

test('the shipped example config loads once repo.url is set', (t) => {
  if (!fs.existsSync(EXAMPLE)) {
    t.skip(`${EXAMPLE} does not exist yet (it is written in parallel)`);
    return;
  }
  const raw = JSON.parse(fs.readFileSync(EXAMPLE, 'utf8'));
  assert.ok(!raw.gates || (!('merge' in raw.gates) && !('release' in raw.gates)), 'the example must not name the fixed gates');
  raw.repo = { ...(raw.repo || {}), url: 'https://example.invalid/acme/app.git' };
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'factory.config.json');
    fs.writeFileSync(file, JSON.stringify(raw));
    const cfg = load(file);
    assert.equal(cfg.repo.url, 'https://example.invalid/acme/app.git');
    assert.ok(cfg.roles.mergeApprover.length > 0);
    assert.ok(cfg.roles.releaseApprover.length > 0);
  } finally {
    rm(dir);
  }
});

test('the shipped example config has no key the defaults do not know', (t) => {
  if (!fs.existsSync(EXAMPLE)) {
    t.skip(`${EXAMPLE} does not exist yet (it is written in parallel)`);
    return;
  }
  const raw = JSON.parse(fs.readFileSync(EXAMPLE, 'utf8'));
  const unknown = [];
  const walk = (value, defaults, prefix) => {
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.startsWith('_')) continue; // comments
      const here = prefix ? `${prefix}.${key}` : key;
      if (here.startsWith('board.columns.')) continue; // free-form map
      if (!(key in defaults)) unknown.push(here);
      else if (value[key] && typeof value[key] === 'object' && !Array.isArray(value[key])) walk(value[key], defaults[key], here);
    }
  };
  walk(raw, DEFAULTS, '');
  assert.deepEqual(unknown, [], 'a misspelt key in the example would be silently ignored');
});
