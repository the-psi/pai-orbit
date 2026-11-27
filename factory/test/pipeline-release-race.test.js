'use strict';
// Found by the first Docker run with the real agent: one ticket's release ran while another
// ticket was being merged. The base branch moved under the release, and the release's push of
// the base branch was refused, so a correctly released ticket was handed back.
// A release and a merge must never overlap, and a release must never force-push the base.

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeRig, git } = require('./helpers');

test('AC-39: a release and a merge approved at the same moment both succeed', async (t) => {
  let tag = 0;
  const handler = (req) => {
    const id = req.prompt.match(/Ticket #(\d+)/)[1];
    if (req.stage === 'build') {
      return { result: { status: 'done', summary: 'Built.', artifacts: [] }, write: { [`src/only-${id}.txt`]: `ticket ${id}\n` } };
    }
    if (req.stage === 'release') {
      tag += 1;
      git(req.cwd, 'tag', `v9.9.${tag}`); // what a tag-level release does: tag locally, push nothing
      return { result: { status: 'done', summary: `Tagged v9.9.${tag}.`, artifacts: [] } };
    }
    return undefined;
  };
  const rig = makeRig({ handler });
  t.after(rig.cleanup);
  await rig.addTicket('1');
  await rig.addTicket('2');
  await rig.factory.runUntilIdle();

  // Ticket 1: merged and waiting for release approval. Ticket 2: still waiting for code review.
  await rig.codeHost.addReview(rig.run('1').pr.id, { author: 'lead', state: 'approved' });
  await rig.factory.runUntilIdle();
  assert.equal(rig.run('1').pending.gate, 'release', rig.logs.join('\n'));
  assert.equal(rig.run('2').pending.gate, 'merge', rig.logs.join('\n'));

  // Both approvals arrive before the factory's next pass.
  await rig.board.comment('1', '/approve', 'rel');
  await rig.codeHost.addReview(rig.run('2').pr.id, { author: 'lead', state: 'approved' });
  await rig.factory.runUntilIdle();

  const one = rig.run('1');
  const two = rig.run('2');
  assert.equal(one.status, 'done', `ticket 1 was not released: ${one.handBackReason || ''}\n${rig.logs.join('\n')}`);
  assert.equal(two.stage, 'release', `ticket 2 was not merged: ${two.handBackReason || ''}`);
  assert.ok(!rig.events('1').includes('handed_back'));
  // Both tickets' work is on the base branch, and the release tag reached the remote.
  const files = rig.remoteGit('ls-tree', '-r', '--name-only', 'main');
  assert.ok(files.includes('src/only-1.txt') && files.includes('src/only-2.txt'), files);
  assert.match(rig.remoteGit('tag'), /v9\.9\.1/);
});

test('AC-39: a release that adds a commit pushes the base branch plainly and loses nothing', async (t) => {
  const handler = (req) => {
    if (req.stage !== 'release') return undefined;
    return { result: { status: 'done', summary: 'Bumped the version.', artifacts: ['VERSION'] }, write: { VERSION: '1.0.1\n' } };
  };
  const rig = makeRig({ handler });
  t.after(rig.cleanup);
  await rig.addTicket('1');
  await rig.factory.runUntilIdle();
  await rig.codeHost.addReview(rig.run('1').pr.id, { author: 'lead', state: 'approved' });
  await rig.factory.runUntilIdle();
  await rig.board.comment('1', '/approve', 'rel');
  await rig.factory.runUntilIdle();
  assert.equal(rig.run('1').status, 'done', rig.logs.join('\n'));
  assert.equal(rig.remoteGit('show', 'main:VERSION'), '1.0.1');
  assert.match(rig.remoteGit('log', '--oneline', 'main'), /Merge factory\/1-ticket-1/); // the merge is still there
});
