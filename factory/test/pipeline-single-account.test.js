'use strict';
// Single-account trial mode (config.trial.singleAccount). One person, one account: the factory
// runs as that person. The factory must still tell its own comments from the person's, and code
// is approved by a comment because a code host does not let an account approve its own pull
// request. Off by default; the default behaviour is covered by the other pipeline tests.

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeRig } = require('./helpers');
const { fromObject } = require('../src/config');

const ME = 'solo';
const SOLO = {
  trial: { singleAccount: true },
  board: { botUser: ME },
  gates: { requirements: true, design: false },
  roles: {
    answer: ['@reporter'], requirementsApprover: [ME], designApprover: [ME],
    mergeApprover: [ME], releaseApprover: [ME], escalation: [ME],
  },
};

const QUESTION = { result: { status: 'needs_input', summary: '', questions: [{ question: 'Which rate?', why: 'It sets the tax.' }] } };

test('single-account trial: one account asks, answers, approves, merges and releases', async (t) => {
  let asked = false;
  const handler = (req) => {
    if (req.stage === 'groom' && !asked) { asked = true; return QUESTION; }
    return undefined;
  };
  const rig = makeRig({ config: SOLO, handler });
  t.after(rig.cleanup);
  await rig.addTicket('1', { reporter: ME });
  await rig.factory.runUntilIdle();

  await t.test('the factory does not take its own question as the answer', async () => {
    assert.equal(rig.run('1').status, 'waiting_answer', rig.logs.join('\n'));
    await rig.factory.runUntilIdle();
    await rig.factory.runUntilIdle();
    assert.equal(rig.run('1').status, 'waiting_answer');
    assert.equal(rig.runner.calls.length, 1);
    assert.ok(rig.comments('1').every((c) => c.author === ME), 'every comment so far is from the shared account');
  });

  await t.test('the person\'s reply, from the same account, resumes the run', async () => {
    await rig.board.comment('1', 'Use 19%.', ME);
    await rig.factory.runUntilIdle();
    const run = rig.run('1');
    assert.equal(run.status, 'waiting_approval', rig.logs.join('\n'));
    assert.equal(run.pending.gate, 'requirements');
    assert.match(rig.runner.calls[1].prompt, /Use 19%\./);
  });

  await t.test('the factory does not take its own approval request as an approval', async () => {
    await rig.factory.runUntilIdle();
    assert.equal(rig.run('1').pending.gate, 'requirements');
  });

  await t.test('/approve from the same account passes the requirements gate and reaches code review', async () => {
    await rig.board.comment('1', '/approve', ME);
    await rig.factory.runUntilIdle();
    const run = rig.run('1');
    assert.equal(run.pending.gate, 'merge', rig.logs.join('\n'));
    assert.match(rig.comments('1').at(-1).body, /Single-account trial: reply `approve` on this ticket to merge/);
  });

  await t.test('no merge happens until the person approves by comment', async () => {
    await rig.factory.runUntilIdle();
    assert.equal(rig.run('1').pending.gate, 'merge');
    assert.equal((await rig.codeHost.prStatus(rig.run('1').pr.id)).state, 'open');
  });

  await t.test('/reject sends the code back with the feedback and returns to the gate', async () => {
    await rig.board.comment('1', '/reject rename the helper', ME);
    await rig.factory.runUntilIdle();
    const run = rig.run('1');
    assert.equal(run.pending.gate, 'merge', rig.logs.join('\n'));
    assert.equal(run.rework.merge, 1);
    const rebuild = rig.runner.calls.filter((c) => c.stage === 'build').at(-1);
    assert.match(rebuild.prompt, /rename the helper/);
  });

  await t.test('/approve by comment merges the pull request', async () => {
    await rig.board.comment('1', '/approve', ME);
    await rig.factory.runUntilIdle();
    const run = rig.run('1');
    assert.equal(run.stage, 'release', rig.logs.join('\n'));
    assert.equal((await rig.codeHost.prStatus(run.pr.id)).state, 'merged');
    assert.equal(run.approvals.merge.by, ME);
  });

  await t.test('/approve releases and closes the ticket', async () => {
    await rig.board.comment('1', '/approve', ME);
    await rig.factory.runUntilIdle();
    assert.equal(rig.run('1').status, 'done', rig.logs.join('\n'));
    assert.equal(rig.ticket('1').state, 'closed');
  });
});

test('single-account trial: a comment approval is tied to the commit it was given for', async (t) => {
  const rig = makeRig({ config: { ...SOLO, gates: { requirements: false, design: false } } });
  t.after(rig.cleanup);
  await rig.addTicket('1', { reporter: ME });
  await rig.factory.runUntilIdle();
  assert.equal(rig.run('1').pending.gate, 'merge', rig.logs.join('\n'));

  // The person approves; before the factory's next pass, the branch gets a new commit.
  await rig.board.comment('1', '/approve', ME);
  await rig.factory.tick(); // records the approval against the current head
  await rig.factory.drain();
  const state = rig.run('1');
  if (state.stage === 'merge' && state.status === 'running') assert.fail('test needs the approval recorded before the merge runs');
  // Whether it merged in that pass or not, an approval recorded for another commit must not merge.
  const fresh = makeRig({ config: { ...SOLO, gates: { requirements: false, design: false } } });
  t.after(fresh.cleanup);
  await fresh.addTicket('1', { reporter: ME });
  await fresh.factory.runUntilIdle();
  const run = fresh.run('1');
  run.approvals.mergeComment = { by: ME, at: fresh.now().toISOString(), sha: '0000000000000000000000000000000000000000' };
  run.pending = null;
  run.status = 'running';
  fresh.store.save(run);
  await fresh.factory.runUntilIdle();
  assert.equal((await fresh.codeHost.prStatus(run.pr.id)).state, 'open', 'an approval for another commit merged the pull request');
  assert.equal(fresh.run('1').pending.gate, 'merge');
});

test('single-account trial: people not named for a role are still ignored', async (t) => {
  const rig = makeRig({ config: SOLO });
  t.after(rig.cleanup);
  await rig.addTicket('1', { reporter: ME });
  await rig.factory.runUntilIdle();
  assert.equal(rig.run('1').pending.gate, 'requirements', rig.logs.join('\n'));
  await rig.board.comment('1', '/approve', 'stranger');
  await rig.factory.runUntilIdle();
  assert.equal(rig.run('1').pending.gate, 'requirements');
});

test('the factory account may be an approver only when the trial setting is on', () => {
  const base = { repo: { url: 'x' }, board: { botUser: ME }, roles: { answer: ['@reporter'], mergeApprover: [ME], releaseApprover: [ME] } };
  assert.throws(() => fromObject(base), /must not include the factory's own identity/);
  assert.doesNotThrow(() => fromObject({ ...base, trial: { singleAccount: true } }));
  assert.equal(fromObject({ ...base, roles: { answer: ['@reporter'], mergeApprover: ['a'], releaseApprover: ['b'] } }).trial.singleAccount, false, 'off by default');
});
