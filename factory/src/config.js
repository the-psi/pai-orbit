'use strict';
// Factory configuration: defaults, loading, validation.
//
// The two fixed gates (before merge, before release) are deliberately NOT settings. Nothing in
// this file can switch them off (REQ-11).

const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = Object.freeze({
  project: 'project',
  // Where the code lives and which branch tickets start from.
  repo: { url: '', baseBranch: 'main' },
  docsRoot: 'docs',
  // Which implementation of each swappable part to use.
  board: {
    type: 'local', // local | github
    readyLabel: 'factory-ready',
    ownedLabel: 'factory-owned',
    waitingLabel: 'factory-waiting',
    declinedLabel: 'factory-declined',
    // People add exactly ONE of two start labels:
    //   readyLabel   - a raw ticket: the factory grooms it first.
    //   groomedLabel - a ticket a person already groomed: the factory starts at design and uses
    //                  the existing requirements.md.
    // Names use a hyphen so they are valid as a label or tag on GitHub, GitLab, Jira and Azure
    // DevOps alike. Labels (tags) are the one marker every platform has; columns and workflow
    // states differ too much to rely on.
    groomedLabel: 'factory-groomed',
    botUser: 'orbit-factory',
    // Factory stage -> board column. Moves are best-effort.
    columns: { groom: 'In progress', design: 'In progress', pr: 'In review', done: 'Done' },
  },
  codeHost: { type: 'local', mergeMethod: 'squash' }, // local | github
  notifier: { type: 'console', webhookEnv: 'FACTORY_SLACK_WEBHOOK_URL' }, // console | slack
  runner: {
    type: 'claude-cli', // claude-cli | fake
    command: 'claude',
    model: '',
    pluginDir: '', // defaults to this repo's plugins/pai-orbit/dist/claude-code
    pluginName: 'pai-orbit',
    permissionMode: 'acceptEdits',
    // Model for the independent review. Different from `model` gives a real second opinion.
    reviewModel: '',
    // Wire orbit's bash-guard hook into every run: true | false | 'auto' (on except on Windows,
    // where the hook's bash + python3 are usually missing).
    bashGuard: 'auto',
    allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', 'Agent', 'Skill', 'TodoWrite'],
    disallowedTools: [
      'AskUserQuestion',
      'Bash(git push:*)',
      'Bash(gh pr merge:*)',
      'Bash(gh pr create:*)',
      'Bash(gh issue close:*)',
      'Bash(gh release create:*)',
      'WebFetch',
      'WebSearch',
    ],
    // Extra environment variable names the agent process may see (model access only).
    envPassthrough: [],
  },
  // `independentReview`: after the factory's own review, a second agent with a fresh start and
  // (ideally) a different model reviews the change and may not edit anything. Its verdict is
  // shown to the person who approves the merge. It never replaces that person.
  stages: { playwright: false, review: true, independentReview: false },
  // Optional gates. The merge and release gates are fixed and are not listed here.
  gates: { requirements: false, design: false },
  roles: {
    answer: ['@reporter'],
    requirementsApprover: [],
    designApprover: [],
    mergeApprover: [], // '*' = any reviewer the code host accepts, except the factory itself
    releaseApprover: [],
    escalation: [],
  },
  limits: {
    costPerTicketUsd: 50,
    costWarnShare: 0.7,
    costPerStageUsd: 15,
    costPerDayUsd: 200,
    activeHoursPerTicket: 8,
    hoursPerStage: 2,
    reworkCyclesPerGate: 3,
    testFixAttempts: 3,
    stageRetries: 1,
    // How many times the independent reviewer may send work back before it goes to a person anyway.
    independentReviewRounds: 2,
  },
  waiting: { reminderHours: 4, escalationHours: 8, maxParkedDays: 5 },
  calendar: { timeZone: 'UTC', days: [1, 2, 3, 4, 5], startHour: 9, endHour: 18 },
  concurrency: 2,
  suitability: {
    sensitiveLabels: ['security', 'auth', 'payments', 'billing', 'pii', 'migration', 'infrastructure'],
    sensitivePaths: [
      '**/auth/**', '**/authz/**', '**/session*/**', '**/secrets/**', '**/crypto/**',
      '**/payments/**', '**/billing/**', '**/migrations/**', '.github/**', '**/Dockerfile*',
      '**/terraform/**', '**/infra/**', '.claude/**',
    ],
    epicLabels: ['epic'],
    maxAcceptanceCriteria: 8,
    maxFiles: 15,
    maxChangedLines: 600,
    maxServices: 1,
  },
  release: {
    level: 'tag', // tag | staging | production
    // Environment variable names passed ONLY to the release stage, after approval (REQ-43).
    envPassthrough: [],
  },
  pollSeconds: 60,
  ui: {
    // The read-only status page. `orbit-factory ui` serves it; `orbit-factory run` also serves
    // it when `enabled` is true. It listens on this machine only unless a password is set in
    // FACTORY_UI_PASSWORD (then FACTORY_UI_HOST=0.0.0.0 makes it reachable from outside).
    enabled: false,
    host: '127.0.0.1',
    port: 8080,
  },
  trial: {
    // TRIAL USE ONLY. For a one-person trial where the factory has to run under that person's
    // own account. When true: comments from the factory's account count as the person's (the
    // factory recognises and skips the comments it wrote itself), and code is approved with an
    // `/approve` comment on the ticket instead of a pull request review, because a code host
    // does not let an account approve its own pull request. This removes the guarantee that
    // the approver is someone other than the factory. Never use it for shared or customer work.
    singleAccount: false,
  },
});

const RELEASE_LEVELS = ['tag', 'staging', 'production'];

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function merge(base, over) {
  const out = {};
  for (const key of Object.keys(base)) {
    const b = base[key];
    const o = over ? over[key] : undefined;
    if (isObject(b)) out[key] = merge(b, isObject(o) ? o : {});
    else out[key] = o === undefined ? (Array.isArray(b) ? b.slice() : b) : o;
  }
  // `columns` is a free-form map: keep keys the defaults do not know.
  if (over) {
    for (const key of Object.keys(over)) {
      if (!(key in base)) out[key] = over[key];
    }
  }
  return out;
}

/** Keys a config file is not allowed to contain, with the reason. */
const FORBIDDEN = {
  'gates.merge': 'the merge gate is fixed and cannot be configured',
  'gates.release': 'the release gate is fixed and cannot be configured',
};

/**
 * Validate a merged config. Returns a list of problems; empty means valid.
 * @param {object} cfg
 * @param {object} [raw] the user-supplied object before defaults were applied
 */
function validate(cfg, raw = {}) {
  const problems = [];
  const num = (p, v, min, max) => {
    if (typeof v !== 'number' || Number.isNaN(v) || v < min || (max !== undefined && v > max)) {
      problems.push(`${p} must be a number between ${min} and ${max === undefined ? 'unlimited' : max}`);
    }
  };
  for (const key of Object.keys(FORBIDDEN)) {
    const [a, b] = key.split('.');
    if (raw && raw[a] && Object.prototype.hasOwnProperty.call(raw[a], b)) {
      problems.push(`${key}: ${FORBIDDEN[key]}`);
    }
  }
  if (!cfg.repo.url) problems.push('repo.url is required');
  if (!cfg.repo.baseBranch) problems.push('repo.baseBranch is required');
  if (!['local', 'github'].includes(cfg.board.type)) problems.push('board.type must be local or github');
  if (!['local', 'github'].includes(cfg.codeHost.type)) problems.push('codeHost.type must be local or github');
  if (!['console', 'slack'].includes(cfg.notifier.type)) problems.push('notifier.type must be console or slack');
  if (!['claude-cli', 'fake'].includes(cfg.runner.type)) problems.push('runner.type must be claude-cli or fake');
  if (cfg.runner.permissionMode === 'bypassPermissions' && !process.env.FACTORY_SANDBOXED) {
    problems.push('runner.permissionMode bypassPermissions is allowed only inside the factory container (FACTORY_SANDBOXED=1)');
  }
  if (!RELEASE_LEVELS.includes(cfg.release.level)) problems.push(`release.level must be one of ${RELEASE_LEVELS.join(', ')}`);
  if (typeof cfg.trial.singleAccount !== 'boolean') problems.push('trial.singleAccount must be true or false');
  num('ui.port', cfg.ui.port, 1, 65535);
  num('concurrency', cfg.concurrency, 1, 5);
  num('limits.costPerTicketUsd', cfg.limits.costPerTicketUsd, 0.01);
  num('limits.costPerStageUsd', cfg.limits.costPerStageUsd, 0.01);
  num('limits.costPerDayUsd', cfg.limits.costPerDayUsd, 0.01);
  num('limits.costWarnShare', cfg.limits.costWarnShare, 0, 1);
  num('limits.activeHoursPerTicket', cfg.limits.activeHoursPerTicket, 0.01);
  num('limits.hoursPerStage', cfg.limits.hoursPerStage, 0.01);
  num('limits.reworkCyclesPerGate', cfg.limits.reworkCyclesPerGate, 0);
  num('limits.testFixAttempts', cfg.limits.testFixAttempts, 0);
  num('limits.stageRetries', cfg.limits.stageRetries, 0, 3);
  num('limits.independentReviewRounds', cfg.limits.independentReviewRounds, 0, 5);
  num('waiting.reminderHours', cfg.waiting.reminderHours, 0);
  num('waiting.escalationHours', cfg.waiting.escalationHours, 0);
  num('waiting.maxParkedDays', cfg.waiting.maxParkedDays, 0.01);
  num('calendar.startHour', cfg.calendar.startHour, 0, 23);
  num('calendar.endHour', cfg.calendar.endHour, 1, 24);
  if (cfg.calendar.endHour <= cfg.calendar.startHour) problems.push('calendar.endHour must be after calendar.startHour');
  if (!Array.isArray(cfg.calendar.days) || cfg.calendar.days.length === 0) problems.push('calendar.days must list at least one weekday (0=Sunday)');
  const roleList = (name, required) => {
    const v = cfg.roles[name];
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) problems.push(`roles.${name} must be a list of user names`);
    else if (required && v.length === 0) problems.push(`roles.${name} must name at least one person`);
  };
  roleList('answer', true);
  roleList('mergeApprover', true);
  roleList('releaseApprover', true);
  roleList('requirementsApprover', cfg.gates.requirements === true);
  roleList('designApprover', cfg.gates.design === true);
  roleList('escalation', false);
  const bot = cfg.board.botUser;
  for (const name of ['requirementsApprover', 'designApprover', 'mergeApprover', 'releaseApprover']) {
    if (Array.isArray(cfg.roles[name]) && cfg.roles[name].includes(bot) && cfg.trial.singleAccount !== true) {
      problems.push(`roles.${name} must not include the factory's own identity (${bot})`);
    }
  }
  if (Array.isArray(cfg.roles.releaseApprover) && cfg.roles.releaseApprover.includes('*')) {
    problems.push("roles.releaseApprover must name people; '*' is not allowed");
  }
  return problems;
}

/**
 * Load, default and validate a config file.
 * @param {string} file path to a JSON config
 * @returns {object} the merged config (frozen)
 */
function load(file) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Cannot read factory config ${file}: ${err.message}`);
  }
  return fromObject(raw, path.dirname(path.resolve(file)));
}

function fromObject(raw, baseDir = process.cwd()) {
  const cfg = merge(DEFAULTS, raw);
  if (!cfg.runner.pluginDir) {
    cfg.runner.pluginDir = path.resolve(__dirname, '..', '..', 'plugins', 'pai-orbit', 'dist', 'claude-code');
  } else if (!path.isAbsolute(cfg.runner.pluginDir)) {
    cfg.runner.pluginDir = path.resolve(baseDir, cfg.runner.pluginDir);
  }
  const problems = validate(cfg, raw);
  if (problems.length) {
    throw new Error(`Invalid factory config:\n- ${problems.join('\n- ')}`);
  }
  return cfg;
}

module.exports = { DEFAULTS, load, fromObject, validate, merge, RELEASE_LEVELS };
