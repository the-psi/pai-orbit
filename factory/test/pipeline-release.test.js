'use strict';
// Scenario tests: release (Scenario 11) — AC-5, AC-8, AC-25, AC-26, AC-39.
// A full run to the release gate is the most expensive path in the suite, so each rig carries
// one scenario and its steps are sub-tests named after the criterion they prove.
const test = require('node:test');
const { describe } = test;
const assert = require('node:assert/strict');
const { makeRig } = require('./helpers');

const FAST = { stages: { review: false } };
const BOT = 'orbit-factory';
const ticketOf = (req) => (req.prompt.match(/ticket #(\S+)/) || [])[1];
const stagesCalled = (rig) => rig.runner.calls.map((c) => c.stage);
const releaseCalls = (rig) => rig.runner.calls.filter((c) => c.stage === 'release');
const diag = (rig) => `runs: ${JSON.stringify(rig.store.all().map((r) => [r.ticketId, r.status, r.stage, r.pending, r.handBackReason]))}\nlogs: ${rig.logs.join('\n')}`;

/** Each ticket builds its own file, so several tickets merge into main without touching each other. */
const ownFile = (req) => (req.stage === 'build'
  ? { useDefault: true, write: { [`src/feature-${ticketOf(req)}.txt`]: `built for ticket ${ticketOf(req)}\n` } }
  : undefined);

/** Drive tickets to the release gate: build, pull request, approving review by `lead`, merge. */
async function toReleaseGate(rig, ids = ['1']) {
  for (const id of ids) await rig.addTicket(id);
  await rig.factory.runUntilIdle();
  for (const id of ids) {
    const run = rig.run(id);
    assert.equal(run.pending && run.pending.gate, 'merge', diag(rig));
    await rig.codeHost.addReview(run.pr.id, { author: 'lead', state: 'approved' });
    await rig.factory.runUntilIdle(); // one merge at a time, as a code host would serialise them
  }
  for (const id of ids) {
    const run = rig.run(id);
    assert.equal(run.status, 'waiting_approval', diag(rig));
    assert.equal(run.pending.gate, 'release', diag(rig));
  }
}

async function until(cond, what, ms = 120000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('pipeline: release', { concurrency: 3 }, () => {
  test('release: approval, one serialised release for several tickets, credentials only in the release stage', async (t) => {
    let inRelease = 0;
    let maxInRelease = 0;
    const open = []; // release functions for the release runs in flight
    const handler = async (req) => {
      if (req.stage !== 'release') return ownFile(req);
      inRelease += 1;
      maxInRelease = Math.max(maxInRelease, inRelease);
      await new Promise((resolve) => open.push(resolve)); // held until the test lets it go
      inRelease -= 1;
      return undefined;
    };
    const rig = makeRig({ config: { ...FAST, concurrency: 3, release: { envPassthrough: ['DEPLOY_KEY'] } }, handler });
    t.after(rig.cleanup);
    await toReleaseGate(rig, ['1', '2', '3']);

    await t.test('AC-8: no release happens without a release approval', async () => {
      await rig.factory.runUntilIdle();
      assert.equal(releaseCalls(rig).length, 0);
      for (const id of ['1', '2', '3']) assert.equal(rig.ticket(id).state, 'open');
    });

    await t.test('AC-8, AC-33: /approve from the merge approver (lead), the product owner, the reporter or the bot does not release', async () => {
      for (const author of ['lead', 'dev2', 'po', 'alice', 'mallory']) await rig.board.comment('1', '/approve', author);
      await rig.board.comment('1', '/approve'); // the bot itself
      await rig.board.comment('1', 'I approve this release', 'rel'); // not the approval command
      await rig.factory.runUntilIdle();
      assert.equal(releaseCalls(rig).length, 0, 'a release ran without a release approver\'s approval');
      assert.equal(rig.run('1').status, 'waiting_approval', diag(rig));
      assert.equal(rig.ticket('1').state, 'open');
    });

    // Tickets 1 and 2 are approved by a release approver before the factory looks again.
    await rig.board.comment('1', '/approve', 'rel');
    await rig.board.comment('2', '/approve', 'rel');
    await rig.factory.tick();
    await rig.factory.tick();
    await until(() => open.length === 1, 'the release run to start');

    await t.test('AC-39: a ticket approved while a release is running does not start a second release at the same time', async () => {
      await rig.board.comment('3', '/approve', 'rel');
      await rig.factory.tick();
      await rig.factory.tick();
      await new Promise((r) => setTimeout(r, 300));
      assert.equal(releaseCalls(rig).length, 1, 'a second release started while one was running');
      assert.equal(inRelease, 1);
    });

    open.splice(0).forEach((release) => release());
    await rig.factory.drain();

    await t.test('AC-25, AC-39: two tickets both approved for release are released by ONE release runner call', () => {
      assert.equal(releaseCalls(rig).length, 1, diag(rig));
      const prompt = releaseCalls(rig)[0].prompt;
      assert.match(prompt, /#1\b/);
      assert.match(prompt, /#2\b/);
      assert.ok(!/#3\b/.test(prompt), 'ticket 3 was not approved when the first release started');
      assert.match(prompt, /approved by rel/);
    });

    await t.test('AC-25: after a successful release the tickets are closed and no longer marked as factory-owned', () => {
      for (const id of ['1', '2']) {
        const ticket = rig.ticket(id);
        assert.equal(rig.run(id).status, 'done', diag(rig));
        assert.equal(ticket.state, 'closed');
        assert.ok(!ticket.labels.includes(rig.config.board.ownedLabel));
        assert.ok(!ticket.labels.includes(rig.config.board.waitingLabel));
        assert.ok(!ticket.assignees.includes(BOT));
        assert.equal(rig.notifier.events.filter((e) => e.type === 'released' && e.ticketId === id).length, 1);
      }
      assert.notEqual(rig.run('3').status, 'done');
      assert.equal(rig.ticket('3').state, 'open');
    });

    await t.test('AC-5: a released ticket is in the board column mapped to "done"', () => {
      assert.equal(rig.config.board.columns.done, 'Done');
      assert.equal(rig.ticket('1').column, 'Done');
      assert.equal(rig.ticket('2').column, 'Done');
    });

    await rig.factory.tick();
    await until(() => open.length === 1 || releaseCalls(rig).length > 2, 'the second release run to start');
    open.splice(0).forEach((release) => release());
    await rig.factory.drain();
    await rig.factory.runUntilIdle();

    await t.test('AC-39: the ticket approved later is released by the next release run; two releases never ran at the same time', () => {
      assert.equal(releaseCalls(rig).length, 2, diag(rig));
      assert.match(releaseCalls(rig)[1].prompt, /#3\b/);
      assert.equal(rig.run('3').status, 'done', diag(rig));
      assert.equal(rig.ticket('3').state, 'closed');
      assert.equal(maxInRelease, 1, 'two releases ran at the same time');
    });

    await t.test('AC-39: the release stage environment contains the name listed in release.envPassthrough; no other stage does', () => {
      assert.ok(releaseCalls(rig).length > 0);
      for (const call of rig.runner.calls) {
        if (call.stage === 'release') {
          assert.equal(call.env.DEPLOY_KEY, 'deploy-secret', 'the release stage did not get its credential');
        } else {
          assert.ok(!('DEPLOY_KEY' in call.env), `${call.stage} saw the release credential`);
        }
        assert.ok(!('GH_TOKEN' in call.env), `${call.stage} saw the code-host credential`);
        assert.ok(!('FACTORY_SLACK_WEBHOOK_URL' in call.env), `${call.stage} saw the chat credential`);
        assert.equal(call.env.ANTHROPIC_API_KEY, 'model-key');
      }
    });
  });

  test('release: a rejected release and a failed release both go back to people', async (t) => {
    const handler = (req) => (req.stage === 'release'
      ? { result: { status: 'failed', summary: '', reason: 'step "npm version" failed: working tree not clean' } }
      : ownFile(req));
    // lead is both a merge approver and a release approver here; the release level stays `tag`.
    const rig = makeRig({ config: { ...FAST, roles: { releaseApprover: ['lead', 'rel'] } }, handler });
    t.after(rig.cleanup);
    await toReleaseGate(rig, ['1', '2']);

    await t.test('AC-33: /reject at the release gate from someone who is not a release approver changes nothing', async () => {
      await rig.board.comment('2', '/reject not this week', 'dev2');
      await rig.factory.runUntilIdle();
      assert.equal(rig.run('2').status, 'waiting_approval', diag(rig));
    });

    await t.test('AC-8: /reject at the release gate hands the ticket back and nothing is released', async () => {
      await rig.board.comment('2', '/reject hold until the freeze is over', 'rel');
      await rig.factory.runUntilIdle();
      const ticket = rig.ticket('2');
      assert.equal(releaseCalls(rig).length, 0);
      assert.equal(rig.run('2').status, 'handed_back', diag(rig));
      assert.equal(ticket.state, 'open');
      assert.ok(ticket.comments.some((c) => c.author === BOT && /handed this ticket back/i.test(c.body) && /hold until the freeze is over/.test(c.body)), 'no report carrying the rejection');
      assert.ok(!ticket.labels.includes(rig.config.board.ownedLabel));
      assert.ok(!ticket.assignees.includes(BOT));
      assert.ok(!rig.runner.calls.slice(8).some((c) => c.stage === 'build'), 'a release rejection must not trigger a build rework: the change is merged');
    });

    await t.test('REQ-30: below level production the merge approver may also approve the release, as a separate act', async () => {
      assert.equal(releaseCalls(rig).length, 0, 'the merge approval must not double as the release approval');
      await rig.board.comment('1', '/approve', 'lead');
      await rig.factory.runUntilIdle();
      assert.equal(releaseCalls(rig).length, 1, diag(rig));
      assert.match(releaseCalls(rig)[0].prompt, /approved by lead/);
    });

    await t.test('AC-26: a failed release hands the ticket back with a report and is not retried', async () => {
      await rig.factory.runUntilIdle();
      assert.equal(releaseCalls(rig).length, 1, 'a failed release was retried');
      const ticket = rig.ticket('1');
      assert.equal(rig.run('1').status, 'handed_back', diag(rig));
      assert.equal(ticket.state, 'open', 'a ticket whose release failed must not be closed');
      const report = ticket.comments.find((c) => c.author === BOT && /handed this ticket back/i.test(c.body));
      assert.ok(report, 'no report on the ticket');
      assert.match(report.body, /release/);
      assert.match(report.body, /npm version/);
      assert.ok(!ticket.labels.includes(rig.config.board.ownedLabel));
      assert.ok(!ticket.assignees.includes(BOT));
      assert.equal(rig.notifier.events.filter((e) => e.type === 'released').length, 0);
      // Another approval comment after the failure does not start it again by itself.
      await rig.board.comment('1', '/approve', 'rel');
      await rig.factory.runUntilIdle();
      assert.equal(releaseCalls(rig).length, 1, 'a failed release was retried');
    });

    await t.test('AC-39: at release level tag with no release passthrough, no deploy credential is present in any run', () => {
      assert.equal(rig.config.release.level, 'tag');
      for (const call of rig.runner.calls) assert.ok(!('DEPLOY_KEY' in call.env), `${call.stage} saw a deploy credential at level tag`);
    });
  });

  test('REQ-30 (production): the person who approved the merge cannot also approve a production release', async (t) => {
    const rig = makeRig({
      config: { ...FAST, release: { level: 'production' }, roles: { releaseApprover: ['lead', 'rel'] } },
      handler: ownFile,
    });
    t.after(rig.cleanup);
    await toReleaseGate(rig); // merge approved by lead

    await rig.board.comment('1', '/approve', 'lead');
    await rig.factory.runUntilIdle();
    await rig.factory.runUntilIdle();
    assert.equal(releaseCalls(rig).length, 0, 'the merge approver also approved the production release');
    assert.equal(rig.run('1').status, 'waiting_approval', diag(rig));
    assert.equal(rig.ticket('1').state, 'open');

    await rig.board.comment('1', '/approve', 'rel');
    await rig.factory.runUntilIdle();
    assert.equal(releaseCalls(rig).length, 1, diag(rig));
    assert.equal(rig.run('1').status, 'done', diag(rig));
    assert.match(releaseCalls(rig)[0].prompt, /production/);
    assert.deepEqual(stagesCalled(rig), ['groom', 'design', 'build', 'test', 'release']);
  });
});
