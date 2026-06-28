'use strict';
// `pai-orbit init|update|migrate copilot` — Copilot-target install logic.
//
// Implements the lifecycle from the plan §"Lifecycle — re-run and update":
//   - first-run: no .copilot/, no .github/pai-orbit/  → run full interview + scaffold
//   - re-run:    .copilot/pai-orbit-config.md present → refresh pai-orbit-owned files, preserve user config
//   - migration: .github/pai-orbit/ from old adapter   → back up, move config to .copilot/, gitignore the backup
//
// File-ownership semantics — pai-orbit-owned files overwrite on re-run; user-owned files preserve.
// See plan's "File ownership rules" table for the authoritative split.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const promptsModule = require('./prompts');
const render = require('./render');

const PAI_ORBIT_BAK_PREFIX = '.github/pai-orbit.bak';

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
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function performMigration(cwd, lifecycle, ctx) {
  if (lifecycle !== 'migration') return;
  const oldDir = path.join(cwd, '.github', 'pai-orbit');
  if (!fs.existsSync(oldDir)) {
    process.stderr.write(
      `pai-orbit migrate copilot: old layout .github/pai-orbit/ not found in ${cwd}. Nothing to migrate.\n`,
    );
    process.exit(2);
  }

  const stamp = timestamp();
  const bakDir = path.join(cwd, '.github', `pai-orbit.bak`, stamp);
  const newDir = path.join(cwd, '.copilot');

  process.stdout.write('pai-orbit migrate: dry-run plan:\n');
  process.stdout.write(`  - back up ${path.relative(cwd, oldDir)} → ${path.relative(cwd, bakDir)}\n`);
  process.stdout.write(`  - move config + team files into ${path.relative(cwd, newDir)}/\n`);
  process.stdout.write(`  - append ${PAI_ORBIT_BAK_PREFIX}/ to .gitignore (D23)\n`);

  if (!ctx.flags.yes) {
    // We have no interactive confirm here without prompts; honour --yes / non-interactive only.
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

  // Husky template — always inert by default (D12).
  const huskySrc = path.join(distDir, '.husky', 'pre-commit.template');
  if (fs.existsSync(huskySrc)) {
    fs.mkdirSync(path.join(cwd, '.husky'), { recursive: true });
    render.copyFile(huskySrc, path.join(cwd, '.husky', 'pre-commit.template'));
  }

  // Pre-commit framework template — always inert by default (D29).
  const preCommitSrc = path.join(distDir, '.pre-commit-config.yaml.template');
  if (fs.existsSync(preCommitSrc)) {
    render.copyFile(preCommitSrc, path.join(cwd, '.pre-commit-config.yaml.template'));
  }
}

function activateHusky(cwd, opts) {
  const tpl = path.join(cwd, '.husky', 'pre-commit.template');
  const active = path.join(cwd, '.husky', 'pre-commit');

  if (!fs.existsSync(tpl)) return { activated: false, reason: 'template missing' };

  if (fs.existsSync(active) && !opts.reinstall) {
    return { activated: false, reason: 'already active — pass --reinstall-husky to overwrite' };
  }

  fs.copyFileSync(tpl, active);
  try {
    fs.chmodSync(active, 0o755);
  } catch {
    /* Windows file systems do not honour chmod — covered by git update-index below (D21). */
  }
  try {
    execFileSync('git', ['update-index', '--add', '--chmod=+x', '.husky/pre-commit'], {
      cwd,
      stdio: 'ignore',
    });
  } catch {
    /* D21 note: if the file is not yet tracked, the user must `git add` then re-run.
       This is non-fatal; we just couldn't set the tracked exec bit yet. */
  }
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

function renderCopilotConfig(cwd, ctx, answers) {
  const target = path.join(cwd, '.copilot', 'pai-orbit-config.md');
  // Preserve user-customised config on re-run (D14).
  if (fs.existsSync(target) && !ctx.flags['re-interview']) return false;

  const srcTemplate = path.join(ctx.pluginDir, 'core', 'templates', 'pai-orbit-config.md.template');
  if (!fs.existsSync(srcTemplate)) {
    process.stderr.write(`pai-orbit: missing config template at ${srcTemplate}\n`);
    return false;
  }
  const vars = {
    BOARD_TYPE: answers.board || 'none',
    BRANCHING_MODEL: answers.branch || 'github-flow',
    MAIN_BRANCH: 'main',
    PR_MERGE_STRATEGY: 'squash merge',
    PROTECTED_BRANCHES: 'main',
    DOCS_HOME: answers.docs_home || 'local',
    DOCS_PATH: 'docs/',
    DOCS_REPO_PATH: '',
    CONFLUENCE_SPACE_URL: '',
    NOTION_WORKSPACE: '',
    CLOUD_PROVIDER: 'other',
    AUTH_CHECK_CMD: '',
    SYSTEM_DOCS_REPO: '',
    GIT_MCP_SERVER: 'none',
    BOARD_MCP_SERVER: 'none',
    DOCS_MCP_SERVER: 'none',
  };
  render.renderTemplateFile(srcTemplate, target, vars);
  return true;
}

function renderTeam(cwd, ctx) {
  const target = path.join(cwd, '.copilot', 'team.md');
  if (fs.existsSync(target) && !ctx.flags['re-interview']) return false;
  const srcTemplate = path.join(ctx.pluginDir, 'core', 'templates', 'team.md.template');
  if (!fs.existsSync(srcTemplate)) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(srcTemplate, target);
  return true;
}

function renderClaudeMd(cwd, ctx) {
  const target = path.join(cwd, 'CLAUDE.md');
  if (fs.existsSync(target) && !ctx.flags['re-init-claude-md']) return false;
  const srcTemplate = path.join(ctx.pluginDir, 'core', 'templates', 'CLAUDE.md.template');
  if (!fs.existsSync(srcTemplate)) return false;
  fs.copyFileSync(srcTemplate, target);
  return true;
}

function renderSettingsJson(cwd, ctx, answers) {
  const target = path.join(cwd, '.copilot', 'settings.json');
  const existing = readJsonIfExists(target);
  // Preserve by default unless --re-interview forces a rewrite (D14).
  if (existing && !ctx.flags['re-interview']) return false;

  const settings = {
    pai_orbit_version: ctx.version,
    target: 'copilot',
    installed_at: new Date().toISOString(),
    husky_opted_in: answers.install_husky === true,
    detected_languages: promptsModule.detectLanguages(cwd),
    precommit_installer: answers.precommit_installer || 'husky',
  };
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return true;
}

function scaffoldDocs(cwd, ctx) {
  const srcRoot = path.join(ctx.pluginDir, 'core', 'templates', 'docs');
  if (!fs.existsSync(srcRoot)) return 0;
  const subdirs = fs.readdirSync(srcRoot, { withFileTypes: true });
  let created = 0;
  for (const entry of subdirs) {
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

function findDistDir(ctx) {
  const candidate = path.join(ctx.pluginDir, 'dist', 'copilot');
  if (!fs.existsSync(candidate)) {
    process.stderr.write(
      `pai-orbit: dist/copilot not found at ${candidate}. The adapter must be built before init runs ` +
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

async function run(ctx) {
  const lifecycle = detectLifecycle(ctx.cwd, ctx);
  logLifecycleBanner(lifecycle, ctx);

  if (lifecycle === 'migration') {
    performMigration(ctx.cwd, lifecycle, ctx);
  }

  const answers =
    (await promptsModule.runInterview(ctx, lifecycle === 'migration' ? 'first-run' : lifecycle)) ||
    promptsModule.runInterview.fallback ||
    {};

  // For re-run mode with no interview, recover prior answers from settings.json so the
  // install lifetime is consistent (husky opt-in, pre-commit installer).
  let merged = answers;
  if (lifecycle === 're-run') {
    const prior = readJsonIfExists(path.join(ctx.cwd, '.copilot', 'settings.json')) || {};
    merged = {
      board: answers && answers.board ? answers.board : ctx.flags.board || 'none',
      branch: answers && answers.branch ? answers.branch : ctx.flags.branch || 'github-flow',
      docs_home: (answers && answers.docs_home) || 'local',
      install_husky:
        ctx.flags['install-husky'] === true ||
        (answers && answers.install_husky === true) ||
        prior.husky_opted_in === true,
      precommit_installer:
        (answers && answers.precommit_installer) || prior.precommit_installer || 'husky',
    };
  }

  const distDir = findDistDir(ctx);
  copyCopilotDist(ctx.cwd, distDir);

  renderCopilotConfig(ctx.cwd, ctx, merged);
  renderTeam(ctx.cwd, ctx);
  renderClaudeMd(ctx.cwd, ctx);
  renderSettingsJson(ctx.cwd, ctx, merged);
  const docsCreated = scaffoldDocs(ctx.cwd, ctx);

  const installer = pickPrecommitInstaller(merged, ctx);
  const huskyOpts = { reinstall: ctx.flags['reinstall-husky'] === true };
  const pcOpts = { reinstall: ctx.flags['reinstall-precommit-framework'] === true };

  const huskyResult =
    merged.install_husky === true || installer === 'husky' || installer === 'both'
      ? activateHusky(ctx.cwd, huskyOpts)
      : { activated: false, reason: 'opted out' };

  const pcResult =
    installer === 'pre-commit' || installer === 'both'
      ? activatePrecommitFramework(ctx.cwd, pcOpts)
      : { activated: false, reason: 'opted out' };

  // ---- report ------------------------------------------------------------
  process.stdout.write('\nReport:\n');
  process.stdout.write(`  lifecycle:           ${lifecycle}\n`);
  process.stdout.write(`  target:              copilot\n`);
  process.stdout.write(`  pai_orbit_version:   ${ctx.version}\n`);
  process.stdout.write('  files written under .github/, .copilot/, .husky/, and root\n');
  process.stdout.write(`  husky activated:     ${huskyResult.activated ? 'yes' : `no (${huskyResult.reason || 'opted out'})`}\n`);
  process.stdout.write(`  pre-commit yaml:     ${pcResult.activated ? 'yes — run \`pre-commit install\` to wire the git hook' : `no (${pcResult.reason || 'opted out'})`}\n`);
  process.stdout.write(`  docs/ scaffold:      ${docsCreated} subfolder(s) created\n`);
  process.stdout.write(`  \n`);
  process.stdout.write(
    [
      'Next steps:',
      '  1. Reload VS Code (Developer: Reload Window) so Copilot Chat picks up the prompts.',
      '  2. Try `/groom` in Copilot Chat — the slash picker should list 25 pai-orbit prompts.',
      '  3. Commit the new files. Suggested commit message:',
      '       feat(copilot): install pai-orbit Copilot adapter',
      '  4. If you skipped husky / pre-commit framework, you can opt in later with:',
      '       npx github:the-psi/pai-orbit init copilot --install-husky',
      '       npx github:the-psi/pai-orbit init copilot --install-precommit-framework',
      '',
    ].join('\n'),
  );
}

module.exports = { run };
