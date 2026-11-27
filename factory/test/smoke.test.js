'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeRig, toMergeGate, approveThrough } = require('./helpers');

test('happy path: a ticket goes from ready to released and closed', async (t) => {
  const rig = makeRig();
  t.after(rig.cleanup);
  const atGate = await toMergeGate(rig);
  assert.equal(atGate.status, 'waiting_approval', rig.logs.join('\n'));
  assert.equal(atGate.pending.gate, 'merge');
  assert.ok(atGate.pr);
  const done = await approveThrough(rig);
  assert.equal(done.status, 'done', rig.logs.join('\n'));
  assert.equal(rig.ticket('1').state, 'closed');
  assert.deepEqual(rig.runner.calls.map((c) => c.stage), ['groom', 'design', 'build', 'test', 'review', 'release']);
  assert.match(rig.remoteGit('log', '--oneline', 'main'), /Merge factory\/1-ticket-1/);
});
