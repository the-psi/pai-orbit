'use strict';
// Interactive Q&A flow for `init copilot` (and `update copilot`).
//
// Covers all 11 questions from core/modes/setup.md Step 2, plus the Copilot-
// specific husky / pre-commit installer follow-ups. Falls back to defaults
// (from Step 1 discovery + flags) when --yes is set or the `prompts` npm
// package is unavailable (e.g. running from a local checkout without
// `npm install`).
//
// Every question also has a --flag override so CI / scripted flows can drive
// the CLI without interactive input.

const fs = require('node:fs');
const path = require('node:path');
const { discover, summarise } = require('./discover');
const { discoverBoard } = require('./board-discovery');

function loadPromptsLib() {
  try { return require('prompts'); } catch { return null; }
}

// Cancel handler shared across every prompts() call.
function onCancel() {
  process.stderr.write('pai-orbit: interview cancelled — no files written.\n');
  process.exit(130);
}

// ---------------------------------------------------------------------------
// Defaults — used by --yes / --no-interactive mode and as fallback initial
// values inside interactive prompts. Derived from Step 1 discovery so the
// user's answers start from what's already true in the repo.
// ---------------------------------------------------------------------------

function serviceStackGuess(disc) {
  // Map discovered frameworks/languages to a stack label that lines up with
  // core/templates/agents/*.md filenames.
  if (disc.frameworks.includes('nextjs')) return 'nextjs';
  if (disc.frameworks.includes('fastapi')) return 'fastapi';
  if (disc.frameworks.includes('django')) return 'django';
  if (disc.frameworks.includes('express')) return 'express';
  if (disc.frameworks.includes('nestjs')) return 'express';
  if (disc.frameworks.includes('react') || disc.frameworks.includes('vite')) return 'react-vite';
  if (disc.languages.includes('python')) return 'fastapi';
  if (disc.languages.includes('typescript') || disc.languages.includes('javascript')) return 'express';
  return 'generic';
}

function servicesFrom(disc) {
  if (disc.services.length > 0) {
    return disc.services.map((name) => ({ name, path: name, stack: serviceStackGuess(disc) }));
  }
  return [{ name: 'app', path: '.', stack: serviceStackGuess(disc) }];
}

function detectPrecommitInstallerDefault(cwd) {
  if (fs.existsSync(path.join(cwd, '.husky'))) return 'husky';
  if (fs.existsSync(path.join(cwd, '.pre-commit-config.yaml'))) return 'pre-commit';
  try {
    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if ((pkg.devDependencies && pkg.devDependencies.husky) || (pkg.dependencies && pkg.dependencies.husky)) {
        return 'husky';
      }
    }
  } catch { /* ignore */ }
  return 'husky';
}

function defaultsFor(ctx, disc, lifecycle) {
  const services = servicesFrom(disc);
  const huskyDefault = fs.existsSync(path.join(ctx.cwd, '.git'));
  return {
    is_monorepo: disc.looks_like_monorepo,
    services,
    board: {
      type: ctx.flags.board || disc.task_platform_hint || 'none',
      url: '',
      columns: [],
    },
    branch: {
      model: ctx.flags.branch || 'github-flow',
      main: 'main',
      protected: 'main',
      pr_merge_strategy: 'squash merge',
    },
    deploy: {
      provider: disc.deployment_hints[0] || 'other',
      services: services.map((s) => ({ name: s.name, target: '', image: '', deploy_cmd: '', health_url: '' })),
      auth_check_cmd: '',
    },
    docs: {
      home: 'local',
      path: 'docs/',
      repo_path: '',
      confluence_space: '',
      notion_workspace: '',
    },
    system_docs: {
      has_multi_repo: false,
      repo: '',
      path: './docs',
    },
    architecture: {
      has_answered: false,
      services_description: '',
      constraints: [],
    },
    team: [],
    mcp: { git: 'none', board: 'none', docs: 'none' },
    install_husky: ctx.flags['install-husky'] === true ? true : huskyDefault,
    precommit_installer: detectPrecommitInstallerDefault(ctx.cwd),
    lifecycle,
    _discovery: disc,
  };
}

// ---------------------------------------------------------------------------
// Individual question modules — each returns the field it owns. Splitting
// keeps the interview readable and lets --yes short-circuit each in isolation.
// ---------------------------------------------------------------------------

async function askRepoStructure(promptsLib, disc) {
  const answers = await promptsLib([
    {
      type: 'confirm',
      name: 'is_monorepo',
      message: `Is this a monorepo (multiple services in one repo)?${disc.looks_like_monorepo ? ' (discovery says yes)' : ''}`,
      initial: disc.looks_like_monorepo,
    },
  ], { onCancel });

  let services;
  if (answers.is_monorepo) {
    const inferred = disc.services.length ? disc.services.join(',') : 'api,frontend';
    const svcAnswer = await promptsLib([
      {
        type: 'text',
        name: 'services_csv',
        message: 'List service directory names, comma-separated',
        initial: inferred,
      },
    ], { onCancel });
    services = (svcAnswer.services_csv || '').split(',').map((s) => s.trim()).filter(Boolean).map((name) => ({
      name,
      path: name,
      stack: serviceStackGuess(disc),
    }));
  } else {
    services = [{ name: 'app', path: '.', stack: serviceStackGuess(disc) }];
  }
  return { is_monorepo: answers.is_monorepo, services };
}

async function askTechStack(promptsLib, services) {
  const stacks = ['fastapi', 'django', 'express', 'nextjs', 'react-vite', 'infra', 'generic'];
  const refined = [];
  for (const svc of services) {
    const ans = await promptsLib([
      {
        type: 'select',
        name: 'stack',
        message: `Tech stack for service "${svc.name}"`,
        choices: stacks.map((s) => ({ title: s, value: s })),
        initial: Math.max(0, stacks.indexOf(svc.stack)),
      },
    ], { onCancel });
    refined.push({ ...svc, stack: ans.stack || svc.stack });
  }
  return refined;
}

async function askBoard(promptsLib, disc, ctx) {
  const initialTypeIdx = ['gitlab', 'github', 'linear', 'jira', 'notion', 'none']
    .indexOf(ctx.flags.board || disc.task_platform_hint || 'none');

  const typeAnswer = await promptsLib([
    {
      type: 'select',
      name: 'type',
      message: 'Task-management platform',
      choices: [
        { title: 'GitLab', value: 'gitlab' },
        { title: 'GitHub Issues / Projects v2', value: 'github' },
        { title: 'Linear', value: 'linear' },
        { title: 'Jira', value: 'jira' },
        { title: 'Notion', value: 'notion' },
        { title: 'None', value: 'none' },
      ],
      initial: initialTypeIdx >= 0 ? initialTypeIdx : 5,
    },
  ], { onCancel });

  let url = '';
  if (typeAnswer.type !== 'none') {
    const urlAnswer = await promptsLib([
      {
        type: 'text',
        name: 'url',
        message: `Board URL (${typeAnswer.type})`,
        initial: '',
      },
    ], { onCancel });
    url = urlAnswer.url || '';
  }

  // Step 2b — live board column discovery.
  let columns = [];
  if (url) {
    process.stdout.write(`pai-orbit: querying ${typeAnswer.type} for live columns...\n`);
    const result = discoverBoard(typeAnswer.type, url);
    if (result.available && result.mode === 'boards' && result.boards.length) {
      // GitLab boards — pick one or more, merge lists.
      const boardChoice = await promptsLib([
        {
          type: 'multiselect',
          name: 'ids',
          message: 'Which board(s) define your team\'s workflow? (space to toggle)',
          choices: result.boards.map((b) => ({
            title: `${b.name} — ${b.lists.length} list(s)`,
            value: b.id,
            selected: result.boards.length === 1,
          })),
          min: 1,
        },
      ], { onCancel });
      const picked = result.boards.filter((b) => (boardChoice.ids || []).includes(b.id));
      const merged = [];
      const seen = new Set();
      for (const b of picked) {
        for (const l of b.lists) {
          if (!seen.has(l.label)) {
            seen.add(l.label);
            merged.push(l.label);
          }
        }
      }
      columns = merged;
      process.stdout.write(`  discovered ${columns.length} column(s): ${columns.join(', ')}\n`);
    } else if (result.available && result.mode === 'labels') {
      // GitLab labels fall-back.
      const pick = await promptsLib([
        {
          type: 'text',
          name: 'csv',
          message: 'No boards found. Enter column labels in left→right order (comma-separated)',
          initial: result.labels.slice(0, 6).map((l) => l.name).join(', '),
        },
      ], { onCancel });
      columns = (pick.csv || '').split(',').map((s) => s.trim()).filter(Boolean);
    } else if (result.available && result.columns) {
      // GitHub Projects v2.
      columns = result.columns;
      process.stdout.write(`  discovered ${columns.length} column(s): ${columns.join(', ')}\n`);
    } else if (result.available && result.raw) {
      // Linear — display raw + ask for manual list.
      process.stdout.write(`${result.raw}\n`);
      const pick = await promptsLib([
        {
          type: 'text',
          name: 'csv',
          message: 'Confirm workflow states in order (comma-separated)',
        },
      ], { onCancel });
      columns = (pick.csv || '').split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      // Fall-back — auto-discovery unavailable, prompt manually.
      if (result.reason) process.stdout.write(`  note: ${result.reason}\n`);
      const pick = await promptsLib([
        {
          type: 'text',
          name: 'csv',
          message: 'Enter board column names in left→right order (comma-separated)',
        },
      ], { onCancel });
      columns = (pick.csv || '').split(',').map((s) => s.trim()).filter(Boolean);
    }
  }

  return { type: typeAnswer.type, url, columns };
}

async function askBranch(promptsLib, ctx) {
  const initialIdx = ['github-flow', 'gitflow', 'trunk'].indexOf(ctx.flags.branch || 'github-flow');
  const ans = await promptsLib([
    {
      type: 'select',
      name: 'model',
      message: 'Branching model',
      choices: [
        { title: 'GitHub Flow (feature branches → main)', value: 'github-flow' },
        { title: 'GitFlow (develop + release branches)', value: 'gitflow' },
        { title: 'Trunk-based (direct to main with flags)', value: 'trunk' },
      ],
      initial: initialIdx >= 0 ? initialIdx : 0,
    },
    {
      type: 'text',
      name: 'main',
      message: 'Main branch name',
      initial: 'main',
    },
    {
      type: 'select',
      name: 'pr_merge_strategy',
      message: 'PR merge strategy',
      choices: [
        { title: 'squash merge', value: 'squash merge' },
        { title: 'merge commit', value: 'merge commit' },
        { title: 'rebase', value: 'rebase' },
      ],
      initial: 0,
    },
    {
      type: 'text',
      name: 'protected',
      message: 'Protected branches (comma-separated)',
      initial: 'main',
    },
  ], { onCancel });
  return {
    model: ans.model,
    main: ans.main || 'main',
    pr_merge_strategy: ans.pr_merge_strategy || 'squash merge',
    protected: ans.protected || 'main',
  };
}

async function askDeploy(promptsLib, disc, services) {
  const providerAns = await promptsLib([
    {
      type: 'select',
      name: 'provider',
      message: 'Cloud provider',
      choices: [
        { title: 'GCP', value: 'GCP' },
        { title: 'AWS', value: 'AWS' },
        { title: 'Azure', value: 'Azure' },
        { title: 'Vercel', value: 'Vercel' },
        { title: 'Railway', value: 'Railway' },
        { title: 'fly.io', value: 'fly.io' },
        { title: 'Bare VPS', value: 'bare VPS' },
        { title: 'Other', value: 'other' },
      ],
      initial: 7,
    },
    {
      type: 'text',
      name: 'auth_check_cmd',
      message: 'Auth check command (e.g. `gcloud auth list`, `vercel whoami`) — blank if none',
      initial: '',
    },
  ], { onCancel });

  // Per-service deploy target — brief; user can refine in the config file.
  const svcDeploys = [];
  for (const svc of services) {
    const svcAns = await promptsLib([
      {
        type: 'text',
        name: 'target',
        message: `Deploy target for "${svc.name}" (e.g. Cloud Run, Vercel, ECS) — blank to skip`,
      },
      {
        type: 'text',
        name: 'deploy_cmd',
        message: `Deploy command for "${svc.name}" — blank to skip`,
      },
      {
        type: 'text',
        name: 'health_url',
        message: `Health check URL for "${svc.name}" — blank to skip`,
      },
    ], { onCancel });
    svcDeploys.push({
      name: svc.name,
      target: svcAns.target || '',
      image: '',
      deploy_cmd: svcAns.deploy_cmd || '',
      health_url: svcAns.health_url || '',
    });
  }

  return {
    provider: providerAns.provider || 'other',
    auth_check_cmd: providerAns.auth_check_cmd || '',
    services: svcDeploys,
  };
}

async function askDocs(promptsLib) {
  const ans = await promptsLib([
    {
      type: 'select',
      name: 'home',
      message: 'Docs home',
      choices: [
        { title: 'local (in-repo docs/)', value: 'local' },
        { title: 'dedicated repo', value: 'dedicated-repo' },
        { title: 'Confluence', value: 'confluence' },
        { title: 'Notion', value: 'notion' },
      ],
      initial: 0,
    },
  ], { onCancel });

  if (ans.home === 'local') {
    return { home: 'local', path: 'docs/' };
  }
  if (ans.home === 'dedicated-repo') {
    const p = await promptsLib([{ type: 'text', name: 'repo_path', message: 'Path to dedicated docs repo (relative or absolute)', initial: '../docs' }], { onCancel });
    return { home: 'dedicated-repo', repo_path: p.repo_path || '../docs' };
  }
  if (ans.home === 'confluence') {
    const p = await promptsLib([{ type: 'text', name: 'confluence_space', message: 'Confluence space URL' }], { onCancel });
    return { home: 'confluence', confluence_space: p.confluence_space || '' };
  }
  if (ans.home === 'notion') {
    const p = await promptsLib([{ type: 'text', name: 'notion_workspace', message: 'Notion workspace URL / name' }], { onCancel });
    return { home: 'notion', notion_workspace: p.notion_workspace || '' };
  }
  return { home: 'local', path: 'docs/' };
}

async function askSystemDocs(promptsLib) {
  const yn = await promptsLib([
    {
      type: 'confirm',
      name: 'has_multi_repo',
      message: 'Does this service repo belong to a larger multi-repo project with a separate system-docs repo?',
      initial: false,
    },
  ], { onCancel });
  if (!yn.has_multi_repo) {
    return { has_multi_repo: false, repo: '', path: './docs' };
  }
  const details = await promptsLib([
    { type: 'text', name: 'repo', message: 'system_docs_repo (relative path or git URL)', initial: '' },
    { type: 'text', name: 'path', message: 'system_docs_path (path within that repo)', initial: './docs' },
  ], { onCancel });
  return { has_multi_repo: true, repo: details.repo || '', path: details.path || './docs' };
}

async function askArchitecture(promptsLib) {
  const optIn = await promptsLib([
    {
      type: 'confirm',
      name: 'has_answered',
      message: 'Answer architecture questions now? (Optional — can be done later with `/arch init`)',
      initial: false,
    },
  ], { onCancel });
  if (!optIn.has_answered) {
    return { has_answered: false, services_description: '', constraints: [] };
  }
  const details = await promptsLib([
    {
      type: 'text',
      name: 'services_description',
      message: 'Briefly describe services + how they communicate (free text — will land in system.md)',
      initial: '',
    },
    {
      type: 'text',
      name: 'constraints_csv',
      message: 'Hard constraints — things that must NEVER happen (comma-separated; e.g. "services must not share DBs, frontend talks only to api-gateway")',
      initial: '',
    },
  ], { onCancel });
  return {
    has_answered: true,
    services_description: details.services_description || '',
    constraints: (details.constraints_csv || '').split(',').map((s) => s.trim()).filter(Boolean),
  };
}

async function askTeam(promptsLib) {
  const initial = await promptsLib([
    {
      type: 'number',
      name: 'count',
      message: 'How many team members to enter now? (0 = skip; edit team.md later)',
      initial: 0,
    },
  ], { onCancel });
  const n = Number(initial.count) || 0;
  if (n === 0) return [];
  const members = [];
  for (let i = 1; i <= n; i += 1) {
    const m = await promptsLib([
      { type: 'text', name: 'name', message: `Member ${i} name` },
      { type: 'text', name: 'role', message: `Member ${i} role (e.g. Engineering lead, Product / domain expert, Ops)` },
      { type: 'text', name: 'github', message: `Member ${i} GitHub handle (blank if none)` },
      { type: 'text', name: 'linear', message: `Member ${i} Linear ID (blank if none)` },
      { type: 'text', name: 'jira', message: `Member ${i} Jira user ID (blank if none)` },
      { type: 'text', name: 'notes', message: `Member ${i} notes (blank if none)` },
    ], { onCancel });
    if (m.name) {
      members.push({
        name: m.name,
        role: m.role || '',
        github: m.github || '',
        linear: m.linear || '',
        jira: m.jira || '',
        notes: m.notes || '',
      });
    }
  }
  return members;
}

async function askMCP(promptsLib) {
  const ans = await promptsLib([
    {
      type: 'select',
      name: 'git',
      message: 'MCP server — Git',
      choices: [
        { title: 'none', value: 'none' },
        { title: 'github', value: 'github' },
        { title: 'gitlab', value: 'gitlab' },
      ],
      initial: 0,
    },
    {
      type: 'select',
      name: 'board',
      message: 'MCP server — Board',
      choices: [
        { title: 'none', value: 'none' },
        { title: 'github', value: 'github' },
        { title: 'linear', value: 'linear' },
        { title: 'jira', value: 'jira' },
      ],
      initial: 0,
    },
    {
      type: 'select',
      name: 'docs',
      message: 'MCP server — Docs',
      choices: [
        { title: 'none', value: 'none' },
        { title: 'confluence', value: 'confluence' },
        { title: 'notion', value: 'notion' },
      ],
      initial: 0,
    },
  ], { onCancel });
  return { git: ans.git || 'none', board: ans.board || 'none', docs: ans.docs || 'none' };
}

async function askCopilotExtras(promptsLib, ctx) {
  const huskyDetected = fs.existsSync(path.join(ctx.cwd, '.git'));
  const precommitInitialIdx = ['husky', 'pre-commit', 'both', 'neither'].indexOf(detectPrecommitInstallerDefault(ctx.cwd));
  const ans = await promptsLib([
    {
      type: 'confirm',
      name: 'install_husky',
      message: 'Install the optional .husky/pre-commit hook (commit-time lint + weak secret tripwire; does NOT block `git push --force` or `git add -A`)?',
      initial: huskyDetected,
    },
    {
      type: 'select',
      name: 'precommit_installer',
      message: 'Pre-commit installer (D29)',
      choices: [
        { title: 'husky (JS-ecosystem)', value: 'husky' },
        { title: 'pre-commit framework (Python; cross-tool)', value: 'pre-commit' },
        { title: 'both', value: 'both' },
        { title: 'neither (templates only — opt in later)', value: 'neither' },
      ],
      initial: precommitInitialIdx >= 0 ? precommitInitialIdx : 0,
    },
  ], { onCancel });
  return { install_husky: !!ans.install_husky, precommit_installer: ans.precommit_installer || 'husky' };
}

// ---------------------------------------------------------------------------
// Top-level entry
// ---------------------------------------------------------------------------

async function runInterview(ctx, lifecycle) {
  const disc = discover(ctx.cwd);
  process.stdout.write('\n' + summarise(disc) + '\n\n');

  if (lifecycle === 're-run' && !ctx.flags['re-interview']) {
    return null; // caller falls back to prior settings.json
  }
  if (ctx.flags.yes) {
    return { ...defaultsFor(ctx, disc, lifecycle), _discovery: disc };
  }

  const promptsLib = loadPromptsLib();
  if (!promptsLib) {
    process.stderr.write(
      "pai-orbit: 'prompts' package not available — using --yes defaults. Re-run via `npx github:the-psi/pai-orbit init copilot` so npx fetches dependencies.\n",
    );
    return { ...defaultsFor(ctx, disc, lifecycle), _discovery: disc };
  }

  const repoStructure = await askRepoStructure(promptsLib, disc);
  const services = await askTechStack(promptsLib, repoStructure.services);
  const board = await askBoard(promptsLib, disc, ctx);
  const branch = await askBranch(promptsLib, ctx);
  const deploy = await askDeploy(promptsLib, disc, services);
  const docs = await askDocs(promptsLib);
  const systemDocs = await askSystemDocs(promptsLib);
  const architecture = await askArchitecture(promptsLib);
  const team = await askTeam(promptsLib);
  const mcp = await askMCP(promptsLib);
  const copilotExtras = await askCopilotExtras(promptsLib, ctx);

  return {
    is_monorepo: repoStructure.is_monorepo,
    services,
    board,
    branch,
    deploy,
    docs,
    system_docs: systemDocs,
    architecture,
    team,
    mcp,
    install_husky: copilotExtras.install_husky,
    precommit_installer: copilotExtras.precommit_installer,
    lifecycle,
    _discovery: disc,
  };
}

module.exports = {
  runInterview,
  detectLanguages: (cwd) => discover(cwd).languages,
  detectPrecommitInstallerDefault,
};
