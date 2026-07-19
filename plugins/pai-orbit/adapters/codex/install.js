#!/usr/bin/env node
// pai-orbit — OpenAI Codex CLI adapter installer.
//
// Distribution channel: `npx github:the-psi/pai-orbit init codex`.
// No npm publish required — npx fetches the repo at run time.
//
// Subcommands:
//   pai-orbit init codex          first-run install; refuses to overwrite
//   pai-orbit update codex        overwrite existing install
//   pai-orbit --help              usage
//   pai-orbit --version           print version
//
// Targets: only `codex` is implemented on this branch. Other adapters
// (Copilot, Cursor, Claude Code) have their own install paths today; they
// may unify under a single CLI later — that's a merge-time concern, not a
// branch-time coupling.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SCRIPT_DIR = __dirname;
const PLUGIN_DIR = path.resolve(SCRIPT_DIR, '..', '..');
const DIST_DIR = path.join(PLUGIN_DIR, 'dist', 'codex');
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..', '..');

function readPackageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const VERSION = readPackageVersion();

function usage() {
  return `pai-orbit — Codex adapter installer (v${VERSION})

Install pai-orbit's OpenAI Codex CLI adapter into your project.

Usage:
  npx github:the-psi/pai-orbit init codex          Install (refuses to overwrite existing .agents/skills/)
  npx github:the-psi/pai-orbit update codex        Re-install, overwriting existing files
  npx github:the-psi/pai-orbit --help              Show this help
  npx github:the-psi/pai-orbit --version           Print version

Pin a ref by appending #<branch|tag|sha>:
  npx github:the-psi/pai-orbit#v1.4.0 init codex

Requires: OpenAI Codex CLI v0.144.6+ and Node.js 18+.

After install: launch \`codex\` in the project, trust it, then run \`/hooks\`
and \`$setup\` inside the Codex TUI. See docs/codex-install-and-usage.md
for the full walkthrough.`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    // Preserve exec bit on shell scripts. No-op on Windows.
    if (dest.endsWith('.sh')) {
      try {
        const mode = fs.statSync(dest).mode;
        fs.chmodSync(dest, mode | 0o111);
      } catch {
        // Ignore chmod failures (Windows).
      }
    }
  }
}

function assertDistPresent() {
  if (!fs.existsSync(DIST_DIR) || !fs.existsSync(path.join(DIST_DIR, 'AGENTS.md'))) {
    console.error(`ERROR: Codex adapter dist not found at ${DIST_DIR}`);
    console.error('This CLI expects to run from a full repo checkout (as npx does when it fetches the repo).');
    console.error('If you are hacking locally, run \`bash plugins/pai-orbit/adapters/codex/build.sh\` first.');
    process.exit(1);
  }
}

function runInstall(target, { overwrite }) {
  if (target !== 'codex') {
    console.error(`ERROR: unknown target '${target ?? '(missing)'}'. Only 'codex' is supported by this installer.`);
    process.exit(1);
  }

  assertDistPresent();

  const cwd = process.cwd();
  const skillsDir = path.join(cwd, '.agents', 'skills');
  if (fs.existsSync(skillsDir) && !overwrite) {
    console.error(`ERROR: ${skillsDir} already exists in this project.`);
    console.error('Use \`update codex\` instead of \`init codex\` to re-install and overwrite.');
    process.exit(1);
  }

  console.log(`pai-orbit (Codex v${VERSION}): installing into ${cwd} ...\n`);

  const entries = fs.readdirSync(DIST_DIR);
  let fileCount = 0;
  for (const entry of entries) {
    const src = path.join(DIST_DIR, entry);
    const dest = path.join(cwd, entry);
    copyRecursive(src, dest);
    const kind = fs.statSync(src).isDirectory() ? 'dir ' : 'file';
    console.log(`  ${kind}  ${entry}`);
    fileCount += 1;
  }

  console.log('');
  console.log(`pai-orbit (Codex) installed — ${fileCount} entrie(s) copied from dist/codex/.`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Launch \`codex\` in this directory. Trust the project when prompted.');
  console.log('  2. Run \`/hooks\` to review and trust the 4 registered hooks.');
  console.log('  3. Run \`$setup\` to fill in .codex/pai-orbit-config.md, .codex/team.md,');
  console.log('     and the lint hooks\' repo= configuration.');
  console.log('  4. Run \`/skills\` to see the 20 available skills.');
  console.log('');
  console.log('Docs: docs/codex-install-and-usage.md in the repo.');
}

function main(argv) {
  const args = argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(usage());
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-V')) {
    console.log(VERSION);
    process.exit(0);
  }

  const cmd = args[0];
  const target = args[1];

  switch (cmd) {
    case 'init':
      runInstall(target, { overwrite: false });
      break;
    case 'update':
    case 'migrate':
      // `migrate` and `update` are aliases for a re-install / overwrite.
      runInstall(target, { overwrite: true });
      break;
    default:
      console.error(`ERROR: unknown command '${cmd}'.`);
      console.error('');
      console.error(usage());
      process.exit(1);
  }
}

main(process.argv);
