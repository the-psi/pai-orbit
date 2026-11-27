'use strict';
// Unit tests for src/state.js: run state, audit trail, spend and operator controls on disk.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { StateStore, ACTIVE, TERMINAL, safeId } = require('../src/state');

/** A store on a fresh temp dir with a clock the test moves. */
function makeStore(t, start = '2026-11-23T09:00:00.000Z') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-factory-unit-state-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  let at = new Date(start).getTime();
  const now = () => new Date(at);
  const store = new StateStore(dir, { now });
  return { dir, store, set: (iso) => { at = new Date(iso).getTime(); }, advance: (ms) => { at += ms; } };
}

function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

test('the constructor creates the data directory', (t) => {
  const { dir } = makeStore(t);
  const nested = path.join(dir, 'a', 'b');
  const store = new StateStore(nested);
  assert.ok(fs.statSync(path.join(nested, 'runs')).isDirectory());
  assert.equal(store.dataDir, path.resolve(nested));
});

test('save then load round-trips a run and stamps updatedAt', (t) => {
  const { store, dir } = makeStore(t);
  const run = {
    ticketId: '42', title: 'Add greeting', status: 'running', stage: 'build',
    costUsd: 1.25, sessions: { groom: 'abc' }, pending: null, createdAt: '2026-11-23T08:00:00.000Z',
  };
  const saved = store.save(run);
  assert.equal(saved, run);
  assert.equal(run.updatedAt, '2026-11-23T09:00:00.000Z');
  assert.deepEqual(store.load('42'), run);
  assert.ok(fs.existsSync(path.join(dir, 'runs', '42', 'state.json')));
  assert.ok(!fs.existsSync(path.join(dir, 'runs', '42', 'state.json.tmp')), 'no temp file is left behind');
});

test('save overwrites the previous state of the same ticket', (t) => {
  const { store, advance } = makeStore(t);
  store.save({ ticketId: '1', status: 'running', stage: 'groom', createdAt: 'a' });
  advance(60000);
  store.save({ ticketId: '1', status: 'waiting_answer', stage: 'groom', createdAt: 'a' });
  const run = store.load('1');
  assert.equal(run.status, 'waiting_answer');
  assert.equal(run.updatedAt, '2026-11-23T09:01:00.000Z');
  assert.equal(store.all().length, 1);
});

test('load returns null for a ticket with no run', (t) => {
  const { store } = makeStore(t);
  assert.equal(store.load('missing'), null);
});

test('a numeric ticket id and its string form are the same run', (t) => {
  const { store } = makeStore(t);
  store.save({ ticketId: 7, status: 'running', createdAt: 'a' });
  assert.equal(store.load('7').status, 'running');
});

test('all() returns every run ordered by createdAt', (t) => {
  const { store } = makeStore(t);
  store.save({ ticketId: 'b', status: 'running', createdAt: '2026-11-23T10:00:00.000Z' });
  store.save({ ticketId: 'c', status: 'done', createdAt: '2026-11-22T10:00:00.000Z' });
  store.save({ ticketId: 'a', status: 'running', createdAt: '2026-11-24T10:00:00.000Z' });
  assert.deepEqual(store.all().map((r) => r.ticketId), ['c', 'b', 'a']);
});

test('all() is empty for a fresh store', (t) => {
  const { store } = makeStore(t);
  assert.deepEqual(store.all(), []);
  assert.deepEqual(store.active(), []);
});

test('active() keeps running and waiting runs and drops finished ones', (t) => {
  const { store } = makeStore(t);
  const statuses = ['running', 'waiting_answer', 'waiting_approval', 'done', 'declined', 'handed_back', 'taken_over'];
  statuses.forEach((status, i) => store.save({ ticketId: `t${i}`, status, createdAt: `2026-11-23T10:0${i}:00.000Z` }));
  assert.deepEqual(store.active().map((r) => r.status), ['running', 'waiting_answer', 'waiting_approval']);
  assert.deepEqual(ACTIVE, ['running', 'waiting_answer', 'waiting_approval']);
  assert.deepEqual(TERMINAL, ['done', 'declined', 'handed_back', 'taken_over']);
  assert.equal(store.all().length, statuses.length);
});

test('event() appends and events() reads back in order', (t) => {
  const { store, dir, advance } = makeStore(t);
  store.event('42', 'stage_started', { stage: 'groom' });
  advance(1000);
  store.event('42', 'stage_finished', { stage: 'groom', costUsd: 0.5 });
  advance(1000);
  store.event('42', 'question_posted');
  const events = store.events('42');
  assert.deepEqual(events.map((e) => e.type), ['stage_started', 'stage_finished', 'question_posted']);
  assert.deepEqual(events[0], { at: '2026-11-23T09:00:00.000Z', ticketId: '42', type: 'stage_started', stage: 'groom' });
  assert.equal(events[1].at, '2026-11-23T09:00:01.000Z');
  assert.equal(events[1].costUsd, 0.5);
  const lines = fs.readFileSync(path.join(dir, 'runs', '42', 'events.jsonl'), 'utf8').split('\n').filter(Boolean);
  assert.equal(lines.length, 3, 'one JSON object per line');
});

test('the audit trail is append-only: earlier lines are never rewritten', (t) => {
  const { store, dir } = makeStore(t);
  const file = path.join(dir, 'runs', '9', 'events.jsonl');
  store.event('9', 'first', { note: 'a "quoted"\nmultiline value' });
  const before = fs.readFileSync(file, 'utf8');
  store.event('9', 'second');
  const after = fs.readFileSync(file, 'utf8');
  assert.ok(after.startsWith(before));
  assert.equal(store.events('9')[0].note, 'a "quoted"\nmultiline value');
});

test('events() is empty for a ticket with no audit trail, and trails are per ticket', (t) => {
  const { store } = makeStore(t);
  assert.deepEqual(store.events('nothing'), []);
  store.event('1', 'a');
  store.event('2', 'b');
  assert.deepEqual(store.events('1').map((e) => e.type), ['a']);
  assert.deepEqual(store.events('2').map((e) => e.type), ['b']);
});

test('an event can be recorded before any state is saved', (t) => {
  const { store } = makeStore(t);
  store.event('new', 'claimed');
  assert.equal(store.load('new'), null);
  assert.equal(store.events('new').length, 1);
  assert.deepEqual(store.all(), [], 'a run directory with only events is not a run');
});

test('spend accumulates within a day', (t) => {
  const { store, advance } = makeStore(t);
  assert.equal(store.spentToday(), 0);
  store.addSpend(1.5);
  advance(3600 * 1000);
  store.addSpend(2.25);
  assert.equal(store.spentToday(), 3.75);
});

test('spend does not drift with floating point', (t) => {
  const { store } = makeStore(t);
  store.addSpend(0.1);
  store.addSpend(0.2);
  assert.equal(store.spentToday(), 0.3);
});

test('addSpend ignores zero, negative and non-numeric amounts', (t) => {
  const { store } = makeStore(t);
  store.addSpend(2);
  store.addSpend(0);
  store.addSpend(-5);
  store.addSpend(Number.NaN);
  store.addSpend(undefined);
  assert.equal(store.spentToday(), 2);
});

test('spentToday resets on a new day and keeps the earlier day on disk', (t) => {
  const { store, dir, set } = makeStore(t, '2026-11-23T23:30:00.000Z');
  store.addSpend(4);
  assert.equal(store.spentToday(), 4);
  set('2026-11-24T00:10:00.000Z');
  assert.equal(store.spentToday(), 0);
  store.addSpend(1);
  assert.equal(store.spentToday(), 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'spend.json'), 'utf8')), { '2026-11-23': 4, '2026-11-24': 1 });
  set('2026-11-23T12:00:00.000Z');
  assert.equal(store.spentToday(), 4);
});

test('spend is shared by every store on the same data directory', (t) => {
  const { store, dir } = makeStore(t);
  store.addSpend(3);
  const other = new StateStore(dir, { now: () => new Date('2026-11-23T15:00:00.000Z') });
  assert.equal(other.spentToday(), 3);
});

test('dayKey is the UTC date', (t) => {
  const { store } = makeStore(t);
  assert.equal(store.dayKey(), '2026-11-23');
  assert.equal(store.dayKey(new Date('2027-01-02T03:04:05Z')), '2027-01-02');
});

test('control() defaults to not paused with no stop requests', (t) => {
  const { store } = makeStore(t);
  assert.deepEqual(store.control(), { paused: false, stop: [], dailyLimitNotified: '' });
});

test('setControl merges a patch, returns the result and persists it', (t) => {
  const { store, dir } = makeStore(t);
  assert.deepEqual(store.setControl({ paused: true }), { paused: true, stop: [], dailyLimitNotified: '' });
  store.setControl({ dailyLimitNotified: '2026-11-23' });
  const expected = { paused: true, stop: [], dailyLimitNotified: '2026-11-23' };
  assert.deepEqual(store.control(), expected);
  assert.deepEqual(new StateStore(dir).control(), expected);
  store.setControl({ paused: false });
  assert.equal(store.control().paused, false);
  assert.equal(store.control().dailyLimitNotified, '2026-11-23');
});

test('requestStop records each ticket once, as a string', (t) => {
  const { store } = makeStore(t);
  store.requestStop(7);
  store.requestStop('7');
  store.requestStop('8');
  store.requestStop(7);
  assert.deepEqual(store.control().stop, ['7', '8']);
});

test('requestStop keeps the other controls', (t) => {
  const { store } = makeStore(t);
  store.setControl({ paused: true });
  store.requestStop('7');
  assert.equal(store.control().paused, true);
});

test('clearStop removes only the named ticket', (t) => {
  const { store } = makeStore(t);
  store.requestStop('7');
  store.requestStop('8');
  store.clearStop(7);
  assert.deepEqual(store.control().stop, ['8']);
  store.clearStop('not-there');
  assert.deepEqual(store.control().stop, ['8']);
  store.clearStop('8');
  assert.deepEqual(store.control().stop, []);
});

test('a corrupt control.json falls back to the defaults', (t) => {
  const { store, dir } = makeStore(t);
  fs.writeFileSync(path.join(dir, 'control.json'), '{ not json');
  assert.deepEqual(store.control(), { paused: false, stop: [], dailyLimitNotified: '' });
  store.requestStop('1');
  assert.deepEqual(store.control().stop, ['1']);
});

test('a corrupt spend.json reads as nothing spent', (t) => {
  const { store, dir } = makeStore(t);
  fs.writeFileSync(path.join(dir, 'spend.json'), 'garbage');
  assert.equal(store.spentToday(), 0);
  store.addSpend(2);
  assert.equal(store.spentToday(), 2);
});

test('a corrupt state.json is ignored rather than throwing', (t) => {
  const { store, dir } = makeStore(t);
  store.save({ ticketId: 'good', status: 'running', createdAt: 'a' });
  fs.mkdirSync(path.join(dir, 'runs', 'bad'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'runs', 'bad', 'state.json'), '{"ticketId": "bad", ');
  fs.mkdirSync(path.join(dir, 'runs', 'empty'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'runs', 'empty', 'state.json'), '');
  assert.equal(store.load('bad'), null);
  assert.equal(store.load('empty'), null);
  assert.deepEqual(store.all().map((r) => r.ticketId), ['good']);
  assert.deepEqual(store.active().map((r) => r.ticketId), ['good']);
});

test('a stray file in runs/ does not break all()', (t) => {
  const { store, dir } = makeStore(t);
  store.save({ ticketId: 'good', status: 'running', createdAt: 'a' });
  fs.writeFileSync(path.join(dir, 'runs', 'README.txt'), 'not a run');
  assert.deepEqual(store.all().map((r) => r.ticketId), ['good']);
});

test('ticket ids with unsafe characters become one safe directory name', (t) => {
  const { store, dir } = makeStore(t);
  const runs = path.join(dir, 'runs');
  const ids = ['PROJ/12', '..\\..\\evil', '../../etc/passwd', 'C:\\Windows', 'a b*c?d|e<f>g"h', 'owner/repo#15', 'tab\there', 'nul\0byte'];
  for (const id of ids) {
    const runDir = store.runDir(id);
    assert.equal(path.dirname(runDir), runs, `${JSON.stringify(id)} must map to a direct child of runs/`);
    assert.match(path.basename(runDir), /^[A-Za-z0-9._-]+$/, `${JSON.stringify(id)} must map to a safe name`);
    assert.match(safeId(id), /^[A-Za-z0-9._-]+$/);
  }
  assert.equal(safeId('PROJ/12'), 'PROJ_12');
  assert.equal(safeId('abc-1.2_x'), 'abc-1.2_x', 'safe ids are unchanged');
  assert.equal(safeId(15), '15');
});

test('a run with an unsafe ticket id round-trips and keeps its real id', (t) => {
  const { store, dir } = makeStore(t);
  store.save({ ticketId: 'PROJ/12', status: 'running', createdAt: 'a' });
  store.event('PROJ/12', 'claimed');
  assert.equal(store.load('PROJ/12').ticketId, 'PROJ/12');
  assert.equal(store.events('PROJ/12')[0].ticketId, 'PROJ/12');
  assert.deepEqual(fs.readdirSync(path.join(dir, 'runs')), ['PROJ_12']);
  assert.deepEqual(store.all().map((r) => r.ticketId), ['PROJ/12']);
});

for (const id of ['..', '.']) {
  test(`the ticket id ${JSON.stringify(id)} cannot escape or alias the runs directory`, (t) => {
    const { store, dir } = makeStore(t);
    const runs = path.join(dir, 'runs');
    const runDir = store.runDir(id);
    assert.ok(isInside(runs, runDir), `runDir(${JSON.stringify(id)}) resolved to ${runDir}, which is not inside ${runs}`);
    store.save({ ticketId: id, status: 'running', createdAt: 'a' });
    assert.ok(!fs.existsSync(path.join(dir, 'state.json')), 'state.json must not be written into the data directory root');
    assert.ok(!fs.existsSync(path.join(runs, 'state.json')), 'state.json must not be written into runs/ itself');
  });
}

test('transcriptPath is inside the run directory, creates it, and names stage and attempt', (t) => {
  const { store } = makeStore(t);
  const file = store.transcriptPath('PROJ/12', 'build', 3);
  const dir = path.join(store.runDir('PROJ/12'), 'transcripts');
  assert.equal(path.dirname(file), dir);
  assert.ok(fs.statSync(dir).isDirectory());
  assert.match(path.basename(file), /^build-03-\d+\.json$/);
});
