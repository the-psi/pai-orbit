'use strict';
// Scenario tests: no reply (Scenario 5) — AC-11, AC-12, AC-37. The rig clock starts on
// Monday 2026-11-23 09:00 UTC; the working calendar is Mon–Fri 09:00–18:00 UTC.
const test = require('node:test');
const { describe } = test;
const assert = require('node:assert/strict');
const { makeRig } = require('./helpers');

const FAST = { stages: { review: false } };
const QUESTION = { result: { status: 'needs_input', summary: '', questions: [{ question: 'Which greeting text?', why: 'The ticket does not say.' }] } };
const ticketOf = (req) => (req.prompt.match(/ticket #(\S+)/) || [])[1];
const diag = (rig, id) => `run: ${JSON.stringify(rig.run(id))}\nlogs: ${rig.logs.join('\n')}`;
const sent = (rig, type, id) => rig.notifier.events.filter((e) => e.type === type && e.ticketId === id);

/** Poll twice, as the service loop would. A parked ticket costs no git to poll. */
async function poll(rig) {
  await rig.factory.runUntilIdle();
  await rig.factory.runUntilIdle();
}

describe('pipeline: waiting timers', { concurrency: 2 }, () => {
  test('unanswered question: reminder, escalation, working time only, hand-back at the maximum age', async (t) => {
    const rig = makeRig({ config: FAST, handler: (req) => (req.stage === 'groom' ? QUESTION : undefined) });
    t.after(rig.cleanup);
    await rig.addTicket('1');
    await rig.factory.runUntilIdle(); // parked on Monday 09:00
    assert.equal(rig.run('1').status, 'waiting_answer', diag(rig, '1'));
    const branch = rig.run('1').branch;

    await t.test('AC-11: no reminder before 4 working hours; exactly one after', async () => {
      rig.now.advanceHours(3.5); // Monday 12:30
      await poll(rig);
      assert.equal(sent(rig, 'reminder', '1').length, 0, 'reminder sent before the first period');
      assert.equal(sent(rig, 'escalation', '1').length, 0);
      rig.now.advanceHours(1); // Monday 13:30 — 4.5 working hours
      await poll(rig);
      assert.equal(sent(rig, 'reminder', '1').length, 1, diag(rig, '1'));
      assert.equal(sent(rig, 'escalation', '1').length, 0, 'escalated before the second period');
      rig.now.advanceHours(2); // Monday 15:30 — 6.5 working hours
      await poll(rig);
      assert.equal(sent(rig, 'reminder', '1').length, 1, 'the reminder was repeated');
      assert.equal(sent(rig, 'escalation', '1').length, 0);
    });

    await t.test('AC-11: exactly one escalation, to the escalation role, after 8 working hours', async () => {
      rig.now.advanceHours(2); // Monday 17:30 — 8.5 working hours
      await poll(rig);
      assert.equal(sent(rig, 'escalation', '1').length, 1, diag(rig, '1'));
      assert.ok(sent(rig, 'escalation', '1')[0].mention.includes('boss'), 'the escalation must go to the configured escalation role');
      rig.now.advanceHours(17); // Tuesday 10:30
      await poll(rig);
      assert.equal(sent(rig, 'reminder', '1').length, 1, 'the reminder was repeated');
      assert.equal(sent(rig, 'escalation', '1').length, 1, 'the escalation was repeated');
      assert.equal(rig.run('1').status, 'waiting_answer', 'reminders must not un-park the ticket');
      assert.equal(rig.runner.calls.length, 1);
    });

    await t.test('AC-37: still parked just under 5 working days', async () => {
      rig.now.advanceHours(3 * 24 + 6.5); // Friday 17:00 — 44 of 45 working hours
      await poll(rig);
      assert.equal(rig.run('1').status, 'waiting_answer', 'handed back before the maximum parked age');
    });

    // A second ticket parks late on Friday.
    await rig.addTicket('2');
    await rig.factory.runUntilIdle();
    assert.equal(rig.run('2').status, 'waiting_answer', diag(rig, '2'));

    await t.test('AC-11: weekend and night hours do not count towards the reminder', async () => {
      rig.now.advanceHours(48); // Sunday 17:00 — one working hour since Friday 17:00
      await poll(rig);
      assert.equal(sent(rig, 'reminder', '2').length, 0, 'weekend hours were counted');
      assert.equal(sent(rig, 'escalation', '2').length, 0, 'weekend hours were counted');
      rig.now.advanceHours(18); // Monday 11:00 — three working hours
      await poll(rig);
      assert.equal(sent(rig, 'reminder', '2').length, 0, 'night hours were counted');
      assert.equal(rig.run('2').status, 'waiting_answer');
    });

    await t.test('AC-37: a ticket parked for more than 5 working days is handed back with a report', async () => {
      // Monday 11:00 a week later: 47 working hours since ticket 1 was parked.
      const ticket = rig.ticket('1');
      assert.equal(rig.run('1').status, 'handed_back', diag(rig, '1'));
      const report = ticket.comments.find((c) => /handed this ticket back/i.test(c.body));
      assert.ok(report, 'no hand-back report on the ticket');
      assert.match(report.body, /groom/, 'the report must name the stage');
      assert.match(report.body, /wait/i, 'the report must give the cause');
      assert.ok(!ticket.labels.includes(rig.config.board.ownedLabel));
      assert.ok(!ticket.labels.includes(rig.config.board.waitingLabel));
      assert.ok(!ticket.assignees.includes('orbit-factory'));
      assert.equal(sent(rig, 'handed_back', '1').length, 1);
      assert.ok(rig.remoteGit('branch', '--list', branch).includes(branch), 'the branch must remain');
    });

    await t.test('AC-11: the reminder comes once 4 working hours have really passed', async () => {
      rig.now.advanceHours(1.5); // Monday 12:30 — four and a half working hours for ticket 2
      await poll(rig);
      assert.equal(sent(rig, 'reminder', '2').length, 1, diag(rig, '2'));
      assert.equal(sent(rig, 'escalation', '2').length, 0);
    });

    await t.test('AC-37: a late answer does not restart a ticket that was handed back', async () => {
      await rig.board.comment('1', 'Use "Hello".', 'po');
      await poll(rig);
      assert.deepEqual(rig.runner.calls.map(ticketOf), ['1', '2']);
      assert.equal(rig.run('1').status, 'handed_back');
    });
  });

  test('parked tickets hold no slot; an unanswered approval is chased like a question', async (t) => {
    const handler = (req) => (ticketOf(req) === '1' && req.stage === 'groom' ? QUESTION : undefined);
    const rig = makeRig({ config: { ...FAST, concurrency: 1, gates: { design: true } }, handler });
    t.after(rig.cleanup);
    await rig.addTicket('1');
    await rig.factory.runUntilIdle();
    assert.equal(rig.run('1').status, 'waiting_answer', diag(rig, '1'));
    await rig.addTicket('2');
    await rig.factory.runUntilIdle();

    await t.test('AC-12: while one ticket is parked, another eligible ticket starts and progresses, even with a single slot', () => {
      assert.equal(rig.run('1').status, 'waiting_answer', 'ticket 1 must still be parked');
      assert.deepEqual(rig.runner.calls.map((c) => `${ticketOf(c)}:${c.stage}`), ['1:groom', '2:groom', '2:design'], diag(rig, '2'));
      assert.equal(rig.run('2').status, 'waiting_approval', diag(rig, '2'));
      assert.equal(rig.run('2').pending.gate, 'design');
    });

    await t.test('AC-11: an unanswered approval gets one reminder after 4 working hours and one escalation after 8', async () => {
      rig.now.advanceHours(4.5);
      await poll(rig);
      assert.equal(sent(rig, 'reminder', '2').length, 1, diag(rig, '2'));
      assert.equal(sent(rig, 'escalation', '2').length, 0);
      rig.now.advanceHours(4);
      await poll(rig);
      assert.equal(sent(rig, 'reminder', '2').length, 1);
      assert.equal(sent(rig, 'escalation', '2').length, 1);
      assert.equal(rig.run('2').status, 'waiting_approval');
    });
  });
});
