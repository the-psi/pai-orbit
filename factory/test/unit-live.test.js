'use strict';
// Live activity: the runner turns the agent's output stream into short lines a person can read,
// and the status page shows them for the stage in flight.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { activityText, liveWriter, parseOutput } = require('../src/runners/claude-cli');
const { StateStore } = require('../src/state');
const { summarise } = require('../src/ui/server');

const use = (name, input) => ({ type: 'tool_use', name, input });

test('each kind of step becomes one readable line', () => {
  const cwd = '/data/workspaces/1/repo';
  assert.equal(activityText(use('Read', { file_path: `${cwd}/src/tax.js` }), cwd), 'Reading src/tax.js');
  assert.equal(activityText(use('Edit', { file_path: `${cwd}/src/index.js` }), cwd), 'Editing src/index.js');
  assert.equal(activityText(use('Write', { file_path: `${cwd}/docs/features/x/design.md` }), cwd), 'Writing docs/features/x/design.md');
  assert.equal(activityText(use('Bash', { command: 'npm test', description: 'Run the test suite' }), cwd), 'Running: Run the test suite');
  assert.equal(activityText(use('Bash', { command: 'git   status\n--short' }), cwd), 'Running: git status --short');
  assert.equal(activityText(use('Grep', { pattern: 'taxFor' }), cwd), 'Searching the code for: taxFor');
  assert.equal(activityText(use('Bash', { command: `cd ${cwd}; ls docs; cat ${cwd}/CLAUDE.md` }), cwd), 'Running: ls docs; cat CLAUDE.md');
  assert.equal(activityText(use('Bash', { command: `cd ${cwd} && npm test` }), cwd), 'Running: npm test');
  assert.equal(activityText(use('Glob', { pattern: 'src/**/*.js' }), cwd), 'Looking for files: src/**/*.js');
  assert.equal(activityText(use('StructuredOutput', { status: 'done' }), cwd), 'Writing the stage result');
  assert.equal(activityText(use('SomethingNew', {}), cwd), 'Using SomethingNew');
  assert.equal(activityText({ type: 'text', text: '  I will add the DE rate.  ' }, cwd), 'Says: I will add the DE rate.');
  assert.equal(activityText({ type: 'text', text: '   ' }, cwd), '');
  assert.equal(activityText({ type: 'thinking', thinking: 'x' }, cwd), '');
  assert.ok(activityText(use('Bash', { command: 'x'.repeat(500) }), cwd).length <= 150, 'long commands are shortened');
  // A Windows path, written with forward slashes inside the test to keep it readable.
  const win = (p) => p.split('/').join(String.fromCharCode(92));
  assert.equal(activityText(use('Read', { file_path: win('C:/work/repo/a.js') }), win('C:/work/repo')), 'Reading a.js');
});

test('the stream is written to the live file as it arrives, even when split mid-line', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-factory-live-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  const livePath = path.join(dir, 'runs', '1', 'live.jsonl');
  const feed = liveWriter({ livePath, cwd: '/w', stage: 'build' });
  const line = (o) => `${JSON.stringify(o)}\n`;
  const a = line({ type: 'assistant', message: { content: [use('Read', { file_path: '/w/a.js' })] } });
  feed(line({ type: 'system', subtype: 'init' }));
  feed(a.slice(0, 25));
  assert.equal(fs.readFileSync(livePath, 'utf8'), '', 'half a line is not a step yet');
  feed(a.slice(25));
  feed('not json at all\n');
  feed(line({ type: 'user', message: { content: [{ type: 'tool_result' }] } }));
  feed(line({ type: 'assistant', message: { content: [use('Bash', { command: 'npm test' }), { type: 'text', text: 'Done.' }] } }));
  feed(line({ type: 'result', subtype: 'success', structured_output: { status: 'done', summary: '' } }));
  const steps = fs.readFileSync(livePath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.deepEqual(steps.map((s) => s.text), ['Reading a.js', 'Running: npm test', 'Says: Done.']);
  assert.ok(steps.every((s) => s.stage === 'build' && s.at));
});

test('a new stage starts with an empty live file, and no live path means no listener', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-factory-live-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  const livePath = path.join(dir, 'live.jsonl');
  fs.writeFileSync(livePath, '{"text":"old step from the previous stage"}\n');
  liveWriter({ livePath, cwd: '/w', stage: 'test' });
  assert.equal(fs.readFileSync(livePath, 'utf8'), '');
  assert.equal(liveWriter({ cwd: '/w', stage: 'test' }), undefined);
});

test('the result is still found at the end of a stream', () => {
  const stream = [
    { type: 'system', subtype: 'init' },
    { type: 'assistant', message: { content: [use('Read', { file_path: 'a' })] } },
    { type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.07, session_id: 's1', structured_output: { status: 'done', summary: 'ok' } },
  ].map((o) => JSON.stringify(o)).join('\n');
  const r = parseOutput(`${stream}\n`);
  assert.equal(r.type, 'result');
  assert.equal(r.total_cost_usd, 0.07);
  assert.deepEqual(r.structured_output, { status: 'done', summary: 'ok' });
});

test('the status page shows the latest step only while that stage is running', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-factory-live-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  const store = new StateStore(dir);
  const run = { ticketId: '1', title: 'T', status: 'running', stage: 'build', costUsd: 0 };
  const started = [{ type: 'stage_start', stage: 'build', at: '2026-11-26T10:00:00.000Z' }];
  fs.writeFileSync(store.livePath('1'), [
    { at: '2026-11-26T10:00:05.000Z', stage: 'build', text: 'Reading src/tax.js' },
    { at: '2026-11-26T10:00:09.000Z', stage: 'build', text: 'Running: npm test' },
  ].map((o) => JSON.stringify(o)).join('\n'));
  const working = summarise(run, started, store.live('1'));
  assert.equal(working.doingNow, 'Running: npm test');
  assert.equal(working.steps, 2);
  const finished = summarise(run, started.concat({ type: 'stage_end', stage: 'build', status: 'done' }), store.live('1'));
  assert.equal(finished.doingNow, '', 'a finished stage shows no live step');
  const nextStage = summarise({ ...run, stage: 'test' }, [{ type: 'stage_start', stage: 'test', at: '2026-11-26T10:05:00.000Z' }], store.live('1'));
  assert.equal(nextStage.doingNow, '', 'steps from the previous stage are not shown for the next one');
  assert.deepEqual(new StateStore(path.join(dir, 'empty')).live('9'), []);
});
