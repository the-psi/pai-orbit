'use strict';
// Scenario tests: run cannot finish (Scenario 6) and decline (Scenario 8) — AC-13, AC-14, AC-15,
// AC-19, AC-20, AC-38. Independent tickets share a rig (one git remote) where they do not
// interact; each ticket's outcome is a sub-test named after the criterion it proves.
const test = require('node:test');
const { describe } = test;
const assert = require('node:assert/strict');
const { makeRig } = require('./helpers');

const FAST = { stages: { review: false } };
const BOT = 'orbit-factory';
const QUESTION = { result: { status: 'needs_input', summary: '', questions: [{ question: 'Banner or toast?', why: 'Both exist.' }] } };
const ticketOf = (req) => (req.prompt.match(/ticket #(\S+)/) || [])[1];
const stagesOf = (rig, id) => rig.runner.calls.filter((c) => ticketOf(c) === id).map((c) => c.stage);
const stagesCalled = (rig) => rig.runner.calls.map((c) => c.stage);
const diag = (rig, id) => `run: ${JSON.stringify(rig.run(id))}\nlogs: ${rig.logs.join('\n')}`;
const sent = (rig, type, id) => rig.notifier.events.filter((e) => e.type === type && e.ticketId === id);

function remoteFile(rig, branch, rel) {
  try {
    return rig.remoteGit('show', `${branch}:${rel}`);
  } catch {
    return null;
  }
}

/** The hand-back report, after checking the ticket really was given back to people. */
function assertHandedBack(rig, id) {
  const ticket = rig.ticket(id);
  assert.equal(rig.run(id).status, 'handed_back', diag(rig, id));
  assert.ok(!ticket.labels.includes(rig.config.board.ownedLabel), 'the owned label must be removed');
  assert.ok(!ticket.assignees.includes(BOT), 'the bot must be unassigned');
  assert.equal(ticket.state, 'open');
  const reports = ticket.comments.filter((c) => c.author === BOT && /handed this ticket back/i.test(c.body));
  assert.equal(reports.length, 1, `expected one hand-back report: ${JSON.stringify(ticket.comments)}`);
  assert.equal(sent(rig, 'handed_back', id).length, 1);
  return reports[0].body;
}

function assertDeclined(rig, id, reasonPattern) {
  const ticket = rig.ticket(id);
  assert.equal(rig.run(id).status, 'declined', diag(rig, id));
  assert.ok(ticket.labels.includes(rig.config.board.declinedLabel), `declined label missing on #${id}: ${ticket.labels}`);
  assert.ok(!ticket.labels.includes(rig.config.board.readyLabel), 'the eligibility marker must be cleared');
  assert.ok(!ticket.labels.includes(rig.config.board.ownedLabel));
  assert.ok(!ticket.assignees.includes(BOT));
  assert.ok(ticket.comments.some((c) => c.author === BOT && reasonPattern.test(c.body)), `no comment with the reason ${reasonPattern} on #${id}: ${JSON.stringify(ticket.comments)}`);
}

describe('pipeline: failures and declines', { concurrency: 3 }, () => {
  test('stage problems: crash, missing document, agent decline, budget, timeout', async (t) => {
    const DECLINE = 'The ticket needs a UX flow (ux.md) that does not exist; the factory does not write UX.';
    let crashedOnce = false;
    const handler = (req) => {
      switch (ticketOf(req)) {
        case '1': // groom crashes once and then works; design crashes every time
          if (req.stage === 'groom' && !crashedOnce) {
            crashedOnce = true;
            return { problem: 'crash', detail: 'boom' };
          }
          if (req.stage === 'design') {
            return { problem: 'crash', detail: 'agent process died with SIGSEGV', write: { 'src/half-done.txt': 'partial work\n' } };
          }
          return undefined;
        case '2': // says done, but never writes requirements.md
          return { result: { status: 'done', summary: 'I wrote the requirements (but did not).' } };
        case '3':
          return { result: { status: 'declined', summary: '', reason: DECLINE } };
        case '4':
          return { problem: 'budget', detail: 'stage budget of USD 15 used up', costUsd: 15, write: { 'src/a.txt': 'a\n' } };
        case '5':
          return { problem: 'timeout', detail: 'killed after 2 hours', write: { 'src/b.txt': 'b\n' } };
        default:
          return undefined;
      }
    };
    const rig = makeRig({ config: { ...FAST, concurrency: 5 }, handler });
    t.after(rig.cleanup);
    for (const id of ['1', '2', '3', '4', '5']) await rig.addTicket(id);
    await rig.factory.runUntilIdle();

    await t.test('AC-13: a crash is retried once (and the run carries on if the retry works); a second crash hands the ticket back', () => {
      assert.deepEqual(stagesOf(rig, '1'), ['groom', 'groom', 'design', 'design'], diag(rig, '1'));
      assert.equal(rig.run('1').status, 'handed_back', diag(rig, '1'));
    });
    await t.test('AC-13: the hand-back posts a report naming stage and cause, removes the owned label and bot assignee, and the branch with the work is in the remote', () => {
      const report = assertHandedBack(rig, '1');
      assert.match(report, /design/, 'the report must name the stage');
      assert.match(report, /SIGSEGV/, 'the report must give the cause');
      const run = rig.run('1');
      assert.ok(remoteFile(rig, run.branch, `${run.featureDir}/requirements.md`) !== null, 'completed work is not on the remote branch');
      assert.equal(remoteFile(rig, run.branch, 'src/half-done.txt'), 'partial work', 'unfinished work is not on the remote branch');
    });
    await t.test('REQ-3: a "done" result whose required document does not exist is not accepted', () => {
      assert.ok(stagesOf(rig, '2').length >= 1);
      assert.ok(stagesOf(rig, '2').every((s) => s === 'groom'), `design started although requirements.md does not exist: ${stagesOf(rig, '2')}`);
      const report = assertHandedBack(rig, '2');
      assert.match(report, /groom/);
      assert.match(report, /requirements\.md/);
    });
    await t.test('AC-19, AC-20: a ticket the agent declines (too vague, or needing UX work that does not exist) is declined with the agent\'s reason', () => {
      assert.deepEqual(stagesOf(rig, '3'), ['groom'], 'a declined ticket must not be retried or continued');
      assertDeclined(rig, '3', /needs a UX flow/);
      assert.equal(sent(rig, 'declined', '3').length, 1);
    });
    await t.test('AC-13, AC-14: a stage stopped at its cost budget is handed back at once, with no retry', () => {
      assert.deepEqual(stagesOf(rig, '4'), ['groom']);
      const report = assertHandedBack(rig, '4');
      assert.match(report, /groom/);
      assert.match(report, /cost|budget/i);
      assert.equal(remoteFile(rig, rig.run('4').branch, 'src/a.txt'), 'a', 'work kept on the branch');
    });
    await t.test('AC-13, AC-14: a stage stopped at its time limit is handed back at once, with no retry', () => {
      assert.deepEqual(stagesOf(rig, '5'), ['groom']);
      const report = assertHandedBack(rig, '5');
      assert.match(report, /groom/);
      assert.match(report, /time/i);
      assert.equal(remoteFile(rig, rig.run('5').branch, 'src/b.txt'), 'b', 'work kept on the branch');
    });
    await t.test('AC-13: tickets that were handed back or declined are over: nothing more runs', async () => {
      const count = rig.runner.calls.length;
      await rig.factory.runUntilIdle();
      assert.equal(rig.runner.calls.length, count);
    });
  });

  test('ticket limits: cost and active run time', async (t) => {
    const handler = (req) => {
      if (ticketOf(req) === '1') {
        if (req.stage === 'groom') return { useDefault: true, costUsd: 4 };
        if (req.stage === 'design') return { useDefault: true, costUsd: 1 };
      }
      if (ticketOf(req) === '2' && req.stage === 'groom') return { useDefault: true, durationMs: 61 * 60 * 1000 };
      return undefined;
    };
    const rig = makeRig({ config: { ...FAST, limits: { costPerTicketUsd: 5, activeHoursPerTicket: 1 } }, handler });
    t.after(rig.cleanup);
    await rig.addTicket('1');
    await rig.addTicket('2');
    await rig.factory.runUntilIdle();

    await t.test('AC-14: when the ticket cost reaches limits.costPerTicketUsd no further runner call is made', async () => {
      const calls = rig.runner.calls.filter((c) => ticketOf(c) === '1');
      assert.deepEqual(calls.map((c) => c.stage), ['groom', 'design'], `build must not start at the cost limit: ${diag(rig, '1')}`);
      assert.ok(calls[0].budgetUsd <= 5, 'the first stage budget exceeds the ticket limit');
      assert.ok(calls[1].budgetUsd <= 1 + 1e-9, `the stage budget (${calls[1].budgetUsd}) exceeds what is left of the ticket limit`);
      assert.equal(rig.run('1').costUsd, 5);
      const report = assertHandedBack(rig, '1');
      assert.match(report, /cost limit/i);
    });
    await t.test('REQ-44: people are warned once when a ticket passes 70% of its cost limit', () => {
      assert.equal(sent(rig, 'cost_warning', '1').length, 1);
      assert.equal(sent(rig, 'cost_warning', '2').length, 0);
    });
    await t.test('AC-14: when the ticket reaches its active run-time limit no further runner call is made', () => {
      assert.deepEqual(stagesOf(rig, '2'), ['groom'], diag(rig, '2'));
      const report = assertHandedBack(rig, '2');
      assert.match(report, /time/i);
    });
    await t.test('AC-14: nothing more runs afterwards', async () => {
      await rig.factory.runUntilIdle();
      assert.equal(rig.runner.calls.length, 3);
    });
  });

  test('AC-13: a failing test stage sends the ticket back to build with the failure text; after limits.testFixAttempts it is handed back', async (t) => {
    const FAILURE = 'greeting.test.js: expected "Hello, Ada" but got "Hello, undefined"';
    const handler = (req) => (req.stage === 'test'
      ? { result: { status: 'failed', summary: 'One test fails.', reason: FAILURE } }
      : undefined);
    const rig = makeRig({ config: { ...FAST, limits: { testFixAttempts: 1 } }, handler });
    t.after(rig.cleanup);
    await rig.addTicket('1');
    await rig.factory.runUntilIdle();

    assert.deepEqual(stagesCalled(rig), ['groom', 'design', 'build', 'test', 'build', 'test'], diag(rig, '1'));
    assert.ok(!rig.runner.calls[2].prompt.includes(FAILURE));
    assert.ok(rig.runner.calls[4].prompt.includes(FAILURE), 'the failure text is not in the fix prompt');
    const report = assertHandedBack(rig, '1');
    assert.match(report, /test/i, 'the report must name the stage');
    assert.ok(report.includes(FAILURE) || /still failing/i.test(report), 'the report must give the cause');
    const run = rig.run('1');
    assert.ok(remoteFile(rig, run.branch, 'src/feature.txt') !== null, 'the built code is not on the remote branch');
    assert.equal(run.pr, null, 'no pull request may be opened for failing tests');
  });

  test('AC-15: after a restart the ticket continues from its current stage', async (t) => {
    let reachedDesign;
    const inDesign = new Promise((resolve) => { reachedDesign = resolve; });
    let designCalls = 0;
    const handler = (req) => {
      if (req.stage !== 'design') return undefined;
      designCalls += 1;
      if (designCalls === 1) {
        reachedDesign();
        return new Promise(() => {}); // the first factory process "dies" here and never returns
      }
      if (designCalls === 2) return { ...QUESTION, sessionId: 'sess-design' };
      return undefined;
    };
    const rig = makeRig({ config: { ...FAST, gates: { design: true } }, handler });
    t.after(rig.cleanup);
    await rig.addTicket('1');
    await rig.factory.tick();
    await inDesign;
    assert.deepEqual(stagesCalled(rig), ['groom', 'design']);

    await t.test('AC-15: restarted mid-stage, the current stage runs again and completed stages are not re-run', async () => {
      const second = rig.build(); // a new factory process on the same data directory
      await second.runUntilIdle();
      assert.deepEqual(stagesCalled(rig), ['groom', 'design', 'design'], diag(rig, '1'));
      assert.equal(rig.events('1').filter((e) => e === 'claimed').length, 1, 'the ticket was claimed again after the restart');
      assert.equal(rig.run('1').status, 'waiting_answer', diag(rig, '1'));
    });

    await t.test('AC-15: restarted while parked, nothing is re-run and the answer still resumes the paused stage in its session', async () => {
      const third = rig.build();
      await third.runUntilIdle();
      assert.deepEqual(stagesCalled(rig), ['groom', 'design', 'design'], 'a restart must not re-run anything on a parked ticket');
      await rig.board.comment('1', 'Banner.', 'alice');
      await third.runUntilIdle();
      assert.deepEqual(stagesCalled(rig), ['groom', 'design', 'design', 'design'], diag(rig, '1'));
      assert.equal(rig.runner.calls[3].sessionId, 'sess-design');
      const run = rig.run('1');
      assert.equal(run.status, 'waiting_approval', diag(rig, '1'));
      assert.equal(run.pending.gate, 'design');
      assert.ok(remoteFile(rig, run.branch, `${run.featureDir}/requirements.md`) !== null);
      assert.ok(remoteFile(rig, run.branch, `${run.featureDir}/design.md`) !== null);
    });
  });

  test('AC-38: the after-design size and sensitivity check', async (t) => {
    const SIZES = {
      1: { files: 16, changedLines: 100, services: 1, paths: ['src/a.js'] },
      2: { files: 3, changedLines: 50, services: 1, paths: ['src/app.js', 'src/auth/login.js'] },
      3: { files: 3, changedLines: 601, services: 1, paths: ['src/a.js'] },
      4: { files: 3, changedLines: 50, services: 2, paths: ['src/a.js'] },
      5: { files: 15, changedLines: 600, services: 1, paths: ['src/billing-report.js'] }, // exactly at the thresholds; 'billing' in a file name is not a protected folder
    };
    const handler = (req) => {
      if (req.stage === 'design') return { useDefault: true, result: { status: 'done', summary: 'Designed.', size: SIZES[ticketOf(req)] } };
      if (req.stage === 'build') return QUESTION; // park ticket 5 at once
      return undefined;
    };
    const rig = makeRig({ config: { ...FAST, concurrency: 5 }, handler });
    t.after(rig.cleanup);
    for (const id of Object.keys(SIZES)) await rig.addTicket(id);
    await rig.factory.runUntilIdle();
    const builds = rig.runner.calls.filter((c) => c.stage === 'build').map(ticketOf);

    await t.test('AC-38: a design with size.files over the limit is declined before any build call', () => {
      assert.ok(!builds.includes('1'));
      assert.deepEqual(stagesOf(rig, '1'), ['groom', 'design']);
      assertDeclined(rig, '1', /16 files/);
    });
    await t.test('AC-38: a design that plans to change a file in a protected folder is declined before any build call', () => {
      assert.ok(!builds.includes('2'));
      assert.deepEqual(stagesOf(rig, '2'), ['groom', 'design']);
      assertDeclined(rig, '2', /src\/auth\/login\.js matches \*\*\/auth\/\*\*/);
    });
    await t.test('AC-38: a design over the changed-lines limit is declined before any build call', () => {
      assert.ok(!builds.includes('3'));
      assertDeclined(rig, '3', /601/);
    });
    await t.test('AC-38: a design touching more than one service is declined before any build call', () => {
      assert.ok(!builds.includes('4'));
      assertDeclined(rig, '4', /2 services/);
    });
    await t.test('AC-38: a design exactly at the thresholds goes on to build', () => {
      assert.deepEqual(stagesOf(rig, '5'), ['groom', 'design', 'build'], diag(rig, '5'));
    });
  });
});
