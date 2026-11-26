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

  const remote = await exec('git', ['ls-remote', '--heads', config.repo.url, config.repo.baseBranch], { env, timeoutMs: 30000 });
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
  if (opts.codeHost) {
    let protectedBase = null;
    try { protectedBase = await opts.codeHost.baseProtected(config.repo.baseBranch); } catch { protectedBase = null; }
    if (protectedBase === true) add('branch protection', 'ok', `${config.repo.baseBranch} requires review`);
    else if (protectedBase === false) add('branch protection', 'fail', `${config.repo.baseBranch} does not require a review before merge; protect it before running the factory`);
    else add('branch protection', 'warn', `could not confirm that ${config.repo.baseBranch} is protected on this code host`);
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
