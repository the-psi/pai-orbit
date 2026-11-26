'use strict';
// Unit tests for bin/factory.js: argument parsing and the commands that need no git or model.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { main, parse } = require('../bin/factory');
const { StateStore } = require('../src/state');

function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-factory-unit-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  return dir;
}

/** Run `fn` with process.stdout.write captured; always restores it. */
async function capture(fn) {
  const original = process.stdout.write;
  let out = '';
  process.stdout.write = (chunk) => { out += String(chunk); return true; };
  try {
    const code = await fn();
    return { code, out };
  } finally {
    process.stdout.write = original;
  }
}

/** A data dir plus a config file that needs no model, no network and no git. */
function rig(t, over = {}) {
  const root = tmpDir(t);
  const data = path.join(root, 'data');
  const configFile = path.join(root, 'factory.config.json');
  fs.writeFileSync(configFile, JSON.stringify({
    project: 'unit',
    repo: { url: path.join(root, 'no-such-remote.git'), baseBranch: 'main' },
    board: { type: 'local' },
    codeHost: { type: 'local' },
    notifier: { type: 'console' },
    runner: { type: 'fake' },
    roles: { mergeApprover: ['lead'], releaseApprover: ['rel'] },
    ...over,
  }));
  return { root, data, configFile, args: (...a) => [...a, '--config', configFile, '--data', data] };
}

// ---- parse ----

test('parse: positionals and flags with values', () => {
  assert.deepEqual(parse(['status', '--config', 'c.json', '--data', 'dir']), {
    positional: ['status'], flags: { config: 'c.json', data: 'dir' },
  });
});

test('parse: a flag with no value is true', () => {
  assert.deepEqual(parse(['status', '--json']), { positional: ['status'], flags: { json: true } });
  assert.deepEqual(parse(['--help']), { positional: [], flags: { help: true } });
  assert.deepEqual(parse(['status', '--json', '--data', 'd']), { positional: ['status'], flags: { json: true, data: 'd' } });
});

test('parse: repeated --label collects a list, even when given once', () => {
  assert.deepEqual(parse(['local', 'add', '--label', 'factory-ready', '--label', 'bug']).flags.label, ['factory-ready', 'bug']);
  assert.deepEqual(parse(['local', 'add', '--label', 'one']).flags.label, ['one']);
});

test('parse: any other repeated flag keeps the last value', () => {
  assert.equal(parse(['--data', 'a', '--data', 'b']).flags.data, 'b');
});

test('parse: positionals keep their order around flags', () => {
  const { positional, flags } = parse(['local', '--author', 'alice', 'comment', '42', '--body', 'hello world']);
  assert.deepEqual(positional, ['local', 'comment', '42']);
  assert.deepEqual(flags, { author: 'alice', body: 'hello world' });
});

test('parse: the full local add command line', () => {
  const { positional, flags } = parse([
    'local', 'add', '--id', '7', '--title', 'Add a greeting', '--body', 'As a visitor...',
    '--label', 'factory-ready', '--label', 'ui', '--reporter', 'alice',
  ]);
  assert.deepEqual(positional, ['local', 'add']);
  assert.deepEqual(flags, { id: '7', title: 'Add a greeting', body: 'As a visitor...', label: ['factory-ready', 'ui'], reporter: 'alice' });
});

test('parse: no arguments', () => {
  assert.deepEqual(parse([]), { positional: [], flags: {} });
});

// ---- help ----

test('main --help prints the usage and returns 0', async () => {
  const { code, out } = await capture(() => main(['--help']));
  assert.equal(code, 0);
  assert.match(out, /Usage: orbit-factory <command>/);
  for (const word of ['run', 'once', 'preflight', 'status', 'events', 'pause', 'resume', 'stop', '--config', '--data']) {
    assert.ok(out.includes(word), `usage mentions ${word}`);
  }
});

test('main with no command, or "help", prints the usage and returns 0', async () => {
  for (const argv of [[], ['help']]) {
    const { code, out } = await capture(() => main(argv));
    assert.equal(code, 0);
    assert.match(out, /Usage: orbit-factory/);
  }
});

test('--help needs neither a config nor a data directory', async (t) => {
  const dir = tmpDir(t);
  const { code } = await capture(() => main(['status', '--help', '--config', path.join(dir, 'missing.json'), '--data', path.join(dir, 'd')]));
  assert.equal(code, 0);
  assert.ok(!fs.existsSync(path.join(dir, 'd')), '--help writes nothing');
});

// ---- pause / resume / stop ----

test('main pause writes paused: true to the control file, without a config', async (t) => {
  const data = path.join(tmpDir(t), 'data');
  const { code, out } = await capture(() => main(['pause', '--data', data]));
  assert.equal(code, 0);
  assert.match(out, /Paused/);
  assert.equal(new StateStore(data).control().paused, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data, 'control.json'), 'utf8')).paused, true);
});

test('main resume writes paused: false', async (t) => {
  const data = path.join(tmpDir(t), 'data');
  await capture(() => main(['pause', '--data', data]));
  assert.equal(new StateStore(data).control().paused, true);
  const { code, out } = await capture(() => main(['resume', '--data', data]));
  assert.equal(code, 0);
  assert.match(out, /Resumed/);
  assert.equal(new StateStore(data).control().paused, false);
});

test('main stop 7 records a stop request for ticket 7', async (t) => {
  const data = path.join(tmpDir(t), 'data');
  const { code, out } = await capture(() => main(['stop', '7', '--data', data]));
  assert.equal(code, 0);
  assert.match(out, /#7/);
  assert.deepEqual(new StateStore(data).control().stop, ['7']);
});

test('main stop twice does not duplicate, and keeps the pause', async (t) => {
  const data = path.join(tmpDir(t), 'data');
  await capture(() => main(['pause', '--data', data]));
  await capture(() => main(['stop', '7', '--data', data]));
  await capture(() => main(['stop', '7', '--data', data]));
  await capture(() => main(['stop', '8', '--data', data]));
  const control = new StateStore(data).control();
  assert.deepEqual(control.stop, ['7', '8']);
  assert.equal(control.paused, true);
});

test('main stop without a ticket id rejects with a readable error', async (t) => {
  const data = path.join(tmpDir(t), 'data');
  await assert.rejects(capture(() => main(['stop', '--data', data])), /Missing ticket id/);
  assert.deepEqual(new StateStore(data).control().stop, []);
});

test('the data directory can come from FACTORY_DATA_DIR', async (t) => {
  const data = path.join(tmpDir(t), 'env-data');
  const saved = process.env.FACTORY_DATA_DIR;
  process.env.FACTORY_DATA_DIR = data;
  try {
    await capture(() => main(['pause']));
  } finally {
    if (saved === undefined) delete process.env.FACTORY_DATA_DIR;
    else process.env.FACTORY_DATA_DIR = saved;
  }
  assert.equal(new StateStore(data).control().paused, true);
});

// ---- events ----

test('main events prints the audit trail of one ticket, one JSON object per line', async (t) => {
  const data = path.join(tmpDir(t), 'data');
  const store = new StateStore(data, { now: () => new Date('2026-11-23T09:00:00.000Z') });
  store.event('42', 'claimed');
  store.event('42', 'stage_started', { stage: 'groom' });
  store.event('43', 'claimed');
  const { code, out } = await capture(() => main(['events', '42', '--data', data]));
  assert.equal(code, 0);
  const lines = out.trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((e) => e.type), ['claimed', 'stage_started']);
  assert.ok(lines.every((e) => e.ticketId === '42'));
});

test('main events without a ticket id rejects with a readable error', async (t) => {
  const data = path.join(tmpDir(t), 'data');
  await assert.rejects(capture(() => main(['events', '--data', data])), /Missing ticket id/);
});

// ---- status ----

function seed(data) {
  const store = new StateStore(data);
  store.save({
    ticketId: '42', title: 'Add a greeting', status: 'waiting_approval', stage: 'pr', costUsd: 3.5, activeMs: 25 * 60000,
    pending: { kind: 'approval', gate: 'merge', since: new Date().toISOString() },
    branch: 'factory/42-add-a-greeting', createdAt: '2026-11-23T09:00:00.000Z',
  });
  store.save({
    ticketId: '43', title: 'Fix the footer', status: 'running', stage: 'build', costUsd: 1.25, activeMs: 5 * 60000,
    pending: null, branch: 'factory/43-fix-the-footer', createdAt: '2026-11-23T10:00:00.000Z',
  });
  store.addSpend(4.75);
  return store;
}

test('main status prints a table of the runs and the spend today', async (t) => {
  const r = rig(t);
  seed(r.data);
  const { code, out } = await capture(() => main(r.args('status')));
  assert.equal(code, 0);
  const lines = out.split('\n');
  for (const column of ['ticketId', 'status', 'stage', 'waitingFor', 'waitingHours', 'costUsd', 'activeMinutes', 'title']) {
    assert.ok(lines[0].includes(column), `header has ${column}`);
  }
  assert.match(lines[1], /^[- ]+$/, 'a rule under the header');
  assert.match(lines[2], /^42\s+waiting_approval\s+pr\s+approval \(merge\)\s+\S+\s+3\.5\s+25\s+Add a greeting$/);
  assert.match(lines[3], /^43\s+running\s+build\s+0\s+1\.25\s+5\s+Fix the footer$/);
  assert.match(out, /Spent today: USD 4\.75 of 200/);
  assert.ok(!out.includes('[PAUSED]'));
});

test('main status columns line up', async (t) => {
  const r = rig(t);
  seed(r.data);
  const { out } = await capture(() => main(r.args('status')));
  const [header, , row1, row2] = out.split('\n');
  const at = header.indexOf('stage');
  assert.equal(row1.slice(at, at + 2), 'pr');
  assert.equal(row2.slice(at, at + 5), 'build');
});

test('main status shows [PAUSED] when the factory is paused', async (t) => {
  const r = rig(t);
  seed(r.data);
  await capture(() => main(['pause', '--data', r.data]));
  const { out } = await capture(() => main(r.args('status')));
  assert.ok(out.includes('[PAUSED]'));
});

test('main status with no runs says so instead of printing an empty table', async (t) => {
  const r = rig(t);
  const { code, out } = await capture(() => main(r.args('status')));
  assert.equal(code, 0);
  assert.match(out, /\(nothing\)/);
  assert.match(out, /Spent today: USD 0\.00 of 200/);
});

test('main status --json prints the rows as JSON and nothing else', async (t) => {
  const r = rig(t);
  seed(r.data);
  const { code, out } = await capture(() => main(r.args('status', '--json')));
  assert.equal(code, 0);
  const rows = JSON.parse(out);
  assert.deepEqual(rows.map((x) => x.ticketId), ['42', '43']);
  assert.equal(rows[0].status, 'waiting_approval');
  assert.equal(rows[0].waitingFor, 'approval (merge)');
  assert.equal(rows[0].costUsd, 3.5);
  assert.equal(rows[0].activeMinutes, 25);
  assert.equal(rows[1].waitingFor, '');
});

test('main status reads the config from FACTORY_CONFIG', async (t) => {
  const r = rig(t);
  seed(r.data);
  const saved = process.env.FACTORY_CONFIG;
  process.env.FACTORY_CONFIG = r.configFile;
  try {
    const { code, out } = await capture(() => main(['status', '--data', r.data]));
    assert.equal(code, 0);
    assert.match(out, /Add a greeting/);
  } finally {
    if (saved === undefined) delete process.env.FACTORY_CONFIG;
    else process.env.FACTORY_CONFIG = saved;
  }
});

test('main status with a missing config rejects with a readable error naming the file', async (t) => {
  const dir = tmpDir(t);
  const missing = path.join(dir, 'missing.json');
  await assert.rejects(
    capture(() => main(['status', '--config', missing, '--data', path.join(dir, 'd')])),
    (err) => {
      assert.match(err.message, /Cannot read factory config/);
      assert.ok(err.message.includes(missing));
      return true;
    },
  );
});

test('main status with an invalid config rejects with every problem listed', async (t) => {
  const r = rig(t, { gates: { merge: false }, concurrency: 99 });
  await assert.rejects(
    capture(() => main(r.args('status'))),
    /Invalid factory config:[\s\S]*gates\.merge[\s\S]*concurrency/,
  );
});

// ---- local board commands ----

test('main local add, comment and show work against the local board', async (t) => {
  const r = rig(t);
  const add = await capture(() => main(r.args('local', 'add', '--id', '7', '--title', 'Add a greeting', '--body', 'As a visitor', '--reporter', 'alice')));
  assert.equal(add.code, 0);
  assert.match(add.out, /Created ticket #7 with labels: factory-ready/);
  const comment = await capture(() => main(r.args('local', 'comment', '7', '--author', 'alice', '--body', 'The home page.')));
  assert.equal(comment.code, 0);
  const show = await capture(() => main(r.args('local', 'show', '7')));
  assert.equal(show.code, 0);
  const ticket = JSON.parse(show.out);
  assert.equal(ticket.id, '7');
  assert.equal(ticket.title, 'Add a greeting');
  assert.equal(ticket.body, 'As a visitor');
  assert.equal(ticket.reporter, 'alice');
  assert.deepEqual(ticket.labels, ['factory-ready']);
  assert.equal(ticket.comments.length, 1);
  assert.equal(ticket.comments[0].author, 'alice');
  assert.equal(ticket.comments[0].body, 'The home page.');
});

test('main local add honours repeated --label and --body-file', async (t) => {
  const r = rig(t);
  const bodyFile = path.join(r.root, 'body.md');
  fs.writeFileSync(bodyFile, '# Story\n\nMulti-line body.\n');
  await capture(() => main(r.args('local', 'add', '--id', '8', '--title', 'T', '--body-file', bodyFile, '--label', 'factory-ready', '--label', 'ui')));
  const show = await capture(() => main(r.args('local', 'show', '8')));
  const ticket = JSON.parse(show.out);
  assert.deepEqual(ticket.labels, ['factory-ready', 'ui']);
  assert.equal(ticket.body, '# Story\n\nMulti-line body.\n');
});

test('main local add without --id or --title rejects with a readable error', async (t) => {
  const r = rig(t);
  await assert.rejects(capture(() => main(r.args('local', 'add', '--title', 'T'))), /Missing --id/);
  await assert.rejects(capture(() => main(r.args('local', 'add', '--id', '9'))), /Missing --title/);
});

test('main local with an unknown sub-command rejects with a readable error', async (t) => {
  const r = rig(t);
  await assert.rejects(capture(() => main(r.args('local', 'frobnicate'))), /Unknown local command: frobnicate/);
});

test('main local commands refuse a board that is not local', async (t) => {
  const r = rig(t, { repo: { url: 'https://github.com/acme/app', baseBranch: 'main' }, board: { type: 'github' } });
  await assert.rejects(capture(() => main(r.args('local', 'show', '1'))), /need board\.type "local"/);
});

// ---- unknown command ----

test('an unknown command rejects with a readable error that names it', async (t) => {
  const r = rig(t);
  await assert.rejects(
    capture(() => main(r.args('frobnicate'))),
    (err) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Unknown command: frobnicate/);
      assert.match(err.message, /--help/);
      return true;
    },
  );
});

test('an unknown command is reported as unknown even when no config file exists', async (t) => {
  const dir = tmpDir(t);
  await assert.rejects(
    capture(() => main(['frobnicate', '--config', path.join(dir, 'missing.json'), '--data', path.join(dir, 'd')])),
    /Unknown command: frobnicate/,
  );
});
