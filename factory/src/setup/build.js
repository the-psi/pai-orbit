'use strict';
// Turns the answers from the setup page into the files a deployment needs: the config, the
// credentials file and the compose file, plus the steps to start. Pure functions: nothing here
// reads or writes the disk or the network, so the same answers always give the same files.

const { fromObject, MODEL_STAGES } = require('../config');
const { parseRepoUrl } = require('../gitlab-api');

const PLATFORMS = ['github', 'gitlab'];
const TARGETS = ['local', 'server', 'containerapps'];
const AI_KEYS = { api: 'ANTHROPIC_API_KEY', subscription: 'CLAUDE_CODE_OAUTH_TOKEN' };
const TOKEN_ENV = { github: 'GH_TOKEN', gitlab: 'GITLAB_TOKEN' };

const STAGE_LABELS = {
  groom: 'Groom (requirements)', design: 'Design', build: 'Build', test: 'Test',
  playwright: 'Browser tests', review: 'Review', verify: 'Second AI review', release: 'Release',
};

/** "a, b ,c" or ["a","b"] -> ['a','b','c'], without blanks or repeats. */
function names(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[,\n]/);
  return [...new Set(list.map((s) => String(s).trim().replace(/^@(?!reporter$)/, '')).filter(Boolean))];
}

function text(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

function number(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** The answers, with every field present and of the right type. */
function normalise(form = {}) {
  const f = form || {};
  const gates = f.gates || {};
  const stages = f.stages || {};
  const people = f.people || {};
  const limits = f.limits || {};
  const models = {};
  for (const key of ['default', ...MODEL_STAGES]) {
    const v = text((f.models || {})[key]);
    if (v) models[key] = v;
  }
  return {
    project: text(f.project),
    platform: PLATFORMS.includes(f.platform) ? f.platform : 'github',
    repoUrl: text(f.repoUrl),
    baseBranch: text(f.baseBranch) || 'main',
    botUser: text(f.botUser).replace(/^@/, ''),
    singleAccount: f.singleAccount === true,
    gates: { requirements: gates.requirements === true, design: gates.design === true },
    stages: {
      review: stages.review !== false,
      independentReview: stages.independentReview === true,
      playwright: stages.playwright === true,
    },
    people: {
      requirements: names(people.requirements),
      design: names(people.design),
      merge: names(people.merge),
      release: names(people.release),
      answer: names(people.answer),
      escalation: names(people.escalation),
    },
    models,
    limits: {
      costPerTicketUsd: number(limits.costPerTicketUsd, 50),
      costPerDayUsd: number(limits.costPerDayUsd, 200),
    },
    concurrency: number(f.concurrency, 2),
    slack: f.slack === true,
    target: TARGETS.includes(f.target) ? f.target : 'local',
    image: text(f.image),
    port: number(f.port, 8080),
    aiKey: f.aiKey === 'subscription' ? 'subscription' : 'api',
  };
}

/** The factory config for these answers. Only what differs from the defaults is written. */
function configObject(form) {
  const f = normalise(form);
  const cfg = {
    project: f.project,
    repo: { url: f.repoUrl, baseBranch: f.baseBranch },
    board: { type: f.platform, botUser: f.botUser },
    codeHost: { type: f.platform, mergeMethod: 'squash' },
    gates: { requirements: f.gates.requirements, design: f.gates.design },
    roles: {
      answer: ['@reporter', ...f.people.answer.filter((n) => n !== '@reporter')],
      requirementsApprover: f.gates.requirements ? f.people.requirements : [],
      designApprover: f.gates.design ? f.people.design : [],
      mergeApprover: f.people.merge,
      releaseApprover: f.people.release,
      escalation: f.people.escalation,
    },
    stages: { playwright: f.stages.playwright, review: f.stages.review, independentReview: f.stages.independentReview },
    runner: { models: f.models },
    limits: { costPerTicketUsd: f.limits.costPerTicketUsd, costPerDayUsd: f.limits.costPerDayUsd },
    concurrency: f.concurrency,
    notifier: { type: f.slack ? 'slack' : 'console' },
  };
  if (f.singleAccount) cfg.trial = { singleAccount: true };
  return cfg;
}

/**
 * Everything wrong with the answers, in words a person can act on. Each problem names the step
 * of the form it belongs to, so the page can take the person there.
 * @returns {{step: string, message: string}[]}
 */
function check(form) {
  const f = normalise(form);
  const problems = [];
  const add = (step, message) => problems.push({ step, message });

  if (!f.project) add('project', 'Give the project a name.');
  if (!f.repoUrl) {
    add('project', 'Enter the repository URL.');
  } else if (f.platform === 'github' && !/github\.com[:/][^/\s]+\/[^/\s]+?(\.git)?\/?$/.test(f.repoUrl)) {
    add('project', 'This does not look like a GitHub repository URL (https://github.com/owner/name).');
  } else if (f.platform === 'gitlab') {
    try { parseRepoUrl(f.repoUrl); } catch { add('project', 'This does not look like a GitLab repository URL (https://your-gitlab/group/name.git).'); }
  }
  if (!f.botUser) add('project', "Enter the factory's account name on the platform.");
  if (/\s/.test(f.botUser)) add('project', "The factory's account name cannot contain spaces.");

  if (f.gates.requirements && !f.people.requirements.length) add('people', 'Name at least one person who approves requirements, or switch that stop off.');
  if (f.gates.design && !f.people.design.length) add('people', 'Name at least one person who approves the design, or switch that stop off.');
  if (!f.people.merge.length) add('people', 'Name at least one person who approves the code.');
  if (!f.people.release.length) add('people', 'Name at least one person who approves the release.');
  if (f.people.release.includes('*')) add('people', 'The release approver must be named people.');
  if (!f.singleAccount && f.botUser) {
    for (const [label, list] of [['requirements', f.people.requirements], ['design', f.people.design], ['code', f.people.merge], ['release', f.people.release]]) {
      if (list.includes(f.botUser)) add('people', `The factory's own account (${f.botUser}) cannot be the ${label} approver. Name a person, or switch on the one-person trial.`);
    }
  }

  if (!(f.limits.costPerTicketUsd > 0)) add('limits', 'The cost limit per ticket must be more than 0.');
  if (!(f.limits.costPerDayUsd > 0)) add('limits', 'The cost limit per day must be more than 0.');
  if (f.limits.costPerDayUsd < f.limits.costPerTicketUsd) add('limits', 'The cost limit per day should not be lower than the limit per ticket.');
  if (!Number.isInteger(f.concurrency) || f.concurrency < 1 || f.concurrency > 5) add('limits', 'Tickets at once must be a whole number from 1 to 5.');

  if (!f.image) add('run', 'Enter the image name, for example ghcr.io/your-org/orbit-factory:0.1.0.');
  else if (/\s/.test(f.image)) add('run', 'The image name cannot contain spaces.');
  if (!Number.isInteger(f.port) || f.port < 1 || f.port > 65535) add('run', 'The status page port must be a number from 1 to 65535.');

  // Last, the factory's own validation, so the file cannot be one the factory would refuse.
  if (!problems.length) {
    try {
      fromObject(configObject(form));
    } catch (err) {
      for (const line of String(err.message).split('\n').filter((l) => l.startsWith('- '))) add('review', line.slice(2));
    }
  }
  return problems;
}

/** The people who sign in to the status page to decide: everyone named at a stop. */
function deciders(form) {
  const f = normalise(form);
  const all = [
    ...(f.gates.requirements ? f.people.requirements : []),
    ...(f.gates.design ? f.people.design : []),
    ...f.people.merge, ...f.people.release, ...f.people.answer,
  ];
  return [...new Set(all.filter((n) => n !== '*' && n !== '@reporter'))];
}

/** Credentials a deployment needs, by environment variable name. No values. */
function envNames(form) {
  const f = normalise(form);
  const list = [
    { name: AI_KEYS[f.aiKey], required: true, what: f.aiKey === 'api' ? 'Anthropic API key for the AI' : 'Claude Code subscription token (one-person trial only)' },
    { name: TOKEN_ENV[f.platform], required: true, what: f.platform === 'github'
      ? "Token for the factory's GitHub account: issues, pull requests and code of this repository"
      : "Token for the factory's GitLab account: api and write_repository scopes, Developer role or higher" },
    { name: 'FACTORY_UI_USERS', required: true, what: 'Who may decide on the status page, as name:password,name:password' },
    { name: 'FACTORY_UI_PASSWORD', required: false, what: 'One shared password to look at the status page without deciding' },
  ];
  if (f.slack) list.push({ name: 'FACTORY_SLACK_WEBHOOK_URL', required: true, what: 'Slack incoming webhook URL for alerts' });
  return list;
}

/** A value is safe in a .env file and in FACTORY_UI_USERS when it has none of these. */
function badSecretChars(value) {
  return /[\s"'`$#\\]/.test(String(value));
}

/**
 * Problems with the credentials a person typed. They are checked apart from the answers because
 * they are never kept: they exist only to be written into the .env file.
 */
function checkSecrets(form, secrets = {}) {
  const f = normalise(form);
  const problems = [];
  if (f.target === 'containerapps') return problems; // entered in Azure, not here
  const s = secrets || {};
  for (const [key, label] of [['ai', 'The AI key'], ['token', `The ${f.platform === 'github' ? 'GitHub' : 'GitLab'} token`], ['viewPassword', 'The view password'], ['slack', 'The Slack webhook URL']]) {
    const v = text(s[key]);
    if (v && /[\s"'`]/.test(v)) problems.push({ step: 'secrets', message: `${label} contains a space or a quote. Paste it again without them.` });
  }
  const users = s.users || {};
  const all = deciders(form);
  const withPassword = all.filter((n) => text(users[n]));
  // Either fill the sign-ins in later by hand (none typed), or give everyone one: a person left
  // out could not approve, and that would only show when a ticket is waiting for them.
  if (withPassword.length && withPassword.length < all.length) {
    const missing = all.filter((n) => !text(users[n]));
    problems.push({ step: 'secrets', message: `No status page password for ${missing.join(', ')}. Give everyone one, or leave them all empty and fill in the file later.` });
  }
  for (const name of all) {
    const pass = text(users[name]);
    if (!pass) continue;
    if (pass.length < 8) problems.push({ step: 'secrets', message: `The password for ${name} is shorter than 8 characters.` });
    if (badSecretChars(pass) || /[,:]/.test(pass)) problems.push({ step: 'secrets', message: `The password for ${name} cannot contain spaces, quotes, or any of , : $ # \\` });
    if (/[,:\s]/.test(name)) problems.push({ step: 'people', message: `The name "${name}" cannot be used to sign in because it contains a space, comma or colon.` });
  }
  return problems;
}

/** The .env file. A credential left empty is written as an empty line to fill in later. */
function envFile(form, secrets = {}) {
  const f = normalise(form);
  const s = secrets || {};
  const users = deciders(form).map((n) => [n, text((s.users || {})[n])]).filter(([, p]) => p);
  const lines = [
    `# Credentials for the Agentic Factory, project "${f.project}". Made by the setup page.`,
    '# Keep this file on the machine that runs the factory. Never commit it and never send it by chat or email.',
    '',
    '# The AI (given to the agent).',
    `${AI_KEYS[f.aiKey]}=${text(s.ai)}`,
    '',
    `# ${f.platform === 'github' ? 'GitHub' : 'GitLab'} (held by the factory, never given to the agent).`,
    `${TOKEN_ENV[f.platform]}=${text(s.token)}`,
    '',
    '# Status page. FACTORY_UI_USERS: who may approve, send back and answer (name:password,name:password).',
    `FACTORY_UI_USERS=${users.map(([n, p]) => `${n}:${p}`).join(',')}`,
    '# One shared password to look without deciding. Optional.',
    `FACTORY_UI_PASSWORD=${text(s.viewPassword)}`,
  ];
  if (f.slack) lines.push('', '# Slack alerts.', `FACTORY_SLACK_WEBHOOK_URL=${text(s.slack)}`);
  return `${lines.join('\n')}\n`;
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project';
}

/** The compose file for a laptop or a server. */
function composeFile(form) {
  const f = normalise(form);
  const local = f.target === 'local';
  const port = local ? `127.0.0.1:${f.port}:8080` : `${f.port}:8080`;
  return [
    `# Agentic Factory for "${f.project}". Made by the setup page.`,
    '#   docker compose up -d        start',
    '#   docker compose logs -f      watch',
    '#   docker compose down         stop (data is kept in the volume)',
    `name: factory-${slug(f.project)}`,
    'services:',
    '  factory:',
    `    image: ${f.image}`,
    '    restart: unless-stopped',
    '    env_file: .env',
    '    volumes:',
    '      - factory-data:/data',
    '      - ./factory.config.json:/config/factory.config.json:ro',
    '    # A clean stop lets stages in flight finish before the container exits.',
    '    stop_grace_period: 2m',
    '',
    '  # The status page. It gets only its own sign-in settings, not the tokens.',
    '  ui:',
    `    image: ${f.image}`,
    '    restart: unless-stopped',
    '    command: ["ui"]',
    '    environment:',
    '      FACTORY_UI_HOST: 0.0.0.0',
    '      FACTORY_UI_PASSWORD: ${FACTORY_UI_PASSWORD:-}',
    '      FACTORY_UI_USERS: ${FACTORY_UI_USERS:-}',
    '    ports:',
    local
      ? `      - "${port}"   # this computer only`
      : `      - "${port}"   # reachable from the network: allow only your office address in the firewall`,
    '    volumes:',
    '      - factory-data:/data',
    '      - ./factory.config.json:/config/factory.config.json:ro',
    '',
    'volumes:',
    '  factory-data:',
    '',
  ].join('\n');
}

/** What to do with the files, as numbered steps for the chosen place. */
function nextSteps(form) {
  const f = normalise(form);
  const labels = 'factory-ready, factory-groomed, factory-owned, factory-waiting, factory-declined';
  const platform = f.platform === 'github' ? 'GitHub' : 'GitLab';
  const start = [
    { text: 'Check the setup. Every line should say OK or WARN, none FAIL.', command: 'docker compose run --rm factory preflight' },
    { text: 'Start the factory and the status page.', command: 'docker compose up -d' },
  ];
  const use = [
    { text: `In the ${platform} project, create these labels: ${labels}.` },
    { text: 'Add the label factory-ready to a small ticket. The factory picks it up within a minute.' },
  ];
  if (f.target === 'local') {
    return [
      { text: 'Put the three files in one new folder on this computer. The credentials file downloads as factory.env: rename it to .env.' },
      { text: 'Open a terminal in that folder.' },
      ...start,
      { text: `Open the status page and sign in with a name and password from the .env file.`, command: `http://localhost:${f.port}` },
      ...use,
    ];
  }
  if (f.target === 'server') {
    return [
      { text: 'On the server, install Docker if it is not there yet.', command: 'curl -fsSL https://get.docker.com | sudo sh' },
      { text: 'Make a folder for the factory and go into it.', command: 'sudo mkdir -p /opt/factory && cd /opt/factory' },
      { text: 'Copy factory.config.json and docker-compose.yml into it. Create a file named .env there by hand and paste the content of the credentials file in; do not send that file by chat or email.' },
      { text: 'If the image is private, sign in to the registry once.', command: 'docker login ghcr.io' },
      ...start,
      { text: `In the server's firewall, open port ${f.port} only for your office address. The page is plain HTTP, so do not open it to everyone.` },
      { text: 'Open the status page and sign in with a name and password from the .env file.', command: `http://<server address>:${f.port}` },
      ...use,
    ];
  }
  return [
    { text: 'In Azure Key Vault, create one secret for each credential listed under "Credentials to create". The values never go into a file.' },
    { text: 'Create an Azure Files share with two folders: config and data. Upload factory.config.json into config.' },
    { text: `Create a container app from the image ${f.image}, set to always keep one copy running. Mount config at /config and data at /data.` },
    { text: 'Give the container app a managed identity that may read the Key Vault. Add each secret as a Key Vault reference, and one environment variable per secret with the same name.' },
    { text: `Add a second container to the same app with the command "ui" and the environment variable FACTORY_UI_HOST=0.0.0.0. Turn on ingress to port 8080. Azure gives it an HTTPS address.` },
    ...use,
  ];
}

/**
 * The files and the steps for these answers.
 * @returns {{files: {name: string, content: string, secret: boolean, what: string}[],
 *            steps: {text: string, command?: string}[], env: object[], deciders: string[]}}
 */
function buildAll(form, secrets = {}) {
  const f = normalise(form);
  const files = [{
    name: 'factory.config.json',
    content: `${JSON.stringify(configObject(form), null, 2)}\n`,
    secret: false,
    what: 'The settings. No secrets, safe to keep in a shared place.',
  }];
  if (f.target !== 'containerapps') {
    files.push({ name: '.env', content: envFile(form, secrets), secret: true, what: 'The credentials. Keep it only on the machine that runs the factory.' });
    files.push({ name: 'docker-compose.yml', content: composeFile(form), secret: false, what: 'Tells Docker which image to run and which files to give it.' });
  }
  return { files, steps: nextSteps(form), env: envNames(form), deciders: deciders(form) };
}

/** What the page needs to draw the form. */
function options() {
  return {
    platforms: PLATFORMS,
    targets: TARGETS,
    stages: MODEL_STAGES.map((name) => ({ name, label: STAGE_LABELS[name] || name })),
    modelHints: ['haiku', 'sonnet', 'opus'],
    defaults: normalise({ gates: { requirements: true, design: true }, stages: { independentReview: true } }),
  };
}

module.exports = { normalise, configObject, check, checkSecrets, envFile, envNames, composeFile, nextSteps, buildAll, options, deciders, names, PLATFORMS, TARGETS };
