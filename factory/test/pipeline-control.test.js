'use strict';
// Scenario tests: visibility, operator control and take-over (Scenarios 9, 10, 12) — AC-21, AC-22,
// AC-24, AC-29.
const test = require('node:test');
const { describe } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRig } = require('./helpers');

const FAST = { stages: { review: false } };
const BOT = 'orbit-factory';
const QUESTION = { result: { status: 'needs_input', summary: '', questions: [{ question: 'Which greeting text?', why: 'The ticket does not say.' }] } };
const ticketOf = (req) => (req.prompt.match(/ticket #(\S+)/) || [])[1];
const stagesOf = (rig, id) => rig.runner.calls.filter((c) => ticketOf(c) === id).map((c) => c.stage);
const diag = (rig) => `runs: ${JSON.stringify(rig.store.all().map((r) => [r.ticketId, r.status, r.stage, r.handBackReason]))}\nlogs: ${rig.logs.join('\n')}`;
const sent = (rig, type, id) => rig.notifier.events.filter((e) => e.type === type && e.ticketId === id);

/** Change a ticket the way a person would on the board: by editing it directly. */
function editTicket(rig, id, change) {
  const file = path.join(rig.dataDir, 'local', 'tickets', `${id}.json`);
  const ticket = JSON.parse(fs.readFileSync(file, 'utf8'));
  change(ticket);
  fs.writeFileSync(file, `${JSON.stringify(ticket, null, 2)}\n`);
}

async function until(cond, what, ms = 120000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** Resolves when the factory aborts this agent run, as a real runner would on its abort signal. */
function untilAborted(req) {
  return new Promise((resolve) => {
    if (req.signal.aborted) resolve();
    else req.signal.addEventListener('abort', resolve, { once: true });
  }).then(() => ({ problem: 'aborted', detail: 'killed by the factory' }));
}

describe('pipeline: control, visibility and take-over', { concurrency: 3 }, () => {
  test('AC-24: a paused factory starts no new ticket and no new stage, and carries on after it is resumed', async (t) => {
    let rig;
    let pauseInGroom = true;
    const handler = (req) => {
      // The operator pauses while groom is running: the stage in flight finishes, nothing new starts.
      if (req.stage === 'groom' && pauseInGroom) {
        rig.store.setControl({ paused: true });
        return undefined;
      }
      return QUESTION; // after the resume: park at once, shortest distance
    };
    rig = makeRig({ config: FAST, handler });
    t.after(rig.cleanup);

    await t.test('AC-24: paused before any work, the factory claims and starts nothing', async () => {
      rig.store.setControl({ paused: true });
      await rig.addTicket('1');
      await rig.factory.runUntilIdle();
      await rig.factory.runUntilIdle();
      assert.equal(rig.runner.calls.length, 0, 'a paused factory started a ticket');
      assert.ok(rig.ticket('1').labels.includes(rig.config.board.readyLabel), 'a paused factory must not claim tickets');
    });

    await t.test('AC-24: resumed, it starts; paused in mid-stage, the stage in flight finishes and no new stage starts on any ticket', async () => {
      rig.store.setControl({ paused: false });
      await rig.factory.runUntilIdle(); // groom runs, and the "operator" pauses during it
      assert.deepEqual(stagesOf(rig, '1'), ['groom'], `expected groom only: ${diag(rig)}`);
      await rig.addTicket('2');
      await rig.factory.runUntilIdle();
      await rig.factory.runUntilIdle();
      assert.equal(rig.runner.calls.length, 1, 'a new stage started while paused');
      assert.equal(rig.run('2'), null, 'a new ticket was claimed while paused');
      assert.ok(!['handed_back', 'declined'].includes(rig.run('1').status), 'pausing must not fail the ticket');
    });

    await t.test('AC-24: after un-pausing, both tickets carry on from where they were', async () => {
      pauseInGroom = false;
      rig.store.setControl({ paused: false });
      await rig.factory.runUntilIdle();
      assert.deepEqual(stagesOf(rig, '1'), ['groom', 'design'], diag(rig));
      assert.deepEqual(stagesOf(rig, '2'), ['groom'], diag(rig));
    });
  });

  test('stop and take-over while tickets are being worked on', async (t) => {
    // Tickets 1 and 3 sit in a long agent stage; ticket 2 asks a question and parks.
    const handler = (req) => (ticketOf(req) === '2' ? QUESTION : untilAborted(req));
    const rig = makeRig({ config: { ...FAST, concurrency: 3 }, handler });
    t.after(rig.cleanup);
    for (const id of ['1', '2', '3']) await rig.addTicket(id);
    await rig.factory.tick();
    await until(() => stagesOf(rig, '1').length === 1 && stagesOf(rig, '3').length === 1, 'tickets 1 and 3 to be in their agent stage');

    rig.store.requestStop('1'); // the operator stops ticket 1
    editTicket(rig, '3', (ticket) => { // a person takes ticket 3
      ticket.assignees = ['bob'];
      ticket.labels = ticket.labels.filter((l) => l !== rig.config.board.ownedLabel);
    });
    const afterPerson = rig.ticket('3');
    await rig.factory.runUntilIdle();
    await rig.factory.runUntilIdle();

    await t.test('AC-24: requestStop on a ticket in mid-stage hands it back with a report', () => {
      const stopped = rig.ticket('1');
      assert.equal(rig.run('1').status, 'handed_back', diag(rig));
      assert.ok(rig.runner.calls.find((c) => ticketOf(c) === '1').signal.aborted, 'the agent run in flight was not stopped');
      assert.deepEqual(stagesOf(rig, '1'), ['groom'], 'a stopped ticket ran another stage');
      assert.ok(stopped.comments.some((c) => c.author === BOT && /handed this ticket back/i.test(c.body) && /stopped/i.test(c.body)), 'no hand-back report saying it was stopped');
      assert.ok(!stopped.labels.includes(rig.config.board.ownedLabel));
      assert.ok(!stopped.assignees.includes(BOT));
      assert.deepEqual(rig.store.control().stop, [], 'the stop request must be cleared once served');
    });

    await t.test('AC-24: the other ticket keeps running', () => {
      assert.deepEqual(stagesOf(rig, '2'), ['groom'], diag(rig));
      assert.equal(rig.run('2').status, 'waiting_answer', diag(rig));
      assert.ok(rig.ticket('2').labels.includes(rig.config.board.ownedLabel));
      assert.ok(rig.ticket('2').assignees.includes(BOT));
    });

    await t.test('AC-29: a ticket taken over in mid-stage becomes taken_over: the agent run is stopped, no further call, ticket left as the person set it', () => {
      const now = rig.ticket('3');
      assert.ok(rig.runner.calls.find((c) => ticketOf(c) === '3').signal.aborted, 'the agent run in flight was not stopped');
      assert.deepEqual(stagesOf(rig, '3'), ['groom'], 'the factory kept working on a ticket a person took over');
      assert.equal(rig.run('3').status, 'taken_over', diag(rig));
      assert.deepEqual(now.labels, afterPerson.labels);
      assert.deepEqual(now.assignees, afterPerson.assignees);
      assert.equal(now.comments.length, afterPerson.comments.length, 'the factory commented on a ticket it no longer owns');
      assert.equal(sent(rig, 'taken_over', '3').length, 1, 'people must be told once that the factory stopped');
      assert.equal(sent(rig, 'handed_back', '3').length, 0);
    });

    await t.test('AC-24: requestStop on a parked ticket hands it back; a later answer does not restart it', async () => {
      rig.store.requestStop('2');
      await rig.factory.runUntilIdle();
      const stopped = rig.ticket('2');
      assert.equal(rig.run('2').status, 'handed_back', diag(rig));
      assert.ok(stopped.comments.some((c) => /handed this ticket back/i.test(c.body) && /stopped/i.test(c.body)));
      assert.ok(!stopped.labels.includes(rig.config.board.ownedLabel));
      assert.ok(!stopped.labels.includes(rig.config.board.waitingLabel));
      assert.ok(!stopped.assignees.includes(BOT));
      assert.ok(rig.remoteGit('branch', '--list', rig.run('2').branch).includes(rig.run('2').branch), 'the branch must remain');
      await rig.board.comment('2', 'Use "Hello".', 'po');
      await rig.factory.runUntilIdle();
      assert.equal(rig.runner.calls.length, 3);
    });

    await t.test('AC-22: after the runs end the events log still exists and includes stage_start and stage_end entries', async () => {
      for (const id of ['1', '2', '3']) {
        const file = path.join(rig.dataDir, 'runs', id, 'events.jsonl');
        assert.ok(fs.existsSync(file), `events.jsonl of #${id} is gone after the run ended`);
        const events = rig.store.events(id);
        const types = events.map((e) => e.type);
        assert.equal(types[0], 'claimed');
        const start = events.findIndex((e) => e.type === 'stage_start' && e.stage === 'groom');
        const end = events.findIndex((e) => e.type === 'stage_end' && e.stage === 'groom');
        assert.ok(start >= 0, `#${id}: no stage_start for groom: ${types}`);
        assert.ok(end > start, `#${id}: no stage_end after stage_start for groom: ${types}`);
        for (const e of events) {
          assert.equal(e.ticketId, id, 'every audit entry is attributable to its ticket');
          assert.ok(!Number.isNaN(Date.parse(e.at)), 'every audit entry is timestamped');
        }
      }
      assert.ok(rig.events('1').includes('handed_back'));
      assert.ok(rig.events('3').includes('taken_over'));
      // Polling on, and a restart, neither remove nor rewrite the record.
      const file = path.join(rig.dataDir, 'runs', '1', 'events.jsonl');
      const before = fs.readFileSync(file, 'utf8');
      await rig.factory.runUntilIdle();
      await rig.build().runUntilIdle();
      assert.equal(fs.readFileSync(file, 'utf8'), before);
    });
  });

  test('status of parked tickets, and people taking parked tickets over', async (t) => {
    const handler = (req) => (req.stage === 'groom' ? { ...QUESTION, costUsd: 1.25 } : undefined);
    const rig = makeRig({ config: { ...FAST, concurrency: 3 }, handler });
    t.after(rig.cleanup);
    for (const id of ['1', '2', '3']) await rig.addTicket(id);
    await rig.factory.runUntilIdle();
    for (const id of ['1', '2', '3']) assert.equal(rig.run(id).status, 'waiting_answer', diag(rig));

    await t.test('AC-21: status() reports each ticket\'s stage, what it waits on and for how long, and its cost so far', () => {
      rig.now.advanceHours(2);
      const status = rig.factory.status();
      assert.equal(status.length, 3);
      for (const id of ['1', '2', '3']) {
        const s = status.find((x) => x.ticketId === id);
        assert.ok(s, `no status for #${id}`);
        assert.equal(s.stage, 'groom');
        assert.match(s.waitingFor, /answer/);
        assert.equal(s.costUsd, 1.25);
        assert.ok(Math.abs(s.waitingHours - 2) < 0.1, `waitingHours ${s.waitingHours}`);
      }
      assert.deepEqual(rig.build().status(), status, 'a fresh process must report the same');
    });

    // Three people take a ticket each, in the three ways the board allows.
    const TAKE_OVERS = {
      1: ['assigns the ticket to themselves', (ticket) => { ticket.assignees.push('bob'); }],
      2: ['removes the owned label', (ticket) => { ticket.labels = ticket.labels.filter((l) => l !== rig.config.board.ownedLabel); }],
      3: ['closes the ticket', (ticket) => { ticket.state = 'closed'; }],
    };
    const afterPerson = {};
    const branches = {};
    for (const id of Object.keys(TAKE_OVERS)) {
      branches[id] = rig.run(id).branch;
      editTicket(rig, id, TAKE_OVERS[id][1]);
      afterPerson[id] = rig.ticket(id);
    }
    await rig.factory.runUntilIdle();
    // Even an authorised answer, a long wait or a restart must not make the factory act again.
    rig.runner.handler = () => undefined;
    for (const id of Object.keys(TAKE_OVERS)) await rig.board.comment(id, 'Use "Hello".', 'po');
    await rig.factory.runUntilIdle();
    rig.now.advanceHours(9 * 24);
    await rig.factory.runUntilIdle();
    await rig.build().runUntilIdle();

    for (const id of Object.keys(TAKE_OVERS)) {
      await t.test(`AC-29: when a person ${TAKE_OVERS[id][0]}, the run is taken_over with no further runner call and no label change by the factory`, () => {
        const now = rig.ticket(id);
        assert.equal(rig.run(id).status, 'taken_over', diag(rig));
        assert.deepEqual(stagesOf(rig, id), ['groom'], 'the factory kept working on a ticket a person took over');
        assert.deepEqual(now.labels, afterPerson[id].labels, 'the factory changed the labels of a ticket it no longer owns');
        assert.deepEqual(now.assignees, afterPerson[id].assignees, 'the factory changed the assignees of a ticket it no longer owns');
        assert.equal(now.state, afterPerson[id].state);
        assert.deepEqual(now.comments.filter((c) => c.author === BOT), afterPerson[id].comments.filter((c) => c.author === BOT), 'the factory commented on a ticket it no longer owns');
        assert.ok(rig.remoteGit('branch', '--list', branches[id]).includes(branches[id]), 'the branch must stay in place');
        assert.equal(sent(rig, 'handed_back', id).length, 0);
        assert.equal(sent(rig, 'taken_over', id).length, 1);
      });
    }
  });
});
