'use strict';
// Scenario tests: the optional approval gates on the ticket (Scenario 4) — AC-9, AC-10, AC-33,
// AC-36 — and the rule that the two fixed gates are not configurable (AC-8).
const test = require('node:test');
const { describe } = test;
const assert = require('node:assert/strict');
const { makeRig } = require('./helpers');
const { fromObject } = require('../src/config');

const QUESTION = { result: { status: 'needs_input', summary: '', questions: [{ question: 'Stop here?', why: 'Test brake.' }] } };
const ticketOf = (req) => (req.prompt.match(/ticket #(\S+)/) || [])[1];
const callsOf = (rig, id) => rig.runner.calls.filter((c) => ticketOf(c) === id);
const stagesOf = (rig, id) => callsOf(rig, id).map((c) => c.stage);
const diag = (rig, id) => `run: ${JSON.stringify(rig.run(id))}\nlogs: ${rig.logs.join('\n')}`;

function assertAtGate(rig, id, gate) {
  const run = rig.run(id);
  assert.equal(run.status, 'waiting_approval', diag(rig, id));
  assert.equal(run.pending.gate, gate, diag(rig, id));
}

describe('pipeline: optional gates', () => {
  test('requirements and design gates: approve, reject with feedback, rework limit', async (t) => {
    // Build asks a question so ticket 1 parks right after its design gate is passed.
    const handler = (req) => (req.stage === 'build' ? QUESTION : undefined);
    const rig = makeRig({
      config: { stages: { review: false }, gates: { requirements: true, design: true }, limits: { reworkCyclesPerGate: 1 } },
      handler,
    });
    t.after(rig.cleanup);
    await rig.addTicket('1'); // approved through both gates, with one rejection at each
    await rig.addTicket('2'); // rejected once more than the rework limit allows
    await rig.factory.runUntilIdle();

    await t.test('AC-9: with gates.requirements on, the run stops after groom and asks for approval', () => {
      for (const id of ['1', '2']) {
        assert.deepEqual(stagesOf(rig, id), ['groom'], diag(rig, id));
        assertAtGate(rig, id, 'requirements');
        assert.ok(rig.ticket(id).labels.includes(rig.config.board.waitingLabel));
        assert.equal(rig.notifier.events.filter((e) => e.type === 'approval_needed' && e.ticketId === id).length, 1);
      }
    });

    await t.test('AC-9, AC-33: /approve or /reject from someone who is not the requirements approver does nothing', async () => {
      // Requirements approver is po. The design approver, the reporter, a stranger and the bot do not count.
      for (const other of ['lead', 'alice', 'mallory', 'orbit-factory']) await rig.board.comment('1', '/approve', other);
      await rig.board.comment('1', 'Looks fine to me, approve', 'po'); // an ordinary comment is not an approval
      for (const other of ['lead', 'mallory']) await rig.board.comment('2', '/reject rewrite everything', other);
      await rig.factory.runUntilIdle();
      for (const id of ['1', '2']) {
        assert.deepEqual(stagesOf(rig, id), ['groom'], `#${id} moved on a word from the wrong person`);
        assertAtGate(rig, id, 'requirements');
      }
    });

    await t.test('AC-10: /reject fix X from the approver re-runs groom with the feedback in the prompt and returns to the same gate', async () => {
      await rig.board.comment('1', '/reject fix X: the greeting must be optional', 'po');
      await rig.board.comment('2', '/reject first objection', 'po');
      await rig.factory.runUntilIdle();
      assert.deepEqual(stagesOf(rig, '1'), ['groom', 'groom'], diag(rig, '1'));
      assert.ok(callsOf(rig, '1')[1].prompt.includes('fix X: the greeting must be optional'), 'the feedback is not in the rework prompt');
      assertAtGate(rig, '1', 'requirements');
      assert.equal(rig.ticket('1').comments.filter((c) => /Approval needed: requirements/.test(c.body)).length, 2, 'approval must be asked again after the rework');
      assert.ok(!callsOf(rig, '2')[1].prompt.includes('rewrite everything'), 'feedback from a non-approver reached the agent');
      // The rejection already acted on must not be read again as a new one.
      await rig.factory.runUntilIdle();
      assert.deepEqual(stagesOf(rig, '1'), ['groom', 'groom']);
      assert.deepEqual(stagesOf(rig, '2'), ['groom', 'groom']);
    });

    await t.test('AC-36: one rejection more than limits.reworkCyclesPerGate hands the ticket back instead of reworking again', async () => {
      await rig.board.comment('2', '/reject still wrong', 'po');
      await rig.factory.runUntilIdle();
      const ticket = rig.ticket('2');
      assert.deepEqual(stagesOf(rig, '2'), ['groom', 'groom'], 'the stage was reworked beyond the limit');
      assert.equal(rig.run('2').status, 'handed_back', diag(rig, '2'));
      assert.ok(!ticket.labels.includes(rig.config.board.ownedLabel));
      assert.ok(!ticket.assignees.includes('orbit-factory'));
      assert.ok(ticket.comments.some((c) => /handed this ticket back/i.test(c.body) && /requirements/.test(c.body)), 'no hand-back report naming the gate');
      assert.equal(rig.notifier.events.filter((e) => e.type === 'handed_back' && e.ticketId === '2').length, 1);
    });

    await t.test('AC-9: /approve from the requirements approver continues to design, which stops at the design gate', async () => {
      await rig.board.comment('1', '/approve', 'po');
      await rig.factory.runUntilIdle();
      assert.deepEqual(stagesOf(rig, '1'), ['groom', 'groom', 'design'], diag(rig, '1'));
      assertAtGate(rig, '1', 'design');
      assert.ok(!callsOf(rig, '1')[2].prompt.includes('fix X'), 'feedback that was already addressed leaked into the next stage');
    });

    await t.test('AC-9, AC-33: /approve at the design gate from someone who is not the design approver does nothing', async () => {
      // Design approver is lead; po approved the requirements but is not a design approver.
      for (const other of ['po', 'alice', 'dev2']) await rig.board.comment('1', '/approve', other);
      await rig.factory.runUntilIdle();
      assert.deepEqual(stagesOf(rig, '1'), ['groom', 'groom', 'design']);
      assertAtGate(rig, '1', 'design');
    });

    await t.test('AC-10: /reject at the design gate re-runs design (not groom) with the feedback and returns to the design gate', async () => {
      await rig.board.comment('1', '/reject use the existing banner component', 'lead');
      await rig.factory.runUntilIdle();
      assert.deepEqual(stagesOf(rig, '1'), ['groom', 'groom', 'design', 'design'], diag(rig, '1'));
      assert.ok(callsOf(rig, '1')[3].prompt.includes('use the existing banner component'));
      assertAtGate(rig, '1', 'design');
    });

    await t.test('AC-9: /approve from the design approver continues to build', async () => {
      await rig.board.comment('1', '/approve', 'lead');
      await rig.factory.runUntilIdle();
      assert.deepEqual(stagesOf(rig, '1'), ['groom', 'groom', 'design', 'design', 'build'], diag(rig, '1'));
    });
  });
});

describe('configuration: the merge and release gates cannot be switched off', () => {
  const base = () => ({
    repo: { url: 'file:///nowhere.git', baseBranch: 'main' },
    runner: { type: 'fake' },
    roles: { answer: ['@reporter'], mergeApprover: ['lead'], releaseApprover: ['rel'] },
  });

  test('AC-8: a valid config without the fixed gates loads (control)', () => {
    const cfg = fromObject(base());
    assert.deepEqual(Object.keys(cfg.gates).sort(), ['design', 'requirements']);
  });

  for (const gate of ['merge', 'release']) {
    for (const value of [false, true]) {
      test(`AC-8: config containing gates.${gate} = ${value} is rejected`, () => {
        assert.throws(() => fromObject({ ...base(), gates: { [gate]: value } }), new RegExp(`gates\\.${gate}`));
      });
    }
  }

  test('AC-34: config naming the factory\'s own identity as merge or release approver is rejected', () => {
    assert.throws(() => fromObject({ ...base(), roles: { ...base().roles, mergeApprover: ['orbit-factory'] } }), /mergeApprover/);
    assert.throws(() => fromObject({ ...base(), roles: { ...base().roles, releaseApprover: ['orbit-factory'] } }), /releaseApprover/);
  });

  test('AC-8: config with no merge approver or no release approver is rejected', () => {
    assert.throws(() => fromObject({ ...base(), roles: { ...base().roles, mergeApprover: [] } }), /mergeApprover/);
    assert.throws(() => fromObject({ ...base(), roles: { ...base().roles, releaseApprover: [] } }), /releaseApprover/);
  });
});
