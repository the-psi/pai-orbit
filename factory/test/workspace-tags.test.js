'use strict';
// Found by the Docker run with the real agent: a release attempt tagged v1.0.1 locally, its push
// failed, and another ticket's release then published v1.0.1 on a different commit. The retry
// could not push its tags because the stale local v1.0.1 disagreed with the remote's.
// Before a release, the workspace's tags must be exactly the remote's.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WorkspaceManager } = require('../src/workspace');
const { makeRemote, git } = require('./helpers');

test('checkoutBase replaces stale local tags with the remote\'s and drops local-only tags', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-factory-tags-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }));
  const { remote, seed } = makeRemote(root);
  const ws = new WorkspaceManager({ root: path.join(root, 'ws'), repoUrl: remote, baseBranch: 'main' });
  const dir = await ws.prepare('1', 'factory/1-x');
  const first = git(dir, 'rev-parse', 'origin/main');

  // An earlier release attempt left two tags in the workspace that never reached the remote.
  git(dir, 'tag', 'v1.0.1', first);
  git(dir, 'tag', 'v0.0.9-local-only', first);

  // Meanwhile the base moved and someone else published v1.0.1 on the new commit.
  fs.writeFileSync(path.join(seed, 'more.txt'), 'more\n');
  git(seed, 'add', 'more.txt');
  git(seed, 'commit', '--quiet', '-m', 'second');
  git(seed, 'tag', 'v1.0.1');
  git(seed, 'push', '--quiet', 'origin', 'main', '--tags');
  const second = git(seed, 'rev-parse', 'HEAD');

  await ws.checkoutBase(dir);

  assert.equal(git(dir, 'rev-parse', 'HEAD'), second, 'the workspace is on the current base');
  assert.equal(git(dir, 'rev-parse', 'v1.0.1^{commit}'), second, 'the stale local tag now matches the remote');
  assert.deepEqual(git(dir, 'tag').split('\n'), ['v1.0.1'], 'the local-only tag is gone');

  // A new tag can now be pushed without the old one getting in the way.
  git(dir, 'tag', 'v1.0.2');
  git(dir, 'push', '--quiet', 'origin', '--tags');
  assert.match(git(remote, 'tag'), /v1\.0\.2/);
});
