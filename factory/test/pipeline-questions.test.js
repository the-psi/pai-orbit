'use strict';
// Scenario tests: stop and ask (Scenario 3) — AC-6, AC-7, AC-33.
// Each rig is driven through one scenario; its steps are sub-tests named after the criterion.
const test = require('node:test');
const { describe } = test;
const assert = require('node:assert/strict');
const { makeRig } = require('./helpers');

const BOT = 'orbit-factory';
const Q1 = 'Should the greeting be shown to signed-out visitors?';
const Q2 = 'Which language should the greeting use?';
const ANSWER = 'Yes for signed-out visitors, and use English only.';
const questions = [
  { question: Q1, why: 'The ticket does not say who sees it.' },
  { question: Q2, why: 'There is no locale rule in the ticket.' },
];
const ask = (extra = {}) => ({ result: { status: 'needs_input', summary: '', questions }, ...extra });

const stagesCalled = (rig) => rig.runner.calls.map((c) => c.stage);
const diag = (rig, id) => `run: ${JSON.stringify(rig.run(id))}\nlogs: ${rig.logs.join('\n')}`;
const hasWaiting = (rig, id) => rig.ticket(id).labels.includes(rig.config.board.waitingLabel);

describe('pipeline: questions', { concurrency: 2 }, () => {
  test('question in groom: asked once on the ticket, answered only by a named person', async (t) => {
    let asked = false;
    const handler = (req) => {
      if (req.stage === 'groom' && !asked) {
        asked = true;
        return ask();
      }
      return undefined;
    };
    // The requirements gate is on only so the run parks again right after the resumed groom.
    const rig = makeRig({ config: { stages: { review: false }, gates: { requirements: true } }, handler });
    t.after(rig.cleanup);
    // The bot created this ticket, so "@reporter" in the answer role resolves to the bot itself.
    await rig.addTicket('1', { reporter: BOT });
    await rig.factory.runUntilIdle();

    await t.test('AC-6: needs_input posts one comment containing the questions, sets the waiting label and sends one chat alert linking to the ticket', () => {
      const ticket = rig.ticket('1');
      const withQuestions = ticket.comments.filter((c) => c.body.includes(Q1) || c.body.includes(Q2));
      assert.equal(withQuestions.length, 1, `expected one question comment: ${JSON.stringify(ticket.comments)}`);
      assert.ok(withQuestions[0].body.includes(Q1) && withQuestions[0].body.includes(Q2), 'both questions must be in the one comment');
      assert.equal(withQuestions[0].author, BOT);
      assert.ok(hasWaiting(rig, '1'), `waiting label missing: ${ticket.labels}`);
      const alerts = rig.notifier.events.filter((e) => e.type === 'question');
      assert.equal(alerts.length, 1, 'exactly one chat alert');
      assert.equal(alerts[0].ticketId, '1');
      assert.equal(alerts[0].url, ticket.url, 'the alert must link to the ticket');
      assert.equal(rig.run('1').status, 'waiting_answer', diag(rig, '1'));
    });

    await t.test('AC-6: no further stage runs while the question is open, however often the factory polls', async () => {
      await rig.factory.runUntilIdle();
      await rig.factory.runUntilIdle();
      assert.deepEqual(stagesCalled(rig), ['groom']);
      assert.equal(rig.ticket('1').comments.filter((c) => c.body.includes(Q1)).length, 1);
      assert.equal(rig.notifier.events.filter((e) => e.type === 'question').length, 1);
    });

    await t.test('AC-33, AC-34: the factory\'s own comments never count as an answer, even when the bot is the ticket reporter', async () => {
      await rig.board.comment('1', ANSWER); // posted under the bot identity
      await rig.factory.runUntilIdle();
      rig.now.advanceHours(5); // long enough for the factory to post its own reminder comment
      await rig.factory.runUntilIdle();
      await rig.factory.runUntilIdle();
      assert.ok(rig.ticket('1').comments.some((c) => c.author === BOT && /reminder/i.test(c.body)), 'expected the factory to have posted a reminder comment');
      assert.equal(rig.run('1').status, 'waiting_answer', 'the bot answered its own question');
      assert.deepEqual(stagesCalled(rig), ['groom']);
    });

    await t.test('AC-33: a reply from someone not named for the answer role leaves the ticket parked', async () => {
      for (const outsider of ['mallory', 'lead', 'rel']) await rig.board.comment('1', ANSWER, outsider);
      await rig.factory.runUntilIdle();
      assert.equal(rig.run('1').status, 'waiting_answer', 'an unauthorised reply resumed the run');
      assert.deepEqual(stagesCalled(rig), ['groom']);
      assert.ok(hasWaiting(rig, '1'));
    });

    await t.test('AC-33: the same reply from a named person resumes the run', async () => {
      await rig.board.comment('1', ANSWER, 'po');
      await rig.factory.runUntilIdle();
      assert.deepEqual(stagesCalled(rig), ['groom', 'groom'], diag(rig, '1'));
      assert.notEqual(rig.run('1').status, 'waiting_answer');
      const prompt = rig.runner.calls[1].prompt;
      assert.ok(prompt.includes(ANSWER), 'the answer is not in the prompt');
      assert.ok(prompt.includes('**po**'), 'the authorised answer is not attributed in the prompt');
      assert.ok(!/mallory|\*\*lead\*\*|\*\*rel\*\*|\*\*orbit-factory\*\*/.test(prompt), 'an unauthorised reply reached the agent');
    });
  });

  test('question in design: the run continues from the paused point after the reporter answers', async (t) => {
    let asked = false;
    let labelsDuringRerun;
    let rig;
    const handler = (req) => {
      if (req.stage !== 'design') return undefined;
      if (!asked) {
        asked = true;
        return ask({ sessionId: 'session-design-first' });
      }
      labelsDuringRerun = rig.ticket('1').labels.slice();
      return undefined;
    };
    rig = makeRig({ config: { stages: { review: false }, gates: { design: true } }, handler });
    t.after(rig.cleanup);
    await rig.addTicket('1', { reporter: 'alice' });
    await rig.factory.runUntilIdle();
    assert.deepEqual(stagesCalled(rig), ['groom', 'design'], diag(rig, '1'));
    assert.equal(rig.run('1').status, 'waiting_answer', diag(rig, '1'));
    assert.equal(rig.runner.calls[1].sessionId, undefined, 'the first design call must start a fresh session');

    await rig.board.comment('1', ANSWER, 'alice'); // the reporter is in the answer role
    await rig.factory.runUntilIdle();
    const run = rig.run('1');

    await t.test('AC-7: after the answer the SAME stage re-runs and earlier completed stages are not re-run', () => {
      assert.deepEqual(stagesCalled(rig), ['groom', 'design', 'design'], diag(rig, '1'));
    });
    await t.test('AC-7: the re-run resumes the previous session and the answer text is in the new prompt', () => {
      const rerun = rig.runner.calls[2];
      assert.ok(rerun, diag(rig, '1'));
      assert.equal(rerun.sessionId, 'session-design-first');
      assert.ok(rerun.prompt.includes(ANSWER), 'the answer text is not in the new prompt');
    });
    await t.test('AC-7: decisions-log.md on the branch contains the questions and the answer', () => {
      const log = rig.remoteGit('show', `${run.branch}:${run.featureDir}/decisions-log.md`);
      assert.ok(log.includes(Q1) && log.includes(Q2), `questions missing from decisions-log.md:\n${log}`);
      assert.ok(log.includes(ANSWER), `answer missing from decisions-log.md:\n${log}`);
      assert.ok(log.includes('alice'), 'who answered is not recorded');
    });
    await t.test('AC-6: the waiting label is removed once the question is answered', () => {
      assert.ok(labelsDuringRerun, diag(rig, '1'));
      assert.ok(!labelsDuringRerun.includes(rig.config.board.waitingLabel), 'the ticket still showed as waiting while the stage was running again');
    });
    await t.test('AC-7: the run carries on past the paused point (to the design gate switched on for this test)', () => {
      assert.equal(run.status, 'waiting_approval', diag(rig, '1'));
      assert.equal(run.pending.gate, 'design');
    });
  });
});
