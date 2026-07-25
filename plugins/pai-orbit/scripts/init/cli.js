#!/usr/bin/env node
// pai-orbit install CLI — standalone installer for the Copilot adapter.
//
// Design decisions cited by D-number in comments are recorded in
// `docs/decisions/2026-07-25-copilot-adapter-decisions.md`.
// This file is the runnable artefact; end-user docs live in
// `docs/copilot-install-and-usage.md`.
//
// Subcommands:
//   pai-orbit init <target>      first-run or re-run install
//   pai-orbit update <target>    alias for init re-run mode
//   pai-orbit migrate <target>   force migration from old layout
//   pai-orbit --help             usage
//   pai-orbit --version          version
//
// Targets:
//   copilot                      fully implemented
//   claude | cursor              stubs — point users at /setup inside the host tool
//
// Distribution channel: `npx github:the-psi/pai-orbit init copilot`. No npm publish.

'use strict';

const path = require('node:path');
const fs = require('node:fs');

const SCRIPT_DIR = __dirname;
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..', '..');
const PLUGIN_DIR = path.resolve(SCRIPT_DIR, '..', '..');

function readPackageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function usage() {
  return `pai-orbit — install CLI

Two ways to use this:

  pai-orbit init <target>
      Install pai-orbit files only. No interview asked.
      Auto-activates .husky/pre-commit if .git/ exists.
      Recommended for Copilot Business/Pro users — run \`/setup\` in
      Copilot Chat afterwards to configure the project agentically
      (Copilot Business proposes file edits you accept).

  pai-orbit init <target> --setup
      Install files AND run the 11-question interview from the terminal.
      Renders .copilot/pai-orbit-config.md, .copilot/team.md, AGENTS.md,
      and docs/architecture/*.md with your answers. Nothing to hand-edit.
      Recommended for Copilot Free users — Free tier's /setup in Chat only
      renders advisory text, not file-edit proposals.

Subcommands:
  pai-orbit init <target>            First-time install (files only by default).
  pai-orbit init <target> --setup    First-time install + run interview.
  pai-orbit update <target>          Refresh pai-orbit-owned files; preserves
                                     your .copilot/*, AGENTS.md, docs/.
  pai-orbit update <target> --setup  Refresh files + re-run interview,
                                     overwriting .copilot/pai-orbit-config.md
                                     and .copilot/team.md with new answers.
  pai-orbit migrate <target>         Force migration from OLD .github/pai-orbit/
                                     layout (init also auto-detects).
  pai-orbit --help                   Show this help.
  pai-orbit --version                Show CLI version.

  <target>: copilot | claude | cursor  (claude/cursor are stubs in v1)

Flags:
  --setup                            Run the 11-question interview after files
                                     install. Required for Copilot Free users
                                     who do not want to hand-edit config files.
  --yes, --no-interactive            Auto-answer interview questions with
                                     defaults. Only meaningful with --setup.
                                     Use for CI or fastest install.
  --board=<value>                    gitlab | github | linear | jira | none
                                     (interview answer — implies --setup)
  --branch=<value>                   github-flow | gitflow | trunk
                                     (interview answer — implies --setup)
  --install-husky                    Install .husky/pre-commit even if
                                     previously opted out.
  --reinstall-husky                  Overwrite an existing .husky/pre-commit.
  --install-precommit-framework      Install .pre-commit-config.yaml even if
                                     previously opted out (D29).
  --reinstall-precommit-framework    Overwrite an existing .pre-commit-config.yaml.
  --re-init-agents-md                Force rewrite of AGENTS.md (implies --setup).
                                     Copilot target only. Alias: --re-init-claude-md.
  --ignore-existing                  Forces npx to re-fetch from GitHub.

Examples — Copilot Business/Pro (recommended):
  npx github:the-psi/pai-orbit init copilot
      Then in Copilot Chat: /setup

Examples — Copilot Free:
  npx github:the-psi/pai-orbit init copilot --setup
      Full 11-question interview from terminal. Nothing to hand-edit after.

  npx github:the-psi/pai-orbit init copilot --setup --yes
      Same but auto-answered with defaults. Fast install; hand-edit later.

Examples — CI / non-interactive:
  npx github:the-psi/pai-orbit init copilot --setup --yes --board=gitlab`;
}

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (const raw of argv) {
    if (raw === '--help' || raw === '-h') {
      args.flags.help = true;
    } else if (raw === '--version' || raw === '-v') {
      args.flags.version = true;
    } else if (raw.startsWith('--')) {
      const eq = raw.indexOf('=');
      if (eq === -1) {
        args.flags[raw.slice(2)] = true;
      } else {
        args.flags[raw.slice(2, eq)] = raw.slice(eq + 1);
      }
    } else {
      args._.push(raw);
    }
  }
  // --no-interactive aliases --yes
  if (args.flags['no-interactive']) args.flags.yes = true;
  return args;
}

function dieWithUsage(message, code = 2) {
  if (message) process.stderr.write(`pai-orbit: ${message}\n\n`);
  process.stderr.write(`${usage()}\n`);
  process.exit(code);
}

async function main(argv) {
  const args = parseArgs(argv);

  if (args.flags.version) {
    process.stdout.write(`${readPackageVersion()}\n`);
    return;
  }
  if (args.flags.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const [subcommand, target, ...rest] = args._;
  if (rest.length > 0) {
    dieWithUsage(`unexpected positional argument(s): ${rest.join(' ')}`);
  }
  if (!subcommand) {
    dieWithUsage('missing subcommand');
  }

  if (!['init', 'update', 'migrate'].includes(subcommand)) {
    dieWithUsage(`unknown subcommand: ${subcommand}`);
  }
  if (!target) {
    dieWithUsage(`missing target for '${subcommand}' (one of: copilot, claude, cursor)`);
  }

  const cwd = process.cwd();
  const ctx = {
    cwd,
    pluginDir: PLUGIN_DIR,
    repoRoot: REPO_ROOT,
    version: readPackageVersion(),
    subcommand,
    target,
    flags: args.flags,
  };

  if (target === 'copilot') {
    const copilot = require('./lib/copilot');
    await copilot.run(ctx);
    return;
  }
  if (target === 'claude') {
    const claude = require('./lib/claude');
    await claude.run(ctx);
    return;
  }
  if (target === 'cursor') {
    const cursor = require('./lib/cursor');
    await cursor.run(ctx);
    return;
  }
  dieWithUsage(`unknown target: ${target}`);
}

main(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`pai-orbit: ${err.stack || err.message || err}\n`);
  process.exit(1);
});
