#!/usr/bin/env node
// pai-orbit — OpenAI Codex CLI adapter installer.
//
// Distribution channel: `npx github:the-psi/pai-orbit init codex`.
// No npm publish required — npx fetches the repo at run time.
//
// Subcommands:
//   pai-orbit init codex          first-run install; aborts if ANY top-level
//                                 dist entry already exists in the target
//                                 project (protects hand-written AGENTS.md,
//                                 README.md, pre-existing .codex/ config).
//   pai-orbit update codex        upgrade plugin-owned files; keeps project settings
//                                 (config, team, config.toml, lint repo= blocks);
//                                 AGENTS.md/README.md conflicts go to *.pai-orbit-new
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
  npx github:the-psi/pai-orbit init codex          First-run install; aborts if any top-level
                                                   dist entry (AGENTS.md, .agents/, .codex/, etc.)
                                                   already exists in the target project.
  npx github:the-psi/pai-orbit update codex        Upgrade plugin files; keeps your config, team, lint
                                                   paths, AGENTS.md and README.md (conflicts reported).
  npx github:the-psi/pai-orbit --help              Show this help.
  npx github:the-psi/pai-orbit --version           Print version.

Pin a ref by appending #<branch|tag|sha>:
  npx github:the-psi/pai-orbit#<tag> init codex

Requires: OpenAI Codex CLI v0.144.6+ and Node.js 18+.

After install: launch \`codex\` in the project, trust it, then run \`/hooks\`
and \`$setup\` inside the Codex TUI. See docs/codex-install-and-usage.md
for the full walkthrough.`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// ── Ownership rules (ADR 2026-11-24-codex-update-preserve-project-settings) ──
// Any new project-owned file shipped in dist/codex/ MUST be added here, or
// `update codex` will overwrite it.
const KEEP_AND_APPEND = new Set(['.codex/pai-orbit-config.md', '.codex/team.md', '.codex/config.toml']);
const CONFLICT_SIDE_FILE = new Set(['AGENTS.md', 'README.md']);
const SPLICE_CONFIGURE = new Set(['.codex/hooks/lint-python.sh', '.codex/hooks/lint-ts.sh']);

const CONFIGURE_START = '# --- CONFIGURE';
const CONFIGURE_END = '# --- END CONFIGURE ---';

function chmodExec(file) {
  if (!file.endsWith('.sh')) return;
  try {
    fs.chmodSync(file, fs.statSync(file).mode | 0o111);
  } catch {
    // Ignore chmod failures (Windows).
  }
}

// Write only when bytes differ. Returns true if the file was created or changed.
function writeIfChanged(dest, content) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (fs.existsSync(dest) && Buffer.compare(fs.readFileSync(dest), buf) === 0) return false;
  ensureDir(path.dirname(dest));
  fs.writeFileSync(dest, buf);
  chmodExec(dest);
  return true;
}

// Split text into { before, block, after } around the CONFIGURE markers; null if absent.
function splitConfigure(text) {
  const s = text.indexOf(CONFIGURE_START);
  const e = text.indexOf(CONFIGURE_END);
  if (s === -1 || e === -1 || e < s) return null;
  const end = e + CONFIGURE_END.length;
  return { before: text.slice(0, s), block: text.slice(s, end), after: text.slice(end) };
}

// Markdown: append "## Section" blocks present in the template but absent in the user's file.
function appendMissingSections(userText, tplText) {
  const parts = tplText.split(/^(?=## )/m).filter((p) => p.startsWith('## '));
  const have = new Set(userText.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.trim()));
  const added = [];
  let out = userText;
  for (const p of parts) {
    const heading = p.split('\n')[0].trim();
    if (have.has(heading)) continue;
    out = out.replace(/\n*$/, '\n\n') + '<!-- Added by `update codex`: fill this section in. -->\n' + p.replace(/\n*$/, '\n');
    added.push(heading);
  }
  return { text: out, added };
}

// TOML: append [tables] missing from the user's file; report new keys inside existing tables.
function parseToml(text) {
  const tables = new Map([['', { keys: new Set(), text: '' }]]);
  let cur = '';
  for (const line of text.split('\n')) {
    const t = line.match(/^\[([^\]]+)\]\s*$/);
    if (t) {
      cur = t[1].trim();
      tables.set(cur, { keys: new Set(), text: '' });
    }
    const k = line.match(/^([A-Za-z0-9_.-]+)\s*=/);
    if (k) tables.get(cur).keys.add(k[1]);
    tables.get(cur).text += line + '\n';
  }
  return tables;
}

function mergeToml(userText, tplText) {
  const user = parseToml(userText);
  const added = [];
  const newKeys = [];
  let out = userText;
  for (const [name, tpl] of parseToml(tplText)) {
    if (!user.has(name)) {
      out = out.replace(/\n*$/, '\n\n') + tpl.text.replace(/\n*$/, '\n');
      added.push(`[${name}]`);
    } else {
      for (const k of tpl.keys) if (!user.get(name).keys.has(k)) newKeys.push(`${name ? `[${name}] ` : ''}${k}`);
    }
  }
  return { text: out, added, newKeys };
}

function newSummary() {
  return { preserved: [], added: [], migrated: [], conflicts: [], backups: [], warnings: [], hooksChanged: [], files: 0 };
}

// Install one dist file into the project according to its ownership class.
function installFile(src, dest, rel, s) {
  s.files += 1;
  const exists = fs.existsSync(dest);
  const isHook = rel.startsWith('.codex/hooks/') || rel === '.codex/hooks.json';
  const srcBuf = fs.readFileSync(src);

  if (exists && KEEP_AND_APPEND.has(rel)) {
    const user = fs.readFileSync(dest, 'utf8');
    const tpl = srcBuf.toString('utf8');
    let merged;
    if (rel.endsWith('.toml')) {
      const m = mergeToml(user, tpl);
      merged = m;
      for (const k of m.newKeys) s.warnings.push(`${rel}: new key available: ${k}`);
    } else {
      merged = appendMissingSections(user, tpl);
    }
    if (merged.added.length) {
      fs.writeFileSync(dest, merged.text);
      for (const a of merged.added) s.added.push(`${rel}: ${a}`);
    }
    s.preserved.push(rel);
    return;
  }

  if (exists && CONFLICT_SIDE_FILE.has(rel)) {
    if (Buffer.compare(fs.readFileSync(dest), srcBuf) === 0) return;
    writeIfChanged(`${dest}.pai-orbit-new`, srcBuf);
    s.conflicts.push(`${rel} differs from the new release — yours kept, new version at ${rel}.pai-orbit-new`);
    return;
  }

  if (exists && SPLICE_CONFIGURE.has(rel)) {
    const old = fs.readFileSync(dest, 'utf8');
    const tpl = srcBuf.toString('utf8');
    const o = splitConfigure(old);
    const n = splitConfigure(tpl);
    let next = tpl;
    if (!o || !n) {
      writeIfChanged(`${dest}.pai-orbit-old`, old);
      s.backups.push(`${rel}: CONFIGURE markers missing — new script installed, old saved as ${rel}.pai-orbit-old; re-add your repo paths`);
    } else {
      next = n.before + o.block + n.after;
      if (o.before !== n.before || o.after !== n.after) {
        writeIfChanged(`${dest}.pai-orbit-old`, old);
        s.backups.push(`${rel}: differs outside the CONFIGURE block — old script saved as ${rel}.pai-orbit-old`);
      }
    }
    if (writeIfChanged(dest, next)) {
      s.hooksChanged.push(rel);
      if (o && n && o.block !== n.block) s.migrated.push(`${rel}: your CONFIGURE block carried into the new script`);
    }
    return;
  }

  const changed = writeIfChanged(dest, srcBuf);
  if (changed && isHook) s.hooksChanged.push(rel);
}

function installTree(src, dest, rel, s) {
  if (fs.statSync(src).isDirectory()) {
    for (const entry of fs.readdirSync(src)) {
      installTree(path.join(src, entry), path.join(dest, entry), rel ? `${rel}/${entry}` : entry, s);
    }
  } else {
    installFile(src, dest, rel, s);
  }
}

function printList(title, items) {
  if (!items.length) return;
  console.log(`${title}:`);
  for (const i of items) console.log(`  - ${i}`);
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
  const entries = fs.readdirSync(DIST_DIR);

  // Enforce the "refuses to overwrite" guarantee: on `init codex` (overwrite=false),
  // check every top-level dist entry against the target project. If ANY of them
  // already exists in the target, abort with the full list — don't silently
  // clobber the user's hand-written AGENTS.md, README.md, or any pre-existing
  // .codex/ config. The user must either delete the conflict or run `update codex`.
  if (!overwrite) {
    const conflicts = [];
    for (const entry of entries) {
      if (fs.existsSync(path.join(cwd, entry))) {
        conflicts.push(entry);
      }
    }
    if (conflicts.length > 0) {
      console.error('ERROR: refusing to overwrite existing project files.');
      console.error('');
      console.error('The following entries already exist in this project:');
      for (const c of conflicts) {
        console.error(`  ${c}`);
      }
      console.error('');
      console.error('Either back up / delete the conflicting entries, or run `update codex`');
      console.error('to upgrade while keeping your project settings.');
      process.exit(1);
    }
  }

  console.log(`pai-orbit (Codex v${VERSION}): installing into ${cwd} ...\n`);

  const s = newSummary();
  for (const entry of entries) {
    installTree(path.join(DIST_DIR, entry), path.join(cwd, entry), entry, s);
  }

  console.log(`pai-orbit (Codex) ${overwrite ? 'updated' : 'installed'} — ${s.files} file(s) processed from dist/codex/.`);
  console.log('');
  if (overwrite) {
    printList('Preserved (project settings kept)', s.preserved);
    printList('Added (new sections/tables)', s.added);
    printList('Migrated', s.migrated);
    printList('Conflicts (resolve manually)', s.conflicts);
    printList('Backups', s.backups);
    printList('Notes', s.warnings);
    if (s.hooksChanged.length) {
      console.log('');
      console.log(`${s.hooksChanged.length} hook file(s) changed — run \`/hooks\` in Codex to re-trust them:`);
      for (const h of s.hooksChanged) console.log(`  - ${h}`);
    }
    console.log('');
  }
  console.log('Next steps:');
  console.log('  1. Launch \`codex\` in this directory. Trust the project when prompted.');
  console.log('  2. Run \`/hooks\` to review and trust the 4 registered hooks.');
  console.log('  3. Run \`$setup\` to fill in .codex/pai-orbit-config.md, .codex/team.md,');
  console.log('     and the lint hooks\' repo= configuration (first install only; updates keep them).');
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
      // `migrate` and `update` are aliases: upgrade while preserving project settings.
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
