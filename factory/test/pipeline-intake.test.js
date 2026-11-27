'use strict';
// Scenario tests: intake (Scenarios 1, 8, 12) and the happy-path artefacts (Scenarios 2, 14).
// git is slow on the build machines, so each rig is driven through one scenario and the steps
// of that scenario are reported as sub-tests named after the acceptance criterion they prove.
const test = require('node:test');
const { describe } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRig } = require('./helpers');

const FAST = { stages: { review: false } };
const BOT = 'orbit-factory';
const QUESTION = { result: { status: 'needs_input', summary: '', questions: [{ question: 'Which greeting text?', why: 'The ticket does not say.' }] } };

const stagesCalled = (rig) => rig.runner.calls.map((c) => c.stage);
const diag = (rig, id) => `run: ${JSON.stringify(rig.run(id))}\nlogs: ${rig.logs.join('\n')}`;
const criteria = (n) => ['Add a greeting.', '', 'Acceptance criteria:']
  .concat(Array.from({ length: n }, (_, i) => `- [ ] criterion ${i + 1}`)).join('\n');

function remoteFile(rig, branch, rel) {
  try {
    return rig.remoteGit('show', `${branch}:${rel}`);
  } catch {
    return null;
  }
}

function assertDeclinedAtIntake(rig, id, reasonPattern) {
  const ticket = rig.ticket(id);
  assert.equal(rig.run(id) && rig.run(id).status, 'declined', diag(rig, id));
  assert.ok(ticket.labels.includes(rig.config.board.declinedLabel), `declined label missing: ${ticket.labels}`);
  assert.ok(!ticket.labels.includes(rig.config.board.readyLabel), 'the ready label must be cleared');
  assert.ok(!ticket.labels.includes(rig.config.board.ownedLabel), 'the owned label must be removed');
  assert.ok(!ticket.assignees.includes(BOT), 'the bot must not stay assigned');
  const botComments = ticket.comments.filter((c) => c.author === BOT);
  assert.ok(botComments.some((c) => reasonPattern.test(c.body)), `no comment gives the reason ${reasonPattern}: ${JSON.stringify(botComments)}`);
  assert.equal(rig.notifier.events.filter((e) => e.type === 'declined' && e.ticketId === id).length, 1);
}

describe('pipeline: intake and happy-path artefacts', { concurrency: 4 }, () => {
  test('intake: a ready ticket is picked up once and marked as factory-owned', async (t) => {
    let columnDuringGroom;
    let rig;
    // The "agent" asks a question in groom, so the run parks after the shortest possible distance.
    const handler = (req) => {
      if (req.stage !== 'groom') return undefined;
      columnDuringGroom = rig.ticket('1').column;
      return QUESTION;
    };
    rig = makeRig({ config: FAST, handler });
    t.after(rig.cleanup);
    await rig.addTicket('1', { body: criteria(8) }); // 8 acceptance criteria is the most that is accepted

    await rig.factory.tick(); // one polling pass; nobody did anything else
    await t.test('AC-1: a run starts for a ticket carrying the ready label, with no human action', () => {
      assert.ok(rig.run('1'), 'a run must exist after one polling pass');
    });
    await t.test('AC-27: the claimed ticket carries the owned label and the bot assignee and loses the ready label', () => {
      const claimed = rig.ticket('1');
      assert.ok(claimed.labels.includes(rig.config.board.ownedLabel), `owned label missing: ${claimed.labels}`);
      assert.ok(claimed.assignees.includes(BOT), `bot not assigned: ${claimed.assignees}`);
      assert.ok(!claimed.labels.includes(rig.config.board.readyLabel), 'the ready label must be removed at pick-up');
    });

    await rig.factory.drain();
    await t.test('AC-1, AC-19: the first agent stage (groom) runs; a ticket with exactly 8 acceptance criteria is not declined', () => {
      assert.deepEqual(stagesCalled(rig), ['groom'], diag(rig, '1'));
      assert.notEqual(rig.run('1').status, 'declined');
      assert.ok(rig.ticket('1').labels.includes(rig.config.board.ownedLabel), 'a parked ticket is still factory-owned');
    });
    await t.test('AC-5: the board column is "In progress" while the ticket is being groomed', () => {
      assert.equal(columnDuringGroom, 'In progress');
    });

    await t.test('AC-2: a ticket already taken is not started a second time', async () => {
      await rig.factory.runUntilIdle();
      // Someone puts the ready label back while the factory still owns the ticket.
      const file = path.join(rig.dataDir, 'local', 'tickets', '1.json');
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      raw.labels.push(rig.config.board.readyLabel);
      fs.writeFileSync(file, JSON.stringify(raw, null, 2));
      await rig.factory.runUntilIdle();
      // A second factory process on the same data (a restart) must not start it again either.
      await rig.build().runUntilIdle();
      assert.deepEqual(stagesCalled(rig), ['groom'], 'the ticket was started a second time');
      assert.equal(rig.events('1').filter((e) => e === 'claimed').length, 1);
      assert.equal(rig.store.all().length, 1);
    });
  });

  test('intake: tickets the factory must leave alone or decline, before any agent call', async (t) => {
    const rig = makeRig({ config: FAST });
    t.after(rig.cleanup);
    const ready = rig.config.board.readyLabel;
    await rig.addTicket('1', { labels: ['bug'] });
    await rig.addTicket('2', { labels: [] });
    await rig.addTicket('3', { assignees: ['bob'] }); // ready label, but a person has it
    await rig.addTicket('4', { labels: [ready, 'security'] });
    await rig.addTicket('5', { labels: [ready, 'epic'] });
    await rig.addTicket('6', { body: criteria(9) });
    await rig.factory.runUntilIdle();
    await rig.factory.runUntilIdle();

    await t.test('AC-19: none of these tickets causes an agent call or a branch', () => {
      assert.equal(rig.runner.calls.length, 0);
      assert.equal(rig.remoteGit('branch', '--list', 'factory/*'), '');
    });
    await t.test('AC-2: a ticket without the ready label is never picked up', () => {
      for (const id of ['1', '2']) {
        assert.equal(rig.run(id), null);
        assert.deepEqual(rig.ticket(id).assignees, []);
        assert.equal(rig.ticket(id).comments.length, 0);
      }
      assert.deepEqual(rig.ticket('1').labels, ['bug']);
      assert.deepEqual(rig.ticket('2').labels, []);
    });
    await t.test('AC-28: a ticket assigned to a person is never picked up, even with the ready label', () => {
      const ticket = rig.ticket('3');
      assert.equal(rig.run('3'), null);
      assert.deepEqual(ticket.assignees, ['bob']);
      assert.deepEqual(ticket.labels, [ready], 'the factory must not touch a person\'s ticket');
      assert.equal(ticket.comments.length, 0);
    });
    await t.test('AC-19: a ticket with a sensitive-area label is declined with the reason, declined label set, ready label gone', () => {
      assertDeclinedAtIntake(rig, '4', /security/i);
    });
    await t.test('AC-19: a ticket labelled as an epic is declined with the reason, declined label set, ready label gone', () => {
      assertDeclinedAtIntake(rig, '5', /epic/i);
    });
    await t.test('AC-19: a ticket with more than 8 acceptance-criteria lines is declined with the reason, declined label set, ready label gone', () => {
      assertDeclinedAtIntake(rig, '6', /acceptance criteria/i);
    });
    await t.test('AC-19: a declined ticket is not picked up again unchanged', async () => {
      await rig.factory.runUntilIdle();
      for (const id of ['4', '5', '6']) assert.equal(rig.events(id).filter((e) => e === 'claimed').length, 1);
      assert.equal(rig.runner.calls.length, 0);
    });
  });

  test('happy path: a ticket needing no questions reaches a pull request by itself', async (t) => {
    const rig = makeRig({ config: FAST });
    t.after(rig.cleanup);
    await rig.addTicket('1');
    await rig.factory.runUntilIdle();
    const run = rig.run('1');

    await t.test('AC-3: requirements.md, design.md, test-plan.md and the code are on the pushed ticket branch, and a pull request is open', async () => {
      assert.deepEqual(stagesCalled(rig).slice(0, 4), ['groom', 'design', 'build', 'test'], diag(rig, '1'));
      for (const doc of ['requirements.md', 'design.md', 'test-plan.md']) {
        assert.ok(remoteFile(rig, run.branch, `${run.featureDir}/${doc}`) !== null, `${doc} is not on ${run.branch} in the remote`);
      }
      assert.ok(remoteFile(rig, run.branch, 'src/feature.txt') !== null, 'the code is not on the remote branch');
      assert.equal(remoteFile(rig, 'main', 'src/feature.txt'), null, 'nothing may reach main before the merge gate');
      assert.ok(run.pr && run.pr.id, 'no pull request recorded');
      const pr = await rig.codeHost.prStatus(run.pr.id);
      assert.equal(pr.state, 'open');
      assert.equal(pr.headSha, rig.remoteGit('rev-parse', run.branch));
    });
    await t.test('AC-3, AC-9: with the optional gates off it stops only at the merge gate, with no human input on the way', () => {
      assert.equal(run.status, 'waiting_approval');
      assert.equal(run.pending.gate, 'merge');
      const ticket = rig.ticket('1');
      assert.ok(ticket.comments.every((c) => c.author === BOT));
      assert.equal(ticket.comments.filter((c) => /Approval needed/.test(c.body)).length, 1, 'only the merge gate may ask for approval');
      assert.equal(rig.notifier.events.filter((e) => e.type === 'question').length, 0);
    });
    await t.test('AC-5: the board column follows the stage (pull request open -> "In review")', () => {
      assert.equal(rig.ticket('1').column, 'In review');
    });
    await t.test('AC-31: with stages.playwright off the playwright stage is skipped and the run still reaches the pull request', () => {
      assert.deepEqual(stagesCalled(rig), ['groom', 'design', 'build', 'test']);
    });
    await t.test('REQ-43: the agent environment has ANTHROPIC_API_KEY but not GH_TOKEN, FACTORY_SLACK_WEBHOOK_URL or DEPLOY_KEY', () => {
      assert.ok(rig.runner.calls.length > 0);
      for (const call of rig.runner.calls) {
        assert.equal(call.env.ANTHROPIC_API_KEY, 'model-key', `${call.stage}: model credential missing`);
        for (const secret of ['GH_TOKEN', 'FACTORY_SLACK_WEBHOOK_URL', 'DEPLOY_KEY']) {
          assert.ok(!(secret in call.env), `${call.stage}: ${secret} leaked into the agent environment`);
        }
        assert.ok(!Object.values(call.env).some((v) => /secret/.test(String(v))), `${call.stage}: a secret value leaked`);
      }
    });
  });

  test('AC-31: with stages.playwright on, the playwright stage runs after test and its e2e files are on the pull request branch', async (t) => {
    const handler = (req) => (req.stage === 'playwright'
      ? { useDefault: true, write: { 'e2e/greeting.spec.ts': '// e2e spec from the test plan\n' } }
      : undefined);
    const rig = makeRig({ config: { stages: { review: false, playwright: true } }, handler });
    t.after(rig.cleanup);
    await rig.addTicket('1');
    await rig.factory.runUntilIdle();
    const run = rig.run('1');
    assert.deepEqual(stagesCalled(rig), ['groom', 'design', 'build', 'test', 'playwright'], diag(rig, '1'));
    assert.ok(run.pr, 'no pull request');
    assert.ok(remoteFile(rig, run.branch, 'e2e/greeting.spec.ts') !== null, 'the e2e spec is not on the pull request branch');
    assert.equal(run.pending && run.pending.gate, 'merge');
  });
});
