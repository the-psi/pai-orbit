'use strict';
// Scenario tests: parallel tickets (Scenario 7) and the daily spend limit — AC-16, AC-17, AC-40.
const test = require('node:test');
const { describe } = test;
const assert = require('node:assert/strict');
const path = require('node:path');
const { makeRig } = require('./helpers');

const FAST = { stages: { review: false } };
const QUESTION = { result: { status: 'needs_input', summary: '', questions: [{ question: 'Which greeting text?', why: 'The ticket does not say.' }] } };
const ticketOf = (req) => (req.prompt.match(/ticket #(\S+)/) || [])[1];
const diag = (rig) => `runs: ${JSON.stringify(rig.store.all().map((r) => [r.ticketId, r.status, r.stage]))}\nlogs: ${rig.logs.join('\n')}`;
const sent = (rig, type) => rig.notifier.events.filter((e) => e.type === type);

async function until(cond, what, ms = 120000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}
const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));

describe('pipeline: parallel tickets and daily spend', { concurrency: 2 }, () => {
  test('three eligible tickets with concurrency 2', async (t) => {
    let inFlight = 0;
    let maxInFlight = 0;
    const open = []; // release functions for the agent runs in flight
    const order = [];
    const handler = async (req) => {
      const id = ticketOf(req);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      order.push(`start:${id}`);
      await new Promise((resolve) => open.push(resolve)); // held until the test lets it go
      order.push(`end:${id}`);
      inFlight -= 1;
      // Leave a file behind, then park on a question: the shortest distance that still pushes.
      return { ...QUESTION, write: { [`src/only-${id}.txt`]: `ticket ${id}\n` } };
    };
    const rig = makeRig({ config: { ...FAST, concurrency: 2 }, handler });
    t.after(rig.cleanup);
    for (const id of ['1', '2', '3']) await rig.addTicket(id);

    await rig.factory.tick();
    await until(() => open.length === 2, 'two agent runs in flight');

    await t.test('AC-16: while two runs are in flight the third ticket is not started, however often the factory polls', async () => {
      await rig.factory.tick();
      await rig.factory.tick();
      await settle();
      assert.equal(rig.runner.calls.length, 2, 'a third run started while two were in flight');
      assert.equal(inFlight, 2);
      assert.equal(rig.store.active().length, 2, 'the third ticket must not be claimed before a slot is free');
      const waiting = ['1', '2', '3'].filter((id) => !rig.run(id));
      assert.equal(waiting.length, 1);
      assert.ok(rig.ticket(waiting[0]).labels.includes(rig.config.board.readyLabel), 'the waiting ticket keeps its ready label');
    });

    open.splice(0).forEach((release) => release());
    await rig.factory.drain();
    await rig.factory.tick();
    await until(() => open.length === 1, 'the third run to start');
    open.splice(0).forEach((release) => release());
    await rig.factory.drain();

    await t.test('AC-16: at most 2 runner calls were ever in flight and the third ran after a slot was free', () => {
      assert.equal(maxInFlight, 2, diag(rig));
      assert.deepEqual(rig.runner.calls.map(ticketOf).sort(), ['1', '2', '3'], diag(rig));
      const third = rig.runner.calls.map(ticketOf)[2];
      const firstEnd = Math.min(...order.map((e, i) => (e.startsWith('end:') ? i : Infinity)));
      assert.ok(order.indexOf(`start:${third}`) > firstEnd, `the third started before a slot was free: ${order}`);
      for (const id of ['1', '2', '3']) assert.equal(rig.run(id).status, 'waiting_answer', diag(rig));
    });

    await t.test('AC-17: each ticket ran in its own workspace and branch; one ticket\'s files never appear on another\'s branch', () => {
      const cwds = rig.runner.calls.map((c) => path.resolve(c.cwd));
      assert.equal(new Set(cwds).size, 3, `workspaces are shared: ${cwds}`);
      for (const a of cwds) for (const b of cwds) assert.ok(a === b || !a.startsWith(b + path.sep), 'one workspace is nested in another');
      const branches = ['1', '2', '3'].map((id) => rig.run(id).branch);
      assert.equal(new Set(branches).size, 3);
      for (const id of ['1', '2', '3']) {
        const files = rig.remoteGit('ls-tree', '-r', '--name-only', rig.run(id).branch).split('\n');
        assert.deepEqual(files.filter((f) => f.startsWith('src/only-')), [`src/only-${id}.txt`], `branch of #${id}`);
      }
      assert.ok(!rig.remoteGit('ls-tree', '-r', '--name-only', 'main').includes('src/'), 'main must be untouched');
    });
  });

  test('daily spend limit', async (t) => {
    const handler = (req) => (req.stage === 'groom' ? { useDefault: true, costUsd: 3 } : undefined);
    const rig = makeRig({ config: { ...FAST, concurrency: 2, gates: { design: true }, limits: { costPerDayUsd: 3 } }, handler });
    t.after(rig.cleanup);
    const calls = () => rig.runner.calls.map((c) => `${ticketOf(c)}:${c.stage}`).sort();
    await rig.addTicket('1');
    await rig.addTicket('2');
    await rig.factory.runUntilIdle();

    await t.test('AC-40: once the daily spend limit is reached no new stage starts on any ticket', async () => {
      assert.deepEqual(calls(), ['1:groom', '2:groom'], `a stage started after the daily limit was reached: ${diag(rig)}`);
      await rig.addTicket('3');
      await rig.factory.runUntilIdle();
      await rig.factory.runUntilIdle();
      await rig.factory.runUntilIdle();
      assert.deepEqual(calls(), ['1:groom', '2:groom'], 'a stage started after the daily limit was reached');
      assert.equal(rig.run('3'), null, 'a new ticket was taken in after the daily limit was reached');
    });
    await t.test('AC-40: people get exactly one daily_limit notification', () => {
      assert.equal(sent(rig, 'daily_limit').length, 1);
    });
    await t.test('AC-40: the tickets wait; they are not failed or handed back', () => {
      for (const id of ['1', '2']) {
        assert.ok(['running', 'waiting_answer', 'waiting_approval'].includes(rig.run(id).status), diag(rig));
        assert.ok(rig.ticket(id).labels.includes(rig.config.board.ownedLabel));
      }
    });
    await t.test('AC-40: work resumes the next day', async () => {
      rig.now.advanceHours(24);
      await rig.factory.runUntilIdle();
      assert.ok(calls().includes('1:design') && calls().includes('2:design'), `work did not resume the next day: ${calls()}\n${diag(rig)}`);
      // Ticket 3 is now taken in; its groom uses up the new day's limit, so its design waits.
      assert.ok(calls().includes('3:groom'), `the waiting ticket was not taken in the next day: ${calls()}`);
      assert.ok(!calls().includes('3:design'), 'a stage started after the daily limit was reached again');
    });
    await t.test('AC-40: work resumes the same day when an operator raises the limit', async () => {
      // The operator raises the limit and restarts the factory with the new configuration.
      rig.config.limits.costPerDayUsd = 20;
      await rig.build().runUntilIdle();
      assert.ok(calls().includes('3:design'), `raising the limit did not resume work: ${calls()}\n${diag(rig)}`);
    });
  });
});
