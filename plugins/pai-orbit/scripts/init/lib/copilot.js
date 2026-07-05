'use strict';
// `pai-orbit init|update|migrate copilot` — Copilot-target install logic.
//
// Full parity with `core/modes/setup.md` Step 2 questions and Step 3 output
// (Copilot target block). Consumes the rich answers returned by
// lib/prompts.js and drives every render.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const promptsModule = require('./prompts');
const render = require('./render');

const PAI_ORBIT_BAK_PREFIX = '.github/pai-orbit.bak';

// ---------------------------------------------------------------------------
// Lifecycle detection
// ---------------------------------------------------------------------------

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function detectLifecycle(cwd, ctx) {
  if (ctx.subcommand === 'migrate') return 'migration';
  const newConfig = fs.existsSync(path.join(cwd, '.copilot', 'pai-orbit-config.md'));
  if (newConfig) return 're-run';
  const oldConfig =
    fs.existsSync(path.join(cwd, '.github', 'pai-orbit', 'pai-orbit-config.md')) ||
    fs.existsSync(path.join(cwd, '.github', 'pai-orbit', 'team.md'));
  if (oldConfig) return 'migration';
  return 'first-run';
}

function logLifecycleBanner(lifecycle, ctx) {
  const verb = ctx.subcommand === 'update' ? 'update' : ctx.subcommand;
  const lines = {
    'first-run': `pai-orbit ${verb}: first-run install for target=copilot.`,
    're-run': `pai-orbit ${verb}: existing pai-orbit install detected. Refreshing pai-orbit-owned files; preserving your config.`,
    migration: `pai-orbit ${verb}: old .github/pai-orbit/ layout detected. Will migrate to .copilot/ after confirmation.`,
  };
  process.stdout.write(`${lines[lifecycle]}\n`);
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Migration (D18, D23, D25)
// ---------------------------------------------------------------------------

function performMigration(cwd, lifecycle, ctx) {
  if (lifecycle !== 'migration') return;
  const oldDir = path.join(cwd, '.github', 'pai-orbit');
  if (!fs.existsSync(oldDir)) {
    process.stderr.write(`pai-orbit migrate copilot: old layout .github/pai-orbit/ not found in ${cwd}. Nothing to migrate.\n`);
    process.exit(2);
  }

  const stamp = timestamp();
  const bakDir = path.join(cwd, '.github', 'pai-orbit.bak', stamp);
  const newDir = path.join(cwd, '.copilot');

  process.stdout.write('pai-orbit migrate: dry-run plan:\n');
  process.stdout.write(`  - back up ${path.relative(cwd, oldDir)} → ${path.relative(cwd, bakDir)}\n`);
  process.stdout.write(`  - move config + team files into ${path.relative(cwd, newDir)}/\n`);
  process.stdout.write(`  - append ${PAI_ORBIT_BAK_PREFIX}/ to .gitignore (D23)\n`);

  if (!ctx.flags.yes) {
    process.stdout.write(
      'pai-orbit migrate: re-run with `--yes` to apply this migration plan non-interactively, ' +
        'or run `pai-orbit init copilot` (the interactive flow performs the same migration with a y/N prompt).\n',
    );
    process.exit(0);
  }

  fs.mkdirSync(path.dirname(bakDir), { recursive: true });
  fs.cpSync(oldDir, bakDir, { recursive: true });
  fs.mkdirSync(newDir, { recursive: true });
  for (const name of ['pai-orbit-config.md', 'team.md']) {
    const from = path.join(oldDir, name);
    const to = path.join(newDir, name);
    if (fs.existsSync(from) && !fs.existsSync(to)) {
      fs.copyFileSync(from, to);
    }
  }
  fs.rmSync(oldDir, { recursive: true, force: true });
  render.ensureLineInFile(path.join(cwd, '.gitignore'), `${PAI_ORBIT_BAK_PREFIX}/`);

  process.stdout.write(`pai-orbit migrate: backup at ${path.relative(cwd, bakDir)}. Remove it once you've confirmed the new install.\n`);
}

// ---------------------------------------------------------------------------
// Dist copy (Copilot adapter output)
// ---------------------------------------------------------------------------

function copyCopilotDist(cwd, distDir) {
  const githubSrc = path.join(distDir, '.github');
  const githubDest = path.join(cwd, '.github');
  fs.mkdirSync(githubDest, { recursive: true });

  const instrSrc = path.join(githubSrc, 'copilot-instructions.md');
  if (fs.existsSync(instrSrc)) {
    render.copyFile(instrSrc, path.join(githubDest, 'copilot-instructions.md'));
  }
  if (fs.existsSync(path.join(githubSrc, 'prompts'))) {
    render.copyDir(path.join(githubSrc, 'prompts'), path.join(githubDest, 'prompts'));
  }
  if (fs.existsSync(path.join(githubSrc, 'instructions'))) {
    render.copyDir(path.join(githubSrc, 'instructions'), path.join(githubDest, 'instructions'));
  }

  const huskySrc = path.join(distDir, '.husky', 'pre-commit.template');
  if (fs.existsSync(huskySrc)) {
    fs.mkdirSync(path.join(cwd, '.husky'), { recursive: true });
    render.copyFile(huskySrc, path.join(cwd, '.husky', 'pre-commit.template'));
  }

  const preCommitSrc = path.join(distDir, '.pre-commit-config.yaml.template');
  if (fs.existsSync(preCommitSrc)) {
    render.copyFile(preCommitSrc, path.join(cwd, '.pre-commit-config.yaml.template'));
  }
}

// ---------------------------------------------------------------------------
// Husky / pre-commit-framework activation
// ---------------------------------------------------------------------------

function activateHusky(cwd, opts) {
  const tpl = path.join(cwd, '.husky', 'pre-commit.template');
  const active = path.join(cwd, '.husky', 'pre-commit');
  if (!fs.existsSync(tpl)) return { activated: false, reason: 'template missing' };
  if (fs.existsSync(active) && !opts.reinstall) {
    return { activated: false, reason: 'already active — pass --reinstall-husky to overwrite' };
  }
  fs.copyFileSync(tpl, active);
  try { fs.chmodSync(active, 0o755); } catch { /* Windows: ignored */ }
  try {
    execFileSync('git', ['update-index', '--add', '--chmod=+x', '.husky/pre-commit'], {
      cwd, stdio: 'ignore',
    });
  } catch { /* D21 note: user may need to `git add` first */ }
  return { activated: true };
}

function activatePrecommitFramework(cwd, opts) {
  const tpl = path.join(cwd, '.pre-commit-config.yaml.template');
  const active = path.join(cwd, '.pre-commit-config.yaml');
  if (!fs.existsSync(tpl)) return { activated: false, reason: 'template missing' };
  if (fs.existsSync(active) && !opts.reinstall) {
    return { activated: false, reason: 'already present — pass --reinstall-precommit-framework to overwrite' };
  }
  fs.copyFileSync(tpl, active);
  return { activated: true };
}

// ---------------------------------------------------------------------------
// Rich rendering — pai-orbit-config.md
// ---------------------------------------------------------------------------

// Board-type keys used inside the config template's block-fence comments.
const BOARD_BLOCKS = ['GITHUB ISSUES', 'GITHUB PROJECTS V2', 'LINEAR', 'JIRA', 'GITLAB'];
const DOCS_BLOCKS = ['LOCAL', 'DEDICATED REPO', 'CONFLUENCE', 'NOTION'];
const GITFLOW_BLOCKS = ['GITFLOW ONLY'];

function boardKindKey(boardType) {
  switch (boardType) {
    case 'github':  return 'GITHUB PROJECTS V2'; // most PSI projects use v2
    case 'gitlab':  return 'GITLAB';
    case 'linear':  return 'LINEAR';
    case 'jira':    return 'JIRA';
    default:        return null; // no block kept
  }
}

function docsKindKey(docsHome) {
  switch (docsHome) {
    case 'local':          return 'LOCAL';
    case 'dedicated-repo': return 'DEDICATED REPO';
    case 'confluence':     return 'CONFLUENCE';
    case 'notion':         return 'NOTION';
    default:               return null;
  }
}

function renderColumnsTable(boardType, columns) {
  if (!columns || columns.length === 0) return '<!-- No columns configured. Run /setup or edit this section by hand. -->';
  const rows = columns.map((c, i) => {
    // Column name defaults to label name if no explicit mapping.
    return `| ${c} | ${c} |`;
  });
  return rows.join('\n');
}

function renderServicesTable(deployServices) {
  if (!deployServices || deployServices.length === 0) return '| (add rows for each deployable service) |  |  |  |';
  return deployServices.map((s) => `| ${s.name} | ${s.target || '(TBD)'} | ${s.image || '(TBD)'} | ${s.deploy_cmd || '(TBD)'} |`).join('\n');
}

function renderHealthTable(deployServices) {
  if (!deployServices || deployServices.length === 0) return '| (add rows for each deployable service) |  |  |';
  return deployServices.map((s) => `| ${s.name} | ${s.health_url || '(TBD)'} | 200 OK |`).join('\n');
}

function renderCopilotConfig(cwd, ctx, answers) {
  const target = path.join(cwd, '.copilot', 'pai-orbit-config.md');
  // Callers only reach this function inside the --setup branch of run(),
  // which is an explicit "re-interview me" gesture. Overwrite unconditionally.
  const srcTemplate = path.join(ctx.pluginDir, 'core', 'templates', 'pai-orbit-config.md.template');
  if (!fs.existsSync(srcTemplate)) {
    process.stderr.write(`pai-orbit: missing config template at ${srcTemplate}\n`);
    return false;
  }

  const boardBlock = boardKindKey(answers.board.type);
  const docsBlock = docsKindKey(answers.docs.home);

  const vars = {
    BOARD_TYPE: {
      github:  'GitHub Projects v2',
      gitlab:  'GitLab',
      linear:  'Linear',
      jira:    'Jira',
      notion:  'Notion',
      none:    'none',
    }[answers.board.type] || 'none',
    BRANCHING_MODEL: answers.branch.model,
    MAIN_BRANCH: answers.branch.main,
    PR_MERGE_STRATEGY: answers.branch.pr_merge_strategy,
    PROTECTED_BRANCHES: answers.branch.protected,
    DOCS_HOME: answers.docs.home,
    DOCS_PATH: answers.docs.path || 'docs/',
    DOCS_REPO_PATH: answers.docs.repo_path || '',
    CONFLUENCE_SPACE_URL: answers.docs.confluence_space || '',
    NOTION_WORKSPACE: answers.docs.notion_workspace || '',
    CLOUD_PROVIDER: answers.deploy.provider,
    AUTH_CHECK_CMD: answers.deploy.auth_check_cmd || '',
    SYSTEM_DOCS_REPO: answers.system_docs.repo || '',
    GIT_MCP_SERVER: answers.mcp.git,
    BOARD_MCP_SERVER: answers.mcp.board,
    DOCS_MCP_SERVER: answers.mcp.docs,

    // Board-specific placeholders
    GITHUB_ORG: '',
    GITHUB_REPO: '',
    GITHUB_PROJECT_NUMBER: '',
    GITHUB_PROJECT_URL: answers.board.url,
    GITHUB_PROJECT_COLUMNS: renderColumnsTable('github', answers.board.columns),
    TECH_BOARD_URL: answers.board.url,
    OPS_BOARD_URL: '',
    DEFAULT_ENG_HANDLE: (answers.team.find((t) => /lead|eng/i.test(t.role)) || {}).github || '',
    DEFAULT_OPS_HANDLE: (answers.team.find((t) => /ops/i.test(t.role)) || {}).github || '',
    LINEAR_WORKSPACE: '',
    LINEAR_TEAM_ID: '',
    LINEAR_COLUMNS: renderColumnsTable('linear', answers.board.columns),
    JIRA_PROJECT_KEY: '',
    JIRA_BOARD_URL: answers.board.url,
    JIRA_WORKFLOW_STATES: answers.board.columns.join(', '),
    GITLAB_NAMESPACE: extractGitLabNamespace(answers.board.url),
    GITLAB_BOARD_URL: answers.board.url,
    GITLAB_COLUMNS: renderColumnsTable('gitlab', answers.board.columns),

    // Deploy
    SERVICE_1_NAME: answers.deploy.services[0]?.name || '(none)',
    SERVICE_1_TARGET: answers.deploy.services[0]?.target || '',
    SERVICE_1_IMAGE: '',
    SERVICE_1_CMD: answers.deploy.services[0]?.deploy_cmd || '',
    SERVICE_1_HEALTH_URL: answers.deploy.services[0]?.health_url || '',
  };

  // Board-block filtering: keep only the one for the chosen type; delete others.
  const removeBoards = boardBlock ? BOARD_BLOCKS.filter((b) => b !== boardBlock) : BOARD_BLOCKS.slice();
  // Docs-block filtering: keep only the chosen home.
  const removeDocs = docsBlock ? DOCS_BLOCKS.filter((b) => b !== docsBlock) : DOCS_BLOCKS.slice();
  // GITFLOW block: keep only if branching model is gitflow.
  const removeBranch = answers.branch.model === 'gitflow' ? [] : GITFLOW_BLOCKS;

  render.renderTemplateFile(srcTemplate, target, vars, {
    removeBlocks: [...removeBoards, ...removeDocs, ...removeBranch],
  });

  // If no MCP servers configured, remove the entire ## MCP section from the
  // written file (setup.md rule — "omit if all three are none").
  if (answers.mcp.git === 'none' && answers.mcp.board === 'none' && answers.mcp.docs === 'none') {
    const raw = fs.readFileSync(target, 'utf8');
    const trimmed = raw.replace(/\r?\n---\r?\n\r?\n## MCP[\s\S]*?(?=\r?\n---\r?\n|$)/, '\n');
    fs.writeFileSync(target, trimmed, 'utf8');
  }

  // If no multi-repo system docs, remove the ## System Docs section too.
  if (!answers.system_docs.has_multi_repo) {
    const raw = fs.readFileSync(target, 'utf8');
    const trimmed = raw.replace(/\r?\n---\r?\n\r?\n## System Docs[\s\S]*$/, '\n');
    fs.writeFileSync(target, trimmed, 'utf8');
  }

  return true;
}

function extractGitLabNamespace(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\//, '').split('/-/')[0];
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Rich rendering — team.md
// ---------------------------------------------------------------------------

function renderTeam(cwd, ctx, answers) {
  const target = path.join(cwd, '.copilot', 'team.md');
  // Same logic as renderCopilotConfig — reached only in --setup mode.
  const srcTemplate = path.join(ctx.pluginDir, 'core', 'templates', 'team.md.template');
  if (!fs.existsSync(srcTemplate)) return false;

  fs.mkdirSync(path.dirname(target), { recursive: true });

  // If we have team roster, render dynamic rows; otherwise fall back to
  // template placeholders (user fills by hand).
  if (!answers.team || answers.team.length === 0) {
    fs.copyFileSync(srcTemplate, target);
    return true;
  }

  const raw = fs.readFileSync(srcTemplate, 'utf8');
  const teamRows = answers.team.map((m) => `| ${m.name} | ${m.role} | ${m.github || ''} | ${m.linear || ''} | ${m.jira || ''} | ${m.notes || ''} |`).join('\n');

  const engLead = answers.team.find((t) => /eng.*lead|lead.*eng/i.test(t.role)) || { name: '(TBD)' };
  const domainExpert = answers.team.find((t) => /domain|product/i.test(t.role)) || { name: '(TBD)' };
  const opsLead = answers.team.find((t) => /ops/i.test(t.role)) || { name: '(TBD)' };

  // Replace the single-placeholder row with our full roster.
  const rendered = raw
    .replace(/\| \{\{NAME_1\}\}.*\{\{NOTES_1\}\} \|/, teamRows)
    .replace(/\{\{ENG_LEAD\}\}/g, engLead.name)
    .replace(/\{\{DOMAIN_EXPERT\}\}/g, domainExpert.name)
    .replace(/\{\{OPS_LEAD\}\}/g, opsLead.name)
    // Any remaining placeholders left in template — clear to empty.
    .replace(/\{\{[A-Z0-9_]+\}\}/g, '');

  fs.writeFileSync(target, rendered, 'utf8');
  return true;
}

// ---------------------------------------------------------------------------
// Rich rendering — AGENTS.md (Copilot target; Claude+Cursor keep CLAUDE.md)
// ---------------------------------------------------------------------------

function renderAgentsMd(cwd, ctx, answers) {
  const target = path.join(cwd, 'AGENTS.md');
  const legacyTarget = path.join(cwd, 'CLAUDE.md');
  const force = ctx.flags['re-init-agents-md'] === true || ctx.flags['re-init-claude-md'] === true;
  if (fs.existsSync(target) && !force) return false;

  if (!fs.existsSync(target) && fs.existsSync(legacyTarget)) {
    process.stdout.write(
      'pai-orbit: found existing CLAUDE.md at repo root. Copilot target now uses AGENTS.md.\n' +
      '  Creating AGENTS.md alongside. Move project context from CLAUDE.md to AGENTS.md by hand,\n' +
      '  or delete CLAUDE.md once AGENTS.md is populated.\n',
    );
  }

  const srcTemplate = path.join(ctx.pluginDir, 'core', 'templates', 'CLAUDE.md.template');
  if (!fs.existsSync(srcTemplate)) return false;

  const projectName = path.basename(cwd);
  const svc = answers.services[0] || { name: 'app', path: '.', stack: 'generic' };
  const vars = {
    PROJECT_NAME: projectName,
    PROJECT_DESCRIPTION: '(fill in — one sentence: what it does, who it serves, what problem it solves)',
    SERVICE_1: svc.name,
    SERVICE_1_PATH: svc.path,
    SERVICE_1_STACK: svc.stack,
    SERVICE_1_PURPOSE: '(fill in)',
    INSTALL_CMD: '(fill in)',
    DEV_CMD: '(fill in)',
    TEST_CMD: '(fill in)',
    BUILD_CMD: '(fill in)',
    LINT_CMD: '(fill in)',
    VAR_1: '',
    SERVICE: svc.name,
    DESCRIPTION: '',
  };

  render.renderTemplateFile(srcTemplate, target, vars);

  // If multiple services, append a row per service to the Sub-projects table.
  if (answers.services.length > 1) {
    const raw = fs.readFileSync(target, 'utf8');
    const extraRows = answers.services.slice(1)
      .map((s) => `| ${s.name} | \`${s.path}/\` | ${s.stack} | (fill in) |`).join('\n');
    const withRows = raw.replace(
      /(\| .*\|.*\| \(fill in\) \|)/,
      `$1\n${extraRows}`,
    );
    fs.writeFileSync(target, withRows, 'utf8');
  }
  return true;
}

// ---------------------------------------------------------------------------
// Architecture scaffold — docs/architecture/{system,constraints,stack}.md
// ---------------------------------------------------------------------------

function renderArchitectureScaffold(cwd, ctx, answers) {
  const srcRoot = path.join(ctx.pluginDir, 'core', 'templates', 'docs', 'architecture');
  const destRoot = path.join(cwd, 'docs', 'architecture');
  if (!fs.existsSync(srcRoot)) return 0;

  const projectName = path.basename(cwd);
  const isoDate = new Date().toISOString().slice(0, 10);
  const languageList = (answers._discovery && answers._discovery.languages) || [];
  const frameworkList = (answers._discovery && answers._discovery.frameworks) || [];

  const vars = {
    PROJECT_NAME: projectName,
    DATE: isoDate,
    LANGUAGES: languageList.join(', ') || '(fill in)',
    FRAMEWORKS: frameworkList.join(', ') || '(fill in)',
    SERVICES: answers.services.map((s) => `- ${s.name} (${s.stack}) — \`${s.path}/\``).join('\n') || '- (fill in)',
    CONSTRAINTS: answers.architecture.constraints.length
      ? answers.architecture.constraints.map((c) => `- ${c}`).join('\n')
      : '- (run /arch init to populate)',
    SERVICES_DESCRIPTION: answers.architecture.services_description || '(fill in — run /arch init for a guided interview)',
  };

  let written = 0;
  for (const name of fs.readdirSync(srcRoot)) {
    const src = path.join(srcRoot, name);
    const dest = path.join(destRoot, name);
    if (fs.existsSync(dest)) continue;
    if (fs.statSync(src).isFile()) {
      render.renderTemplateFile(src, dest, vars);
      written += 1;
    }
  }
  return written;
}

// ---------------------------------------------------------------------------
// Settings.json (D19)
// ---------------------------------------------------------------------------

function renderSettingsJson(cwd, ctx, answers) {
  const target = path.join(cwd, '.copilot', 'settings.json');
  // Same logic as renderCopilotConfig — reached only in --setup mode.
  const settings = {
    pai_orbit_version: ctx.version,
    target: 'copilot',
    installed_at: new Date().toISOString(),
    husky_opted_in: answers.install_husky === true,
    detected_languages: (answers._discovery && answers._discovery.languages) || [],
    precommit_installer: answers.precommit_installer || 'husky',
    board_type: answers.board?.type || 'none',
    branch_model: answers.branch?.model || 'github-flow',
    docs_home: answers.docs?.home || 'local',
    is_monorepo: answers.is_monorepo === true,
    service_count: (answers.services || []).length,
  };
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return true;
}

// ---------------------------------------------------------------------------
// Docs scaffold (root subfolders) + backlog + wip etc.
// ---------------------------------------------------------------------------

function scaffoldDocs(cwd, ctx) {
  const srcRoot = path.join(ctx.pluginDir, 'core', 'templates', 'docs');
  if (!fs.existsSync(srcRoot)) return 0;
  let created = 0;
  for (const entry of fs.readdirSync(srcRoot, { withFileTypes: true })) {
    // architecture handled separately by renderArchitectureScaffold.
    if (entry.name === 'architecture') continue;
    const dest = path.join(cwd, 'docs', entry.name);
    const src = path.join(srcRoot, entry.name);
    if (!fs.existsSync(dest)) {
      if (entry.isDirectory()) {
        render.copyDir(src, dest, { overwrite: false });
      } else {
        render.copyFile(src, dest, { overwrite: false });
      }
      created += 1;
    }
  }
  return created;
}

// ---------------------------------------------------------------------------
// Discovery of dist directory
// ---------------------------------------------------------------------------

function findDistDir(ctx) {
  const candidate = path.join(ctx.pluginDir, 'dist', 'copilot');
  if (!fs.existsSync(candidate)) {
    process.stderr.write(
      `pai-orbit: dist/copilot not found at ${candidate}. Adapter must be built first ` +
        '(`bash plugins/pai-orbit/build.sh`). For npx installs this is rebuilt on every clone.\n',
    );
    process.exit(1);
  }
  return candidate;
}

function pickPrecommitInstaller(answers, ctx) {
  if (ctx.flags['install-husky']) return ctx.flags['install-precommit-framework'] ? 'both' : 'husky';
  if (ctx.flags['install-precommit-framework']) return 'pre-commit';
  return answers.precommit_installer || 'husky';
}

// ---------------------------------------------------------------------------
// Install-only mode (no --setup) — minimal defaults for husky opt-in state.
// Used when the CLI is asked to install pai-orbit files without running the
// interview. Values here only affect husky/pre-commit activation; NOT written
// to .copilot/pai-orbit-config.md, .copilot/team.md, or CLAUDE.md (those
// files stay unwritten in install-only mode).
// ---------------------------------------------------------------------------

function minimalDefaults(ctx) {
  const huskyDefault = fs.existsSync(path.join(ctx.cwd, '.git'));
  const prior = readJsonIfExists(path.join(ctx.cwd, '.copilot', 'settings.json')) || {};
  return {
    install_husky: ctx.flags['install-husky'] === true || prior.husky_opted_in === true || huskyDefault,
    precommit_installer: prior.precommit_installer || 'husky',
    _discovery: { languages: prior.detected_languages || promptsModule.detectLanguages(ctx.cwd) || [], frameworks: [] },
  };
}

// ---------------------------------------------------------------------------
// Report messaging — two paths depending on whether --setup ran.
// ---------------------------------------------------------------------------

function reportInstallOnly(ctx, lifecycle, huskyResult, pcResult) {
  process.stdout.write('\nReport (install-only mode — no interview):\n');
  process.stdout.write(`  lifecycle:           ${lifecycle}\n`);
  process.stdout.write(`  target:              copilot\n`);
  process.stdout.write(`  pai_orbit_version:   ${ctx.version}\n`);
  process.stdout.write('  files written:\n');
  process.stdout.write('    ✓ .github/copilot-instructions.md\n');
  process.stdout.write('    ✓ .github/prompts/          (29 files)\n');
  process.stdout.write('    ✓ .github/instructions/     (5 files)\n');
  process.stdout.write('    ✓ .husky/pre-commit.template + .pre-commit-config.yaml.template\n');
  process.stdout.write(`  husky activated:     ${huskyResult.activated ? 'yes' : `no (${huskyResult.reason || 'opted out'})`}\n`);
  process.stdout.write(`  pre-commit yaml:     ${pcResult.activated ? 'yes — run \`pre-commit install\` to wire the git hook' : `no (${pcResult.reason || 'opted out'})`}\n`);
  process.stdout.write('\n  files NOT written (deferred — configure via /setup in Chat or re-run with --setup):\n');
  process.stdout.write('    ⚠  .copilot/pai-orbit-config.md   ← board, branch, deploy, docs conventions\n');
  process.stdout.write('    ⚠  .copilot/team.md                 ← team members + roles + handles\n');
  process.stdout.write('    ⚠  AGENTS.md                        ← project stack, services, key files\n');
  process.stdout.write('    ⚠  docs/architecture/*.md           ← system, constraints, stack (starter docs)\n');
  process.stdout.write('\nNext steps — pick ONE based on your Copilot tier:\n');
  process.stdout.write('\n  ★ Copilot Pro / Business (recommended):\n');
  process.stdout.write('      1. Reload VS Code (Ctrl+Shift+P → Developer: Reload Window)\n');
  process.stdout.write('      2. Open Copilot Chat and type:  /setup\n');
  process.stdout.write('         Copilot runs the 11-question interview agentically and proposes\n');
  process.stdout.write('         file edits for you to accept.\n');
  process.stdout.write('\n  ★ Copilot Free:\n');
  process.stdout.write('      Re-run this CLI with --setup to run the interview from the terminal:\n');
  process.stdout.write('        npx github:the-psi/pai-orbit init copilot --setup\n');
  process.stdout.write('      (Free tier\'s /setup in Chat only renders advisory text, not\n');
  process.stdout.write('       file-edit proposals — the CLI does the same work directly.)\n');
  process.stdout.write('\n');
}

function reportFullSetup(ctx, lifecycle, answers, huskyResult, pcResult, docsCreated, archCreated) {
  process.stdout.write('\nReport (full setup — files + interview):\n');
  process.stdout.write(`  lifecycle:           ${lifecycle}\n`);
  process.stdout.write(`  target:              copilot\n`);
  process.stdout.write(`  pai_orbit_version:   ${ctx.version}\n`);
  process.stdout.write(`  board:               ${answers.board.type}${answers.board.url ? ' (' + answers.board.url + ')' : ''}\n`);
  process.stdout.write(`  branching model:     ${answers.branch.model}\n`);
  process.stdout.write(`  docs home:           ${answers.docs.home}\n`);
  process.stdout.write(`  services:            ${answers.services.length}\n`);
  process.stdout.write(`  team roster:         ${answers.team.length} entry(ies)\n`);
  process.stdout.write(`  MCP:                 git=${answers.mcp.git}, board=${answers.mcp.board}, docs=${answers.mcp.docs}\n`);
  process.stdout.write(`  husky activated:     ${huskyResult.activated ? 'yes' : `no (${huskyResult.reason || 'opted out'})`}\n`);
  process.stdout.write(`  pre-commit yaml:     ${pcResult.activated ? 'yes — run \`pre-commit install\` to wire the git hook' : `no (${pcResult.reason || 'opted out'})`}\n`);
  process.stdout.write(`  docs/ scaffold:      ${docsCreated} subfolder(s) created\n`);
  process.stdout.write(`  docs/architecture/:  ${archCreated} file(s) written\n`);
  process.stdout.write(`  \n`);
  process.stdout.write(
    [
      'Next steps:',
      '  1. Reload VS Code (Developer: Reload Window) so Copilot Chat picks up the prompts.',
      '  2. Try `/groom` in Copilot Chat — the slash picker should list 29 pai-orbit prompts.',
      '  3. Commit the new files. Suggested commit message:',
      '       feat(copilot): install pai-orbit Copilot adapter',
      '  4. Fill in remaining TODO markers in CLAUDE.md and docs/architecture/*.md.',
      '  5. Manual edits welcome — .copilot/pai-orbit-config.md and .copilot/team.md are yours to refine.',
      '',
    ].join('\n'),
  );
}

// ---------------------------------------------------------------------------
// Top-level entry — branches on --setup
// ---------------------------------------------------------------------------

async function run(ctx) {
  const lifecycle = detectLifecycle(ctx.cwd, ctx);
  logLifecycleBanner(lifecycle, ctx);

  if (lifecycle === 'migration') {
    performMigration(ctx.cwd, lifecycle, ctx);
  }

  // Flags that imply --setup (user provided interview-answer flags; they clearly
  // want the interview to run so those answers land somewhere).
  const setupImpliedByFlag =
    ctx.flags.board !== undefined ||
    ctx.flags.branch !== undefined ||
    ctx.flags['re-init-claude-md'] === true ||
    ctx.flags['re-init-agents-md'] === true;
  const runFullSetup = ctx.flags.setup === true || setupImpliedByFlag;

  const distDir = findDistDir(ctx);
  copyCopilotDist(ctx.cwd, distDir);

  const huskyOpts = { reinstall: ctx.flags['reinstall-husky'] === true };
  const pcOpts = { reinstall: ctx.flags['reinstall-precommit-framework'] === true };

  if (!runFullSetup) {
    // Install-only mode. Skip interview + skip config/CLAUDE.md/docs rendering.
    // Auto-activate husky using minimal defaults (respects prior settings.json
    // if this is a re-run + honours --install-husky / --install-precommit-framework flags).
    const minimal = minimalDefaults(ctx);
    const installer = pickPrecommitInstaller(minimal, ctx);
    const huskyResult =
      minimal.install_husky === true || installer === 'husky' || installer === 'both'
        ? activateHusky(ctx.cwd, huskyOpts)
        : { activated: false, reason: 'opted out (--install-husky to enable)' };
    const pcResult =
      installer === 'pre-commit' || installer === 'both'
        ? activatePrecommitFramework(ctx.cwd, pcOpts)
        : { activated: false, reason: 'opted out (--install-precommit-framework to enable)' };

    // Write / update .copilot/settings.json with minimal state (version,
    // husky opt-in, precommit choice, install timestamp). Config file itself
    // is NOT written — user creates it via /setup in Chat or re-run with --setup.
    const settingsTarget = path.join(ctx.cwd, '.copilot', 'settings.json');
    fs.mkdirSync(path.dirname(settingsTarget), { recursive: true });
    fs.writeFileSync(
      settingsTarget,
      `${JSON.stringify({
        pai_orbit_version: ctx.version,
        target: 'copilot',
        installed_at: new Date().toISOString(),
        install_mode: 'install-only',
        husky_opted_in: huskyResult.activated,
        detected_languages: minimal._discovery.languages,
        precommit_installer: installer,
      }, null, 2)}\n`,
      'utf8',
    );

    reportInstallOnly(ctx, lifecycle, huskyResult, pcResult);
    return;
  }

  // --setup mode: run the interview + render all config/CLAUDE.md/docs files.
  const answers = await promptsModule.runInterview(ctx, lifecycle === 'migration' ? 'first-run' : lifecycle);
  // In --setup mode, runInterview always returns a full answers object.

  renderCopilotConfig(ctx.cwd, ctx, answers);
  renderTeam(ctx.cwd, ctx, answers);
  renderAgentsMd(ctx.cwd, ctx, answers);
  renderSettingsJson(ctx.cwd, ctx, answers);
  const docsCreated = scaffoldDocs(ctx.cwd, ctx);
  const archCreated = renderArchitectureScaffold(ctx.cwd, ctx, answers);

  const installer = pickPrecommitInstaller(answers, ctx);
  const huskyResult =
    answers.install_husky === true || installer === 'husky' || installer === 'both'
      ? activateHusky(ctx.cwd, huskyOpts)
      : { activated: false, reason: 'opted out' };
  const pcResult =
    installer === 'pre-commit' || installer === 'both'
      ? activatePrecommitFramework(ctx.cwd, pcOpts)
      : { activated: false, reason: 'opted out' };

  reportFullSetup(ctx, lifecycle, answers, huskyResult, pcResult, docsCreated, archCreated);
}

module.exports = { run };
