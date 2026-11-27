'use strict';
// Two tickets that change the same line. Found by the first real run: both merges were attempted
// at the same moment and the second was handed back. Merges must run one at a time, and a real
// git conflict must send the ticket back for rework, never merge silently or fail the ticket.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRig, git } = require('./helpers');

test('AC-18: two tickets changing the same line — the second is reworked, then merges', async (t) => {
  const handler = (req) => {
    const id = req.prompt.match(/Ticket #(\d+)/)[1];
    if (req.stage !== 'build') return undefined;
    if (/Feedback to address \(from: conflict\)/.test(req.prompt)) {
      // What an agent does on a conflict rework: merge the base in and resolve.
      try { git(req.cwd, 'merge', '--no-edit', 'origin/main'); } catch { /* conflict expected */ }
      fs.writeFileSync(path.join(req.cwd, 'shared.txt'), 'line from ticket 1\nline from ticket 2\n');
      git(req.cwd, 'add', 'shared.txt');
      git(req.cwd, 'commit', '--quiet', '-m', 'merge main and resolve conflict');
      return { result: { status: 'done', summary: 'Conflict resolved.', artifacts: ['shared.txt'] } };
    }
    return {
      result: { status: 'done', summary: 'Built.', artifacts: ['shared.txt'] },
      write: { 'shared.txt': `line from ticket ${id}\n` },
    };
  };
  const rig = makeRig({ handler });
  t.after(rig.cleanup);
  await rig.addTicket('1');
  await rig.addTicket('2');
  await rig.factory.runUntilIdle();
  assert.equal(rig.run('1').pending.gate, 'merge', rig.logs.join('\n'));
  assert.equal(rig.run('2').pending.gate, 'merge', rig.logs.join('\n'));

  // Both approved at once: the situation that raced in the real run.
  await rig.codeHost.addReview(rig.run('1').pr.id, { author: 'lead', state: 'approved' });
  await rig.codeHost.addReview(rig.run('2').pr.id, { author: 'lead', state: 'approved' });
  await rig.factory.runUntilIdle();

  const runs = [rig.run('1'), rig.run('2')];
  const merged = runs.filter((r) => r.stage === 'release');
  const reworked = runs.filter((r) => r.stage === 'merge');
  assert.equal(merged.length, 1, `exactly one ticket merges first: ${JSON.stringify(runs.map((r) => [r.ticketId, r.status, r.stage, r.handBackReason]))}`);
  assert.equal(reworked.length, 1, 'the other is back at the merge gate after rework, not handed back');
  const second = reworked[0];
  assert.equal(second.status, 'waiting_approval');
  assert.equal(second.rework.merge, 1);
  assert.ok(rig.events(second.ticketId).includes('rework'));
  assert.ok(!rig.events(second.ticketId).includes('handed_back'));
  // The old approval was on the pre-rework commit, so it must not have merged the reworked branch.
  assert.equal((await rig.codeHost.prStatus(second.pr.id)).state, 'open');

  // A fresh approval on the new commit merges it, and nothing from the first ticket is lost.
  await rig.codeHost.addReview(second.pr.id, { author: 'lead', state: 'approved' });
  await rig.factory.runUntilIdle();
  assert.equal(rig.run(second.ticketId).stage, 'release');
  assert.equal(rig.remoteGit('show', 'main:shared.txt'), 'line from ticket 1\nline from ticket 2');
});
