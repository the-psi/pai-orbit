'use strict';
// Found by the first run against GitHub: one push was rejected with a bare "(failed)" at the
// moment another ticket was pushing, and the factory handed a healthy ticket back. Its own next
// push, two seconds later, succeeded. A push that fails once must be tried again.

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeRig } = require('./helpers');

function flakyPush(rig, failures) {
  const real = rig.codeHost.push.bind(rig.codeHost);
  let left = failures;
  let calls = 0;
  rig.codeHost.push = async (...args) => {
    calls += 1;
    if (left > 0) { left -= 1; throw new Error('git push origin x failed (exit 1): ! [remote rejected] (failed)'); }
    return real(...args);
  };
  rig.factory.pushRetryDelaysMs = [1, 1];
  return () => calls;
}

test('a push that fails once is retried and the ticket carries on', async (t) => {
  const rig = makeRig();
  t.after(rig.cleanup);
  const calls = flakyPush(rig, 1);
  await rig.addTicket('1');
  await rig.factory.runUntilIdle();
  const run = rig.run('1');
  assert.equal(run.status, 'waiting_approval', `handed back: ${run.handBackReason}\n${rig.logs.join('\n')}`);
  assert.equal(run.pending.gate, 'merge');
  assert.ok(rig.events('1').includes('push_retry'));
  assert.ok(!rig.events('1').includes('handed_back'));
  assert.ok(calls() > 1);
});

test('a push that keeps failing is still an error, after three tries', async (t) => {
  const rig = makeRig();
  t.after(rig.cleanup);
  flakyPush(rig, 1000);
  await rig.addTicket('1');
  await rig.factory.runUntilIdle();
  const run = rig.run('1');
  assert.equal(run.status, 'handed_back');
  assert.equal(rig.events('1').filter((e) => e === 'push_retry').length >= 2, true);
  assert.match(rig.comments('1').at(-1).body, /handed this ticket back/);
});
