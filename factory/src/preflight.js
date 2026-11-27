'use strict';
// Checks run before the factory starts. A failed check stops the factory; a warning does not.

const fs = require('node:fs');
const path = require('node:path');
const { run, resolveCommand } = require('./exec');

/**
 * @param {object} config
 * @param {{env?: object, exec?: Function, codeHost?: object}} [opts]
 * @returns {Promise<{ok: boolean, checks: {name: string, level: 'ok'|'warn'|'fail', detail: string}[]}>}
 */
async function preflight(config, opts = {}) {
  const env = opts.env || process.env;
  const exec = opts.exec || run;
  const checks = [];
  const add = (name, level, detail) => checks.push({ name, level, detail });

  const git = await exec('git', ['--version'], { env });
  add('git', git.code === 0 ? 'ok' : 'fail', git.code === 0 ? git.stdout.trim() : 'git is not installed');

  // A private repository needs the code host's credentials even to be listed.
  const auth = opts.codeHost && typeof opts.codeHost.gitAuthArgs === 'function' ? opts.codeHost.gitAuthArgs() : [];
  const remote = await exec('git', [...auth, 'ls-remote', '--heads', config.repo.url, config.repo.baseBranch], { env, timeoutMs: 30000 });
  if (remote.code !== 0) add('repository', 'fail', `cannot reach ${config.repo.url}`);
  else if (!remote.stdout.trim()) add('repository', 'fail', `base branch ${config.repo.baseBranch} not found in ${config.repo.url}`);
  else add('repository', 'ok', `${config.repo.url} (${config.repo.baseBranch})`);

  if (config.runner.type === 'claude-cli') {
    const manifest = path.join(config.runner.pluginDir, '.claude-plugin', 'plugin.json');
    add('plugin', fs.existsSync(manifest) ? 'ok' : 'fail',
      fs.existsSync(manifest) ? config.runner.pluginDir : `no plugin at ${config.runner.pluginDir}`);
    const cli = await exec(resolveCommand(config.runner.command, env), ['--version'], { env, timeoutMs: 30000 });
    add('agent CLI', cli.code === 0 ? 'ok' : 'fail', cli.code === 0 ? cli.stdout.trim() : `cannot run ${config.runner.command}`);
    if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.CLAUDE_CODE_USE_BEDROCK || env.CLAUDE_CODE_USE_VERTEX) {
      add('model credential', 'ok', 'API credential found in the environment');
    } else if (env.CLAUDE_CODE_OAUTH_TOKEN) {
      add('model credential', 'warn', 'a personal subscription token is set; fine for a one-person trial, use an API key for a shared factory');
    } else {
      add('model credential', 'warn', 'no credential in the environment; the agent CLI must already be logged in on this machine');
    }
  } else {
    add('runner', 'warn', 'the fake runner is selected: no model is called and no real work is done');
  }

  if (config.board.type === 'github' || config.codeHost.type === 'github') {
    const gh = await exec('gh', ['auth', 'status'], { env, timeoutMs: 30000 });
    add('GitHub access', gh.code === 0 ? 'ok' : 'fail', gh.code === 0 ? 'gh is authenticated' : 'gh is not authenticated (set GH_TOKEN)');
  }
  if (config.board.type === 'gitlab' || config.codeHost.type === 'gitlab') {
    const tokenEnv = config.gitlab.tokenEnv;
    if (!env[tokenEnv]) {
      add('GitLab access', 'fail', `${tokenEnv} is not set`);
    } else if (opts.codeHost && typeof opts.codeHost.checkAccess === 'function') {
      let access;
      try { access = await opts.codeHost.checkAccess(); } catch (err) { access = { ok: false, user: '', detail: String(err && err.message) }; }
      add('GitLab access', access.ok ? 'ok' : 'fail', access.detail);
      if (access.ok && access.user && access.user !== config.board.botUser) {
        add('GitLab identity', 'fail', `the token belongs to ${access.user}, but board.botUser is ${config.board.botUser}; they must be the same account`);
      }
    } else {
      add('GitLab access', 'warn', `${tokenEnv} is set; access to the project was not checked`);
    }
  }
  if (opts.codeHost) {
    let protectedBase = null;
    try { protectedBase = await opts.codeHost.baseProtected(config.repo.baseBranch); } catch { protectedBase = null; }
    const single = config.trial && config.trial.singleAccount === true;
    if (single && protectedBase === true) add('branch protection', 'warn', `${config.repo.baseBranch} has a review rule. In a single-account trial the required number of approvals must be 0, because an account cannot approve its own pull request`);
    else if (single && protectedBase === false) add('branch protection', 'warn', `${config.repo.baseBranch} does not require a review before merge; acceptable only for a single-account trial`);
    else if (protectedBase === true) add('branch protection', 'ok', `${config.repo.baseBranch} requires review`);
    else if (protectedBase === false) add('branch protection', 'fail', `${config.repo.baseBranch} does not require a review before merge; protect it before running the factory`);
    else add('branch protection', 'warn', `could not confirm that ${config.repo.baseBranch} is protected on this code host`);
  }
  if (config.trial && config.trial.singleAccount === true) {
    add('trial mode', 'warn', 'single-account trial is ON: the factory and the approver are the same account, and code is approved by a comment. Trial use only');
  }
  if (config.notifier.type === 'slack' && !env[config.notifier.webhookEnv]) {
    add('chat alerts', 'warn', `${config.notifier.webhookEnv} is not set; alerts go to the console`);
  }
  if (config.release.level === 'production' && !(config.release.envPassthrough || []).length) {
    add('release', 'warn', 'release level is production but no release credentials are named in release.envPassthrough');
  }
  return { ok: !checks.some((c) => c.level === 'fail'), checks };
}

module.exports = { preflight };
