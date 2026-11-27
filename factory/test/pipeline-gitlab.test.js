'use strict';
// Scenario tests: the whole pipeline on GitLab. The real GitLab board and code host run against an
// in-memory GitLab (fake-gitlab.js) and a real git remote on disk, with the fake runner. No model
// and no network. These prove the adapter through the factory, not only method by method:
// a ticket goes from a label to a release, and the merge gate holds on GitLab's own terms.

const test = require('node:test');
const { describe } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { makeRemote, makeClock, git } = require('./helpers');
const { fromObject } = require('../src/config');
const { createFactory } = require('../src/index');
const { StateStore } = require('../src/state');
const { GitLabApi } = require('../src/gitlab-api');
const { GitLabBoard } = require('../src/boards/gitlab');
const { GitLabCodeHost } = require('../src/codehosts/gitlab');
const { FakeRunner } = require('../src/runners/fake');
const { MemoryNotifier } = require('../src/notifiers');
const { FakeGitLab } = require('./fake-gitlab');

/** A build that changes the code on every pass, so a rework really moves the branch head. */
const freshBuild = () => {
  let n = 0;
  return (req) => {
    if (req.stage !== 'build') return undefined;
    n += 1;
    return { useDefault: true, write: { 'src/feature.txt': `build pass ${n}\n` } };
  };
};

function makeGitLabRig(over = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-factory-gitlab-'));
  const { remote } = makeRemote(root);
  const now = makeClock();
  const tick = () => { now.advanceMs(1000); return now(); };
  const gl = new FakeGitLab({ remote, now: tick });
  const config = fromObject({
    project: 'fixture',
    repo: { url: remote, baseBranch: 'main' },
    board: { type: 'gitlab' },
    codeHost: { type: 'gitlab' },
    roles: { answer: ['@reporter', 'po'], mergeApprover: ['lead', 'dev2'], releaseApprover: ['rel'], escalation: ['boss'] },
    runner: { type: 'fake' },
    stages: { review: false },
    ...over,
  });
  const api = new GitLabApi({ baseUrl: gl.site, project: gl.project, token: gl.token, fetch: gl.fetch });
  const labels = {
    readyLabel: config.board.readyLabel, groomedLabel: config.board.groomedLabel, ownedLabel: config.board.ownedLabel,
    waitingLabel: config.board.waitingLabel, declinedLabel: config.board.declinedLabel, botUser: config.board.botUser,
  };
  const board = new GitLabBoard({ api, ...labels, now: tick });
  const codeHost = new GitLabCodeHost({ api, mergeMethod: config.codeHost.mergeMethod, now: tick });
  const runner = new FakeRunner({ handler: freshBuild() });
  const store = new StateStore(path.join(root, 'data'), { now });
  const logs = [];
  const factory = createFactory(config, {
    dataDir: path.join(root, 'data'),
    env: { PATH: process.env.PATH, GITLAB_TOKEN: gl.token, ANTHROPIC_API_KEY: 'model-key' },
    log: (m) => logs.push(m),
    overrides: { board, codeHost, runner, notifier: new MemoryNotifier(), store, now },
  });
  factory.pushRetryDelaysMs = [];
  return {
    gl, factory, runner, store, remote, logs,
    run: (id) => store.load(id),
    events: (id) => store.events(id).map((e) => e.type),
    issue: (id) => gl.issues.get(String(id)),
    notes: (id) => gl.issues.get(String(id)).notes.filter((n) => !n.system).map((n) => n.body),
    mainHasWork: () => { try { git(remote, 'cat-file', '-e', 'main:src/feature.txt'); return true; } catch { return false; } },
    mainWork: () => git(remote, 'show', 'main:src/feature.txt'),
    builds: () => runner.calls.filter((c) => c.stage === 'build').length,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }),
  };
}

const diag = (rig, id) => `run: ${JSON.stringify(rig.run(id))}\nlogs: ${rig.logs.join('\n')}`;

function assertAtMergeGate(rig, id = '1') {
  const run = rig.run(id);
  assert.equal(run.status, 'waiting_approval', diag(rig, id));
  assert.equal(run.pending.gate, 'merge', diag(rig, id));
  return run;
}

describe('pipeline on GitLab', { concurrency: 2 }, () => {
  test('a labelled issue goes to a merge request, is merged on approval and released', async (t) => {
    const rig = makeGitLabRig();
    t.after(rig.cleanup);
    rig.gl.addIssue({ title: 'Add a greeting' });

    await rig.factory.runUntilIdle();
    const run = assertAtMergeGate(rig);
    assert.deepEqual(rig.issue(1).labels.sort(), ['factory-owned', 'factory-waiting']);
    assert.deepEqual(rig.issue(1).assignees.map((u) => u.username), ['orbit-factory']);
    const mr = rig.gl.mrs.get(run.pr.id);
    assert.equal(mr.state, 'opened');
    assert.equal(mr.source_branch, run.branch);
    assert.match(mr.description, /needs an approval from a named merge approver/);
    assert.match(run.pr.url, /\/-\/merge_requests\/1$/);
    const ask = rig.notes(1).find((b) => b.includes('Approval needed: merge'));
    assert.match(ask, /Approve the merge request with its Approve button/);
    assert.match(ask, /comment `reject <what to change>` on the merge request/);

    // Someone who is not a merge approver approves: nothing merges.
    rig.gl.approve(run.pr.id, 'mallory');
    await rig.factory.runUntilIdle();
    assertAtMergeGate(rig);
    assert.ok(!rig.mainHasWork(), 'an approval from outside the role merged the work');

    // A named approver approves: the factory merges, then stops at the release gate.
    rig.gl.approve(run.pr.id, 'lead');
    await rig.factory.runUntilIdle();
    assert.equal(rig.gl.mrs.get(run.pr.id).state, 'merged', diag(rig, '1'));
    assert.equal(rig.gl.mrs.get(run.pr.id).mergedWith.squash, true);
    assert.ok(rig.mainHasWork(), 'the work is not on main');
    let now = rig.run('1');
    assert.equal(now.status, 'waiting_approval', diag(rig, '1'));
    assert.equal(now.pending.gate, 'release', diag(rig, '1'));

    // The release approver replies on the issue.
    rig.gl.issueComment(1, 'rel', '/approve');
    await rig.factory.runUntilIdle();
    now = rig.run('1');
    assert.equal(now.status, 'done', diag(rig, '1'));
    assert.equal(rig.issue(1).state, 'closed');
    assert.deepEqual(rig.issue(1).labels, []);
    assert.deepEqual(rig.issue(1).assignees, []);
    for (const type of ['claimed', 'pr_opened', 'merged', 'released', 'done']) {
      assert.ok(rig.events('1').includes(type), `no ${type} event\n${diag(rig, '1')}`);
    }
  });

  test('a reject comment on the merge request sends the work back, and an approval of the old commit does not merge the new one', async (t) => {
    const rig = makeGitLabRig();
    t.after(rig.cleanup);
    rig.gl.addIssue({ title: 'Add a greeting' });
    await rig.factory.runUntilIdle();
    const run = assertAtMergeGate(rig);
    const firstHead = git(rig.remote, 'rev-parse', run.branch);

    // One approver approves, then the other sends it back on the merge request.
    rig.gl.approve(run.pr.id, 'dev2');
    rig.gl.mrComment(run.pr.id, 'lead', 'reject: say "Hello" instead of "Hi"');
    await rig.factory.runUntilIdle();

    assert.ok(rig.events('1').includes('rejected'), diag(rig, '1'));
    assert.ok(rig.events('1').includes('rework'), diag(rig, '1'));
    assert.equal(rig.builds(), 2, 'the build did not run again');
    const secondHead = git(rig.remote, 'rev-parse', run.branch);
    assert.notEqual(secondHead, firstHead, 'the rework did not move the branch');
    const rework = rig.runner.calls.filter((c) => c.stage === 'build')[1];
    assert.match(rework.prompt, /say "Hello" instead of "Hi"/, 'the reviewer\'s words did not reach the agent');

    // dev2's approval was for the first commit. It must not merge the second.
    assertAtMergeGate(rig);
    assert.equal(rig.gl.mrs.get(run.pr.id).state, 'opened');
    assert.ok(!rig.mainHasWork(), 'a stale approval merged new code');
    assert.equal(rig.gl.mrs.size, 1, 'the rework opened a second merge request');

    // Approving the new commit merges it.
    rig.gl.unapprove(run.pr.id, 'dev2');
    rig.gl.approve(run.pr.id, 'dev2');
    await rig.factory.runUntilIdle();
    assert.equal(rig.gl.mrs.get(run.pr.id).state, 'merged', diag(rig, '1'));
    assert.equal(rig.mainWork(), 'build pass 2');
  });

  test('a merge GitLab refuses is handed back to people and never forced', async (t) => {
    const rig = makeGitLabRig();
    t.after(rig.cleanup);
    rig.gl.addIssue();
    await rig.factory.runUntilIdle();
    const run = assertAtMergeGate(rig);
    rig.gl.refuseMerge = true; // for example: a pipeline must pass, or an approval rule is not met
    rig.gl.approve(run.pr.id, 'lead');
    await rig.factory.runUntilIdle();
    assert.equal(rig.run('1').status, 'handed_back', diag(rig, '1'));
    assert.equal(rig.gl.mrs.get(run.pr.id).state, 'opened');
    assert.ok(!rig.mainHasWork());
    assert.equal(rig.gl.requests.filter((r) => r.route.endsWith('/merge')).length, 1, 'the merge was tried again');
    assert.ok(rig.notes(1).some((b) => /refused the merge/i.test(b)), 'the reason is not on the issue');
  });

  test('a merge request closed by a person hands the ticket back', async (t) => {
    const rig = makeGitLabRig();
    t.after(rig.cleanup);
    rig.gl.addIssue();
    await rig.factory.runUntilIdle();
    const run = assertAtMergeGate(rig);
    rig.gl.closeMr(run.pr.id);
    await rig.factory.runUntilIdle();
    assert.equal(rig.run('1').status, 'handed_back', diag(rig, '1'));
    assert.ok(!rig.issue(1).labels.includes('factory-owned'));
  });
});
