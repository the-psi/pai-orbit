'use strict';
// Interactive Q&A flow for `init copilot` (and `update copilot`).
//
// Uses the `prompts` npm package when available (installed transitively by npx
// via the root package.json). In `--yes` / `--no-interactive` mode all answers
// come from defaults + flags, so the prompts package is not required.

const fs = require('node:fs');
const path = require('node:path');

function loadPromptsLib() {
  try {
    // eslint-disable-next-line global-require
    return require('prompts');
  } catch {
    return null;
  }
}

// Detect existing pre-commit installer presence to bias defaults sensibly.
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
  } catch {
    /* ignore — fall through to default */
  }
  return 'husky';
}

function detectLanguages(cwd) {
  const langs = new Set();
  const has = (rel) => fs.existsSync(path.join(cwd, rel));
  if (has('package.json') || has('tsconfig.json')) langs.add('typescript');
  if (has('pyproject.toml') || has('requirements.txt') || has('setup.py')) langs.add('python');
  if (has('go.mod')) langs.add('go');
  if (has('Cargo.toml')) langs.add('rust');
  if (has('pom.xml') || has('build.gradle')) langs.add('java');
  if (has('Gemfile')) langs.add('ruby');
  if (has('composer.json')) langs.add('php');
  return Array.from(langs);
}

// Non-interactive answers come entirely from flags + sensible defaults.
function defaultsFor(ctx, lifecycle) {
  const huskyDefault = fs.existsSync(path.join(ctx.cwd, '.git'));
  return {
    board: ctx.flags.board || 'none',
    branch: ctx.flags.branch || 'github-flow',
    docs_home: 'local',
    install_husky: ctx.flags['install-husky'] === true ? true : huskyDefault,
    precommit_installer: detectPrecommitInstallerDefault(ctx.cwd),
    lifecycle,
  };
}

async function runInterview(ctx, lifecycle) {
  // Re-run mode skips the interview by default (D14) unless --re-interview is set.
  if (lifecycle === 're-run' && !ctx.flags['re-interview']) {
    return null;
  }
  if (ctx.flags.yes) {
    return defaultsFor(ctx, lifecycle);
  }

  const promptsLib = loadPromptsLib();
  if (!promptsLib) {
    process.stderr.write(
      "pai-orbit: 'prompts' package not available — falling back to --yes defaults. " +
        "Re-run with `npx github:the-psi/pai-orbit init copilot` so npx fetches dependencies.\n",
    );
    return defaultsFor(ctx, lifecycle);
  }

  const huskyDetectedDefault = fs.existsSync(path.join(ctx.cwd, '.git'));
  const precommitDefault = detectPrecommitInstallerDefault(ctx.cwd);

  const onCancel = () => {
    process.stderr.write('pai-orbit: interview cancelled — no files written.\n');
    process.exit(130);
  };

  const answers = await promptsLib(
    [
      {
        type: 'select',
        name: 'board',
        message: 'Task-management board',
        choices: [
          { title: 'GitHub Issues / Projects', value: 'github' },
          { title: 'GitLab', value: 'gitlab' },
          { title: 'Linear', value: 'linear' },
          { title: 'Jira', value: 'jira' },
          { title: 'None', value: 'none' },
        ],
        initial: 0,
      },
      {
        type: 'select',
        name: 'branch',
        message: 'Branching model',
        choices: [
          { title: 'GitHub Flow (feature branches → main)', value: 'github-flow' },
          { title: 'GitFlow (develop + release branches)', value: 'gitflow' },
          { title: 'Trunk-based (direct to main)', value: 'trunk' },
        ],
        initial: 0,
      },
      {
        type: 'text',
        name: 'docs_home',
        message: 'Docs home (local | dedicated-repo | confluence | notion)',
        initial: 'local',
      },
      {
        type: 'confirm',
        name: 'install_husky',
        message: 'Install the optional .husky/pre-commit hook for git-level bash-guard enforcement?',
        initial: huskyDetectedDefault,
      },
      {
        type: 'select',
        name: 'precommit_installer',
        message: 'Pre-commit installer (per D29)',
        choices: [
          { title: 'husky (JS-ecosystem-flavoured)', value: 'husky' },
          { title: 'pre-commit framework (Python, language-agnostic)', value: 'pre-commit' },
          { title: 'both', value: 'both' },
          { title: 'neither (templates only — opt in later)', value: 'neither' },
        ],
        initial: ['husky', 'pre-commit', 'both', 'neither'].indexOf(precommitDefault),
      },
    ],
    { onCancel },
  );

  return {
    ...answers,
    lifecycle,
  };
}

module.exports = {
  runInterview,
  detectLanguages,
  detectPrecommitInstallerDefault,
};
