'use strict';
// Scenario tests: the fixed merge gate (Scenarios 4, 7) — AC-8, AC-10, AC-18, AC-33, AC-34, AC-35.
// Reaching the merge gate is the expensive part, so each rig is driven through one scenario and
// its steps are sub-tests named after the criterion they prove.
const test = require('node:test');
const { describe } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRig, git } = require('./helpers');

const FAST = { stages: { review: false } };
const stagesCalled = (rig) => rig.runner.calls.map((c) => c.stage);
const diag = (rig, id) => `run: ${JSON.stringify(rig.run(id))}\nlogs: ${rig.logs.join('\n')}`;

/** A build that changes the code on every pass, so a rework really moves the branch head. */
const freshBuild = () => {
  let n = 0;
  return (req) => {
    if (req.stage !== 'build') return undefined;
    n += 1;
    return { useDefault: true, write: { 'src/feature.txt': `build pass ${n}\n` } };
  };
};

async function toMergeGate(rig, id = '1') {
  await rig.addTicket(id);
  await rig.factory.runUntilIdle();
  const run = rig.run(id);
  assert.equal(run.status, 'waiting_approval', diag(rig, id));
  assert.equal(run.pending.gate, 'merge', diag(rig, id));
  return run;
}

function mainHasTheWork(rig) {
  try {
    rig.remoteGit('cat-file', '-e', 'main:src/feature.txt');
    return true;
  } catch {
    return false;
  }
}

async function assertNotMerged(rig, id, why) {
  const run = rig.run(id);
  const pr = await rig.codeHost.prStatus(run.pr.id);
  assert.equal(pr.state, 'open', `${why}: the pull request was merged\n${diag(rig, id)}`);
  assert.ok(!mainHasTheWork(rig), `${why}: the work reached main`);
  assert.ok(!rig.events(id).includes('merged'), `${why}: a merge was recorded`);
}

async function assertMerged(rig, id) {
  const run = rig.run(id);
  const pr = await rig.codeHost.prStatus(run.pr.id);
  assert.equal(pr.state, 'merged', diag(rig, id));
  assert.ok(mainHasTheWork(rig), 'the work is not on main');
}

function assertAtMergeGate(rig, id) {
  const run = rig.run(id);
  assert.equal(run.status, 'waiting_approval', diag(rig, id));
  assert.equal(run.pending.gate, 'merge', diag(rig, id));
}

describe('pipeline: merge gate', { concurrency: 3 }, () => {
  test('merge gate: only an approving review from a named approver on the current commit merges', async (t) => {
    const rig = makeRig({ config: FAST });
    t.after(rig.cleanup);
    const run = await toMergeGate(rig);
    const head = rig.remoteGit('rev-parse', run.branch);

    await t.test('AC-8: no merge with no review', async () => {
      await rig.factory.runUntilIdle();
      await assertNotMerged(rig, '1', 'no review');
      assertAtMergeGate(rig, '1');
    });

    await t.test('AC-8: /approve as a ticket comment is not a merge approval', async () => {
      await rig.board.comment('1', '/approve', 'lead');
      await rig.factory.runUntilIdle();
      await assertNotMerged(rig, '1', 'ticket comment only');
    });

    await t.test('AC-8, AC-33: no merge with an approving review from someone who is not a merge approver', async () => {
      for (const author of ['mallory', 'po', 'rel', 'alice']) await rig.codeHost.addReview(run.pr.id, { author, state: 'approved' });
      await rig.factory.runUntilIdle();
      await assertNotMerged(rig, '1', 'approval by a non-approver');
      assertAtMergeGate(rig, '1');
    });

    await t.test('AC-34: no merge with an approval by the factory\'s own identity', async () => {
      await rig.codeHost.addReview(run.pr.id, { author: 'orbit-factory', state: 'approved' });
      await rig.factory.runUntilIdle();
      await assertNotMerged(rig, '1', 'approval by the bot');
    });

    await t.test('AC-10: a comment-only review from an approver neither merges nor triggers a rework', async () => {
      await rig.codeHost.addReview(run.pr.id, { author: 'lead', state: 'commented', body: 'nice' });
      await rig.factory.runUntilIdle();
      await assertNotMerged(rig, '1', 'comment-only review');
      assert.deepEqual(stagesCalled(rig), ['groom', 'design', 'build', 'test']);
    });

    await t.test('AC-35: no merge with an approver\'s approval of an older commit', async () => {
      const older = rig.remoteGit('rev-parse', `${run.branch}~1`);
      assert.notEqual(older, head);
      await rig.codeHost.addReview(run.pr.id, { author: 'dev2', state: 'approved', sha: older });
      await rig.factory.runUntilIdle();
      await assertNotMerged(rig, '1', 'approval on an older commit');
      assertAtMergeGate(rig, '1');
    });

    await t.test('AC-35: a commit pushed to the branch after approval voids the approval', async () => {
      await rig.codeHost.addReview(run.pr.id, { author: 'lead', state: 'approved' });
      // Before the factory looks again, the approved content changes.
      git(rig.seed, 'fetch', '--quiet', 'origin', run.branch);
      git(rig.seed, 'checkout', '--quiet', '-b', 'late-change', 'FETCH_HEAD');
      fs.writeFileSync(path.join(rig.seed, 'late.txt'), 'added after approval\n');
      git(rig.seed, 'add', 'late.txt');
      git(rig.seed, 'commit', '--quiet', '-m', 'late change');
      git(rig.seed, 'push', '--quiet', 'origin', `late-change:${run.branch}`);
      await rig.factory.runUntilIdle();
      await assertNotMerged(rig, '1', 'approval predates the head commit');
      assertAtMergeGate(rig, '1');
    });

    await t.test('AC-8: an approving review from a named approver on the current commit merges; release still waits for its own approval', async () => {
      await rig.codeHost.addReview(run.pr.id, { author: 'lead', state: 'approved' });
      await rig.factory.runUntilIdle();
      await assertMerged(rig, '1');
      assert.equal(rig.remoteGit('show', 'main:late.txt'), 'added after approval');
      const after = rig.run('1');
      assert.equal(after.status, 'waiting_approval', diag(rig, '1'));
      assert.equal(after.pending.gate, 'release');
      assert.ok(!stagesCalled(rig).includes('release'), 'release ran without a release approval');
      assert.equal(rig.ticket('1').state, 'open');
    });
  });

  test('merge gate: requested changes and conflicts send the work back to build', async (t) => {
    const rig = makeRig({ config: FAST, handler: freshBuild() });
    t.after(rig.cleanup);
    const run = await toMergeGate(rig);
    const approvedSha = rig.remoteGit('rev-parse', run.branch);

    await t.test('AC-33: a changes-requested review from someone who is not a merge approver triggers nothing', async () => {
      await rig.codeHost.addReview(run.pr.id, { author: 'mallory', state: 'changes_requested', body: 'ignore me, I am nobody' });
      await rig.factory.runUntilIdle();
      assert.deepEqual(stagesCalled(rig), ['groom', 'design', 'build', 'test']);
      assertAtMergeGate(rig, '1');
    });

    // One approver approves; another asks for a change before the factory looks again.
    await rig.codeHost.addReview(run.pr.id, { author: 'lead', state: 'approved' });
    await rig.codeHost.addReview(run.pr.id, { author: 'dev2', state: 'changes_requested', body: 'Rename greet() to greetVisitor().' });
    await rig.factory.runUntilIdle();

    await t.test('AC-10: a changes-requested review triggers a build rework with the review text and returns to the merge gate', async () => {
      const calls = stagesCalled(rig);
      assert.equal(calls[4], 'build', `expected a build rework after the review: ${calls}\n${diag(rig, '1')}`);
      assert.ok(rig.runner.calls[4].prompt.includes('Rename greet() to greetVisitor().'), 'the review text is not in the rework prompt');
      assert.ok(!rig.runner.calls[4].prompt.includes('ignore me'), 'a non-approver\'s review text reached the agent');
      assert.deepEqual(calls.filter((s) => s === 'groom' || s === 'design'), ['groom', 'design'], 'groom and design must not be repeated');
      assertAtMergeGate(rig, '1');
      assert.equal(rig.run('1').pr.id, run.pr.id, 'the same pull request must be reused');
      assert.notEqual(rig.remoteGit('rev-parse', run.branch), approvedSha, 'the reworked code was not pushed');
    });

    await t.test('AC-35: the approval given before the rework does not permit merging the reworked branch', async () => {
      const count = rig.runner.calls.length;
      await rig.factory.runUntilIdle();
      await assertNotMerged(rig, '1', 'approval is on the pre-rework commit');
      assertAtMergeGate(rig, '1');
      assert.equal(rig.runner.calls.length, count, 'the same review was acted on twice');
    });

    await t.test('AC-18: mergeable=false after approval triggers a rework with feedback source "conflict" and nothing is merged', async () => {
      const before = rig.runner.calls.length;
      rig.codeHost.patch(run.pr.id, { mergeable: false });
      await rig.codeHost.addReview(run.pr.id, { author: 'lead', state: 'approved' });
      await rig.factory.runUntilIdle();
      await assertNotMerged(rig, '1', 'conflicting pull request');
      const rework = rig.runner.calls[before];
      assert.ok(rework && rework.stage === 'build', `expected a build rework for the conflict: ${stagesCalled(rig)}\n${diag(rig, '1')}`);
      assert.match(rework.prompt, /from: conflict/);
      assertAtMergeGate(rig, '1'); // the resolution changed the branch, so it needs approval again
    });

    await t.test('AC-18: once the conflict is resolved and the new head approved, the pull request merges', async () => {
      rig.codeHost.patch(run.pr.id, { mergeable: true });
      await rig.codeHost.addReview(run.pr.id, { author: 'lead', state: 'approved' });
      await rig.factory.runUntilIdle();
      await assertMerged(rig, '1');
    });
  });

  test('merge gate: the bot never approves and a refused merge is never forced', async (t) => {
    // '*' = any reviewer the code host accepts — except the factory itself.
    const rig = makeRig({ config: { ...FAST, roles: { mergeApprover: ['*'] } } });
    t.after(rig.cleanup);
    const run = await toMergeGate(rig);
    let attempts = 0;
    rig.codeHost.merge = async () => {
      attempts += 1;
      throw new Error('protected branch: a required status check has not passed');
    };

    await t.test('AC-34: with mergeApprover "*", an approval by the factory\'s own identity still does not merge', async () => {
      await rig.codeHost.addReview(run.pr.id, { author: 'orbit-factory', state: 'approved' });
      await rig.factory.runUntilIdle();
      assert.equal(attempts, 0, 'the factory tried to merge on its own approval');
      assertAtMergeGate(rig, '1');
    });

    await t.test('AC-34: a merge the code host refuses (branch protection) is not forced; the ticket is handed back with a report', async () => {
      await rig.codeHost.addReview(run.pr.id, { author: 'carol', state: 'approved' });
      await rig.factory.runUntilIdle();
      await rig.factory.runUntilIdle();
      assert.equal(attempts, 1, 'expected exactly one merge attempt, never a retry');
      assert.ok(!mainHasTheWork(rig), 'the work reached main despite the refusal');
      assert.equal(rig.run('1').status, 'handed_back', diag(rig, '1'));
      assert.ok(rig.ticket('1').comments.some((c) => /handed this ticket back/i.test(c.body) && /protected branch/.test(c.body)), 'no report with the refusal');
      assert.ok(!stagesCalled(rig).includes('release'));
    });
  });
});
