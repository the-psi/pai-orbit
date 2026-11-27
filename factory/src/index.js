'use strict';
// Wires a Factory from a config: picks the implementation of each swappable part.

const fs = require('node:fs');
const path = require('node:path');
const { Factory } = require('./factory');
const { StateStore } = require('./state');
const { WorkspaceManager } = require('./workspace');
const { LocalBoard } = require('./boards/local');
const { GitHubBoard } = require('./boards/github');
const { LocalCodeHost } = require('./codehosts/local');
const { GitHubCodeHost } = require('./codehosts/github');
const { GitLabBoard } = require('./boards/gitlab');
const { GitLabCodeHost } = require('./codehosts/gitlab');
const { GitLabApi, parseRepoUrl } = require('./gitlab-api');
const { ClaudeCliRunner } = require('./runners/claude-cli');
const { FakeRunner } = require('./runners/fake');
const { ConsoleNotifier, SlackNotifier } = require('./notifiers');

/** `owner/name` from a GitHub URL or an `owner/name` string. */
function githubRepo(url) {
  const m = String(url).match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/);
  if (m) return m[1];
  if (/^[^/\s]+\/[^/\s]+$/.test(url)) return url;
  throw new Error(`repo.url is not a GitHub repository: ${url}`);
}

/**
 * @param {object} config a validated config (config.load)
 * @param {{dataDir: string, env?: object, log?: Function, overrides?: object}} opts
 */
function createFactory(config, opts) {
  const env = opts.env || process.env;
  const dataDir = path.resolve(opts.dataDir);
  const log = opts.log || (() => {});
  const o = opts.overrides || {};
  const labels = {
    readyLabel: config.board.readyLabel,
    ownedLabel: config.board.ownedLabel,
    waitingLabel: config.board.waitingLabel,
    declinedLabel: config.board.declinedLabel,
    groomedLabel: config.board.groomedLabel,
    botUser: config.board.botUser,
  };
  const localDir = path.join(dataDir, 'local');

  // One GitLab client, shared by the board and the code host, made only when one of them needs it.
  let gitlabApi = null;
  const gitlab = () => {
    if (!gitlabApi) {
      const g = config.gitlab;
      const where = g.apiUrl ? { baseUrl: g.apiUrl, project: g.project } : parseRepoUrl(config.repo.url);
      gitlabApi = new GitLabApi({ ...where, token: env[g.tokenEnv] || '', fetch: o.fetch });
    }
    return gitlabApi;
  };

  let board = o.board;
  if (!board) {
    if (config.board.type === 'github') board = new GitHubBoard({ repo: githubRepo(config.repo.url), ...labels });
    else if (config.board.type === 'gitlab') board = new GitLabBoard({ api: gitlab(), ...labels });
    else board = new LocalBoard({ dir: localDir, ...labels });
  }

  let codeHost = o.codeHost;
  if (!codeHost) {
    if (config.codeHost.type === 'github') {
      codeHost = new GitHubCodeHost({ repo: githubRepo(config.repo.url), mergeMethod: config.codeHost.mergeMethod });
    } else if (config.codeHost.type === 'gitlab') {
      codeHost = new GitLabCodeHost({ api: gitlab(), mergeMethod: config.codeHost.mergeMethod, tokenEnv: config.gitlab.tokenEnv });
    } else {
      codeHost = new LocalCodeHost({ dir: localDir, repoUrl: config.repo.url });
    }
  }

  const guard = path.join(config.runner.pluginDir, 'hooks', 'bash-guard.sh');
  const guardOn = config.runner.bashGuard === true
    || (config.runner.bashGuard === 'auto' && process.platform !== 'win32');
  const runner = o.runner || (config.runner.type === 'fake'
    ? new FakeRunner()
    : new ClaudeCliRunner({
      bashGuardPath: guardOn && fs.existsSync(guard) ? guard : '',
      command: config.runner.command,
      model: config.runner.model,
      pluginDir: config.runner.pluginDir,
      permissionMode: config.runner.permissionMode,
      allowedTools: config.runner.allowedTools,
      disallowedTools: config.runner.disallowedTools,
    }));

  let notifier = o.notifier;
  if (!notifier) {
    const webhookUrl = env[config.notifier.webhookEnv];
    notifier = config.notifier.type === 'slack' && webhookUrl
      ? new SlackNotifier({ webhookUrl, onError: (err) => log(`slack: ${err.message}`) })
      : new ConsoleNotifier();
  }

  const store = o.store || new StateStore(dataDir);
  const workspace = o.workspace || new WorkspaceManager({
    root: path.join(dataDir, 'workspaces'),
    repoUrl: config.repo.url,
    baseBranch: config.repo.baseBranch,
    authArgs: () => codeHost.gitAuthArgs(),
  });

  return new Factory({ config, board, codeHost, runner, notifier, store, workspace, log, env, now: o.now });
}

module.exports = { createFactory, githubRepo };
