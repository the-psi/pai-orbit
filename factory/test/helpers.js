'use strict';
// Shared test rig: a throwaway git "remote", a local board and code host, a fake runner, and a
// clock the test controls. No model, no network.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { fromObject } = require('../src/config');
const { createFactory } = require('../src/index');
const { StateStore } = require('../src/state');
const { LocalBoard } = require('../src/boards/local');
const { LocalCodeHost } = require('../src/codehosts/local');
const { FakeRunner } = require('../src/runners/fake');
const { MemoryNotifier } = require('../src/notifiers');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** A bare repo with one commit on `main`, standing in for the code host's remote. */
function makeRemote(root) {
  const remote = path.join(root, 'remote.git');
  const seed = path.join(root, 'seed');
  fs.mkdirSync(seed, { recursive: true });
  git(root, 'init', '--quiet', '--bare', '--initial-branch=main', remote);
  git(seed, 'init', '--quiet', '--initial-branch=main');
  git(seed, 'config', 'user.name', 'seed');
  git(seed, 'config', 'user.email', 'seed@localhost');
  git(seed, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(seed, 'README.md'), '# fixture project\n');
  git(seed, 'add', 'README.md');
  git(seed, 'commit', '--quiet', '-m', 'initial');
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', '--quiet', 'origin', 'main');
  return { remote, seed };
}

/** A clock that starts on a Monday morning (UTC) and moves only when told to. */
function makeClock(start = '2026-11-23T09:00:00.000Z') {
  let t = new Date(start).getTime();
  const now = () => new Date(t);
  now.advanceHours = (h) => { t += h * 3600 * 1000; };
  now.advanceMs = (ms) => { t += ms; };
  return now;
}

/**
 * Build a factory on a temp directory.
 * @param {{config?: object, handler?: Function}} [opts]
 */
function makeRig(opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-factory-test-'));
  const { remote, seed } = makeRemote(root);
  const now = makeClock();
  // Every timestamp the board or code host writes must be unique and ordered.
  const tick = () => { now.advanceMs(1000); return now(); };
  const overrides = opts.config || {};
  const config = fromObject({
    project: 'fixture',
    repo: { url: remote, baseBranch: 'main' },
    roles: {
      answer: ['@reporter', 'po'],
      requirementsApprover: ['po'],
      designApprover: ['lead'],
      mergeApprover: ['lead', 'dev2'],
      releaseApprover: ['rel'],
      escalation: ['boss'],
      ...(overrides.roles || {}),
    },
    runner: { type: 'fake', ...(overrides.runner || {}) },
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => !['roles', 'runner'].includes(k))),
  });
  const dataDir = path.join(root, 'data');
  const labels = {
    readyLabel: config.board.readyLabel, ownedLabel: config.board.ownedLabel,
    waitingLabel: config.board.waitingLabel, declinedLabel: config.board.declinedLabel,
    groomedLabel: config.board.groomedLabel,
    botUser: config.board.botUser,
  };
  const board = new LocalBoard({ dir: path.join(dataDir, 'local'), ...labels, now: tick });
  const codeHost = new LocalCodeHost({ dir: path.join(dataDir, 'local'), repoUrl: remote, now: tick });
  const runner = new FakeRunner({ handler: opts.handler });
  const notifier = new MemoryNotifier();
  const store = new StateStore(dataDir, { now });
  const logs = [];
  const build = () => createFactory(config, {
    dataDir,
    env: { PATH: process.env.PATH, GH_TOKEN: 'secret-gh', FACTORY_SLACK_WEBHOOK_URL: 'secret-slack', ANTHROPIC_API_KEY: 'model-key', DEPLOY_KEY: 'deploy-secret' },
    log: (m) => logs.push(m),
    overrides: { board, codeHost, runner, notifier, store, now },
  });
  const factory = build();
  const addTicket = (id, fields = {}) => board.create({
    id, title: fields.title || `Ticket ${id}`, body: fields.body || 'Add a greeting to the home page.',
    labels: fields.labels || [config.board.readyLabel], reporter: fields.reporter || 'alice',
    assignees: fields.assignees || [],
  });
  const cleanup = () => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  return {
    root, remote, seed, config, dataDir, board, codeHost, runner, notifier, store, now, factory, logs,
    build, addTicket, cleanup,
    run: (id) => store.load(id),
    ticket: (id) => board.raw(id),
    comments: (id) => board.raw(id).comments,
    events: (id) => store.events(id).map((e) => e.type),
    remoteGit: (...args) => git(remote, ...args),
  };
}

/** Drive a ticket that needs no questions all the way to the merge gate. */
async function toMergeGate(rig, id = '1') {
  await rig.addTicket(id);
  await rig.factory.runUntilIdle();
  return rig.run(id);
}

/** Approve the pull request, merge, approve the release and release. */
async function approveThrough(rig, id = '1') {
  const run = rig.run(id);
  await rig.codeHost.addReview(run.pr.id, { author: 'lead', state: 'approved' });
  await rig.factory.runUntilIdle();
  await rig.board.comment(id, '/approve', 'rel');
  await rig.factory.runUntilIdle();
  return rig.run(id);
}

module.exports = { makeRig, makeClock, makeRemote, toMergeGate, approveThrough, git };
