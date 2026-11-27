'use strict';
// The model each stage runs on is one setting: runner.models, with `default` as the fallback.

const test = require('node:test');
const assert = require('node:assert/strict');
const { fromObject, modelFor, MODEL_STAGES } = require('../src/config');
const { STAGES } = require('../src/stages');
const { ClaudeCliRunner } = require('../src/runners/claude-cli');
const { makeRig } = require('./helpers');

const BASE = { repo: { url: 'https://example.invalid/acme/app.git' }, roles: { mergeApprover: ['lead'], releaseApprover: ['rel'] } };
const cfg = (runner) => fromObject({ ...BASE, runner: { type: 'fake', ...runner } });

test('every stage an agent runs can be given a model, and no other name can', () => {
  const agentStages = STAGES.filter((s) => s.kind === 'agent').map((s) => s.name);
  assert.deepEqual([...MODEL_STAGES].sort(), [...agentStages].sort());
  assert.throws(() => cfg({ models: { merge: 'opus' } }), /runner\.models\.merge: unknown stage/);
  assert.throws(() => cfg({ models: { biuld: 'opus' } }), /runner\.models\.biuld: unknown stage/);
  assert.throws(() => cfg({ models: { build: 5 } }), /runner\.models\.build must be a model name/);
  assert.throws(() => cfg({ models: 'opus' }), /runner\.models must be an object/);
});

test('models are chosen in one place: the two older settings are refused with the new name', () => {
  assert.throws(() => cfg({ model: 'sonnet' }), /runner\.model is not a setting; use runner\.models\.default/);
  assert.throws(() => cfg({ reviewModel: 'opus' }), /runner\.reviewModel is not a setting; use runner\.models\.verify/);
});

test('with nothing set, every stage uses the agent CLI default', () => {
  const c = cfg({});
  for (const s of MODEL_STAGES) assert.equal(modelFor(c, s), '');
});

test('default is the model of every stage that has no entry of its own', () => {
  const c = cfg({ models: { default: 'usual' } });
  for (const s of MODEL_STAGES) assert.equal(modelFor(c, s), 'usual');
});

test('a stage with its own model uses it; the others keep the default', () => {
  const c = cfg({ models: { default: 'usual', groom: 'small', build: ' big ', verify: 'second' } });
  assert.equal(modelFor(c, 'groom'), 'small');
  assert.equal(modelFor(c, 'build'), 'big');
  assert.equal(modelFor(c, 'verify'), 'second');
  assert.equal(modelFor(c, 'design'), 'usual');
  assert.equal(modelFor(c, 'review'), 'usual');
});

test('a stage model works without a default', () => {
  const c = cfg({ models: { verify: 'second' } });
  assert.equal(modelFor(c, 'verify'), 'second');
  assert.equal(modelFor(c, 'build'), '');
});

test('the model of a run reaches the agent CLI as --model', () => {
  const runner = new ClaudeCliRunner({ command: 'claude', model: 'usual', pluginDir: '/p', permissionMode: 'acceptEdits', allowedTools: ['Read'], disallowedTools: [] });
  const modelArg = (args) => args[args.indexOf('--model') + 1];
  assert.equal(modelArg(runner.args({ budgetUsd: 1, model: 'big' }, 'sid')), 'big');
  assert.equal(modelArg(runner.args({ budgetUsd: 1 }, 'sid')), 'usual');
});

test('a ticket runs each stage on the model set for it, and the audit trail says which', async (t) => {
  const rig = makeRig({
    config: {
      stages: { playwright: false, review: true, independentReview: true },
      runner: { type: 'fake', models: { default: 'usual', groom: 'small', build: 'big', verify: 'second' } },
    },
  });
  t.after(rig.cleanup);
  await rig.addTicket('1');
  await rig.factory.runUntilIdle();
  const used = Object.fromEntries(rig.runner.calls.map((c) => [c.stage, c.model]));
  assert.deepEqual(used, { groom: 'small', design: 'usual', build: 'big', test: 'usual', review: 'usual', verify: 'second' });
  const started = rig.store.events('1').filter((e) => e.type === 'stage_start');
  assert.deepEqual(Object.fromEntries(started.map((e) => [e.stage, e.model])), used);
});

test('with no model set, no stage is given one and the trail says default', async (t) => {
  const rig = makeRig({ config: { stages: { review: false } } });
  t.after(rig.cleanup);
  await rig.addTicket('1');
  await rig.factory.runUntilIdle();
  assert.ok(rig.runner.calls.length >= 4);
  for (const c of rig.runner.calls) assert.equal(c.model, undefined, `${c.stage} was given a model`);
  for (const e of rig.store.events('1').filter((x) => x.type === 'stage_start')) assert.equal(e.model, 'default');
});
