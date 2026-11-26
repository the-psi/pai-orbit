'use strict';
// The independent review: a second agent that did not write the change reviews it before it
// reaches a person. It gives a second opinion; it never approves a merge and never edits the work.

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeRig } = require('./helpers');

const ON = { stages: { playwright: false, review: true, independentReview: true }, runner: { type: 'fake', reviewModel: 'second-model' } };
const verdict = (v, findings = [], extra = {}) => ({ result: { status: 'done', summary: 'Reviewed.', review: { verdict: v, findings } }, ...extra });
const BLOCK = { severity: 'blocking', file: 'src/feature.txt', text: 'The empty-name case is not handled.' };
const NOTE = { severity: 'note', file: 'README.md', text: 'Consider documenting this.' };

test('off by default: no independent review stage runs', async (t) => {
  const rig = makeRig();
  t.after(rig.cleanup);
  await rig.addTicket('1');
  await rig.factory.runUntilIdle();
  assert.ok(!rig.runner.calls.some((c) => c.stage === 'verify'));
  assert.equal(rig.run('1').pending.gate, 'merge');
});

test('approve: runs after the factory\'s own review, with its own model and no edit tools, then a person still decides', async (t) => {
  const rig = makeRig({ config: ON, handler: (req) => (req.stage === 'verify' ? verdict('approve', [NOTE]) : undefined) });
  t.after(rig.cleanup);
  await rig.addTicket('1');
  await rig.factory.runUntilIdle();
  const stages = rig.runner.calls.map((c) => c.stage);
  assert.deepEqual(stages, ['groom', 'design', 'build', 'test', 'review', 'verify'], rig.logs.join('\n'));
  const call = rig.runner.calls.at(-1);
  assert.equal(call.model, 'second-model');
  assert.deepEqual(call.denyTools, ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
  assert.match(call.prompt, /INDEPENDENT reviewer/);
  assert.equal(rig.runner.calls[2].model, undefined, 'other stages use the usual model');

  const run = rig.run('1');
  assert.equal(run.status, 'waiting_approval', 'the reviewer\'s approval does not merge anything');
  assert.equal(run.pending.gate, 'merge');
  assert.equal((await rig.codeHost.prStatus(run.pr.id)).state, 'open');
  assert.equal(run.independentReview.verdict, 'approve');
  assert.equal(run.independentReview.unresolved, false);
  const ask = rig.comments('1').at(-1).body;
  assert.match(ask, /Independent review: approved/);
  assert.match(ask, /Consider documenting this\./);
  assert.match(ask, /does not replace your approval/);
});

test('request changes: the work goes back to build with the findings, and is reviewed again', async (t) => {
  let reviews = 0;
  const rig = makeRig({ config: ON, handler: (req) => {
    if (req.stage !== 'verify') return undefined;
    reviews += 1;
    return reviews === 1 ? verdict('request_changes', [BLOCK, NOTE]) : verdict('approve');
  } });
  t.after(rig.cleanup);
  await rig.addTicket('1');
  await rig.factory.runUntilIdle();
  const stages = rig.runner.calls.map((c) => c.stage);
  assert.deepEqual(stages, ['groom', 'design', 'build', 'test', 'review', 'verify', 'build', 'test', 'review', 'verify'], rig.logs.join('\n'));
  const rebuild = rig.runner.calls[6];
  assert.match(rebuild.prompt, /from: independent review/);
  assert.match(rebuild.prompt, /src\/feature\.txt: The empty-name case is not handled\./);
  assert.ok(!/Consider documenting this/.test(rebuild.prompt), 'notes are not sent back as must-fix work');
  const run = rig.run('1');
  assert.equal(run.pending.gate, 'merge');
  assert.equal(run.independentReview.verdict, 'approve');
  assert.equal(run.independentReview.round, 2);
  assert.match(rig.comments('1').at(-1).body, /Independent review: approved\*\* after 1 round\(s\) of fixes/);
});

test('still requesting changes after the allowed rounds: it goes to a person, clearly flagged', async (t) => {
  const rig = makeRig({ config: { ...ON, limits: { independentReviewRounds: 1 } }, handler: (req) => (req.stage === 'verify' ? verdict('request_changes', [BLOCK]) : undefined) });
  t.after(rig.cleanup);
  await rig.addTicket('1');
  await rig.factory.runUntilIdle();
  assert.equal(rig.runner.calls.filter((c) => c.stage === 'verify').length, 2, 'one round of fixes, then stop');
  const run = rig.run('1');
  assert.equal(run.status, 'waiting_approval', `handed back instead: ${run.handBackReason || ''}`);
  assert.equal(run.pending.gate, 'merge');
  assert.equal(run.independentReview.unresolved, true);
  assert.match(rig.comments('1').at(-1).body, /Independent review: changes still requested/);
  assert.match(rig.comments('1').at(-1).body, /\*\*Blocking\*\* \(`src\/feature\.txt`\)/);
  assert.ok(!rig.events('1').includes('handed_back'));
});

test('the reviewer cannot change the work: anything it writes or commits is discarded', async (t) => {
  const { git } = require('./helpers');
  const rig = makeRig({ config: ON, handler: (req) => {
    if (req.stage !== 'verify') return undefined;
    git(req.cwd, 'commit', '--quiet', '--allow-empty', '-m', 'reviewer sneaks in a commit');
    return verdict('approve', [], { write: { 'src/feature.txt': 'rewritten by the reviewer\n', 'reviewer-notes.md': 'x\n' } });
  } });
  t.after(rig.cleanup);
  await rig.addTicket('1');
  await rig.factory.runUntilIdle();
  const run = rig.run('1');
  assert.equal(run.pending.gate, 'merge', rig.logs.join('\n'));
  assert.equal(rig.remoteGit('show', `${run.branch}:src/feature.txt`), 'built by the fake runner');
  const files = rig.remoteGit('ls-tree', '-r', '--name-only', run.branch);
  assert.ok(!files.includes('reviewer-notes.md'));
  assert.ok(!/reviewer sneaks in a commit/.test(rig.remoteGit('log', '--oneline', run.branch)));
});

test('a review with no verdict is not accepted', async (t) => {
  const rig = makeRig({ config: ON, handler: (req) => (req.stage === 'verify' ? { result: { status: 'done', summary: 'Looks fine.' } } : undefined) });
  t.after(rig.cleanup);
  await rig.addTicket('1');
  await rig.factory.runUntilIdle();
  const run = rig.run('1');
  assert.equal(run.status, 'handed_back');
  assert.match(run.handBackReason, /without a verdict/);
  assert.equal(run.pr, null, 'no pull request was opened on an unreviewed change');
});

test('request_changes with only notes counts as approval: nothing is blocking', async (t) => {
  const rig = makeRig({ config: ON, handler: (req) => (req.stage === 'verify' ? verdict('request_changes', [NOTE]) : undefined) });
  t.after(rig.cleanup);
  await rig.addTicket('1');
  await rig.factory.runUntilIdle();
  assert.equal(rig.runner.calls.filter((c) => c.stage === 'verify').length, 1);
  assert.equal(rig.run('1').independentReview.verdict, 'approve');
});
