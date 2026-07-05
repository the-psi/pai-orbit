#!/usr/bin/env node
// pai-orbit install CLI — standalone installer for the Copilot adapter.
//
// Working plan + design spec (D1..D36) kept locally by the implementing team.
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
//   claude | cursor              stubs (D9) — point users at /setup inside the host tool
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

Usage:
  pai-orbit init <target>       Set up pai-orbit in the current project
                                <target>: copilot | claude | cursor
                                          (claude/cursor are stubs in v1 — D9)
  pai-orbit update <target>     Refresh pai-orbit-owned files; preserves user config
                                (Alias for \`init <target>\` re-run mode.)
  pai-orbit migrate <target>    Force migration from the OLD .github/pai-orbit/ layout
                                (Per D25 — init auto-detects; this is the escape hatch.)
  pai-orbit --help              Show this help
  pai-orbit --version           Show CLI version

Flags (init / update / migrate, where relevant):
  --yes, --no-interactive       Skip all prompts; use defaults plus other flags
  --board=<value>               gitlab | github | linear | jira | none
  --branch=<value>               github-flow | gitflow | trunk
  --re-interview                 Force a fresh interview on re-run (rewrites .copilot/*)
  --re-init-claude-md            Force rewrite of CLAUDE.md
  --install-husky                Install the .husky/pre-commit hook even if previously opted out
  --reinstall-husky              Overwrite an existing .husky/pre-commit
  --install-precommit-framework  Install .pre-commit-config.yaml even if previously opted out (D29)
  --reinstall-precommit-framework  Overwrite an existing .pre-commit-config.yaml
  --ignore-existing              Hint for npx caching — no in-CLI effect

Examples:
  pai-orbit init copilot
  npx github:the-psi/pai-orbit init copilot
  npx github:the-psi/pai-orbit#<release-tag> init copilot   (pin a released tag; see repo Releases)
  npx github:the-psi/pai-orbit init copilot --board=gitlab --branch=trunk --yes`;
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
