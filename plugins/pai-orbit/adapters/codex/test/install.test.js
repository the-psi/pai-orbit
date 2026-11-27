// Regression tests for `update codex` preserving project settings (#76).
// Run: node --test plugins/pai-orbit/adapters/codex/test/install.test.js
// Lint cases put a fake ruff/eslint on PATH that writes a marker file, so they
// prove lint actually ran after an update — not just that file contents match.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const INSTALL = path.resolve(__dirname, '..', 'install.js');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-codex-'));
}

function install(cwd, cmd) {
  const r = spawnSync('node', [INSTALL, cmd, 'codex'], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

function edit(file, fn) {
  fs.writeFileSync(file, fn(fs.readFileSync(file, 'utf8')));
}

// Project with init done and both lint hooks configured to point at the project.
function configuredProject() {
  const p = tmp();
  install(p, 'init');
  edit(path.join(p, '.codex/hooks/lint-python.sh'), (t) => t.replace('repo=""', `repo="${p}"`));
  edit(path.join(p, '.codex/hooks/lint-ts.sh'), (t) => t.replace('repo=""', `repo="${p}"`));
  return p;
}

// Fake linters that record their args to $MARKER.
function fakeBin() {
  const bin = tmp();
  for (const name of ['ruff', 'eslint']) {
    const f = path.join(bin, name);
    fs.writeFileSync(f, '#!/bin/sh\necho "$@" >> "$MARKER"\n');
    fs.chmodSync(f, 0o755);
  }
  return bin;
}

// Feed the Codex wrapper a PostToolUse payload; return what the fake linter saw.
function lintRuns(project, wrapper, file) {
  const marker = path.join(tmp(), 'marker');
  const payload = JSON.stringify({ tool_response: `Success. Updated the following files:\nM ${file}` });
  spawnSync('bash', [path.join(project, '.codex/hooks', wrapper)], {
    input: payload,
    env: { ...process.env, PATH: `${fakeBin()}:${process.env.PATH}`, MARKER: marker },
    encoding: 'utf8',
  });
  return fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : '';
}

function snapshot(dir) {
  const out = {};
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else out[path.relative(dir, f)] = crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
    }
  })(dir);
  return out;
}

test('configured upgrade keeps settings, refreshes plugin files, lint still runs (AC-1..3)', () => {
  const p = configuredProject();
  fs.appendFileSync(path.join(p, '.codex/team.md'), '\n| Alice | dev |\n');
  edit(path.join(p, '.codex/config.toml'), (t) => t.replace('max_threads = 4', 'max_threads = 9'));
  const skill = path.join(p, '.agents/skills/build/SKILL.md');
  const shipped = fs.readFileSync(skill, 'utf8');
  fs.writeFileSync(skill, 'stale old release');

  install(p, 'update');

  assert.match(fs.readFileSync(path.join(p, '.codex/team.md'), 'utf8'), /Alice/);
  assert.match(fs.readFileSync(path.join(p, '.codex/config.toml'), 'utf8'), /max_threads = 9/);
  assert.equal(fs.readFileSync(skill, 'utf8'), shipped, 'plugin-owned files must be refreshed');
  assert.match(lintRuns(p, 'lint-python-wrapper.sh', path.join(p, 'a.py')), /a\.py/);
  assert.match(lintRuns(p, 'lint-ts-wrapper.sh', path.join(p, 'a.ts')), /a\.ts/);
});

test('repeat update changes nothing and stays quiet (AC-7)', () => {
  const p = configuredProject();
  fs.writeFileSync(path.join(p, 'AGENTS.md'), 'mine');
  install(p, 'update');
  const before = snapshot(p);
  const out = install(p, 'update');
  assert.deepEqual(snapshot(p), before);
  assert.doesNotMatch(out, /re-trust/);
  assert.doesNotMatch(out, /Migrated|Added/);
});

test('inline repo= install from an older release migrates; old script backed up (AC-5)', () => {
  const p = configuredProject();
  const ts = path.join(p, '.codex/hooks/lint-ts.sh');
  fs.appendFileSync(ts, '\n# line from an older release\n');

  const out = install(p, 'update');

  assert.match(fs.readFileSync(ts, 'utf8'), new RegExp(`repo="${p}"`));
  assert.doesNotMatch(fs.readFileSync(ts, 'utf8'), /older release/, 'new script body installed');
  assert.match(fs.readFileSync(`${ts}.pai-orbit-old`, 'utf8'), /older release/);
  assert.match(out, /lint-ts\.sh\.pai-orbit-old/);
  assert.match(lintRuns(p, 'lint-ts-wrapper.sh', path.join(p, 'a.ts')), /a\.ts/);
});

test('missing CONFIGURE markers: new script installed, old backed up, warned', () => {
  const p = configuredProject();
  const py = path.join(p, '.codex/hooks/lint-python.sh');
  fs.writeFileSync(py, '#!/usr/bin/env bash\nexit 0\n');
  const out = install(p, 'update');
  assert.match(fs.readFileSync(py, 'utf8'), /--- CONFIGURE/);
  assert.equal(fs.readFileSync(`${py}.pai-orbit-old`, 'utf8'), '#!/usr/bin/env bash\nexit 0\n');
  assert.match(out, /markers missing/);
});

test('new template section/table appended, values untouched, new keys reported (AC-6)', () => {
  const p = configuredProject();
  const cfg = path.join(p, '.codex/pai-orbit-config.md');
  edit(cfg, (t) => t.slice(0, t.indexOf('## MCP')).replace('Type:', 'Type: MY-BOARD\n# was:'));
  const toml = path.join(p, '.codex/config.toml');
  edit(toml, (t) => t.replace(/^max_depth = 2\n/m, ''));

  const out = install(p, 'update');

  const after = fs.readFileSync(cfg, 'utf8');
  assert.match(after, /MY-BOARD/);
  assert.match(after, /^## MCP/m);
  assert.match(after, /fill this section in/);
  assert.doesNotMatch(fs.readFileSync(toml, 'utf8'), /max_depth/, 'existing file not rewritten for a new key');
  assert.match(out, /new key available: max_depth/);
});

test('AGENTS.md / README.md conflicts keep the developer file, write side-file (AC-4)', () => {
  const p = configuredProject();
  fs.writeFileSync(path.join(p, 'AGENTS.md'), 'project rules');
  const out = install(p, 'update');
  assert.equal(fs.readFileSync(path.join(p, 'AGENTS.md'), 'utf8'), 'project rules');
  assert.match(fs.readFileSync(path.join(p, 'AGENTS.md.pai-orbit-new'), 'utf8'), /\S/);
  assert.match(out, /AGENTS\.md differs/);
  assert.doesNotMatch(out, /README\.md differs/, 'identical README is "unchanged", not a conflict');
  assert.ok(!fs.existsSync(path.join(p, 'README.md.pai-orbit-new')));
});

test('summary lists categories; re-trust only when a hook changed (AC-8, AC-12)', () => {
  const p = configuredProject();
  edit(path.join(p, '.codex/hooks/bash-guard.sh'), (t) => t + '\n# tampered\n');
  const out = install(p, 'update');
  assert.match(out, /Preserved/);
  assert.match(out, /1 hook file\(s\) changed.*\/hooks/);
  assert.match(out, /bash-guard\.sh/);
});

test('setup-append ships the re-run guard (AC-9, text check only)', () => {
  const guard = fs.readFileSync(path.resolve(__dirname, '..', 'setup-append.md'), 'utf8');
  assert.match(guard, /never overwrite/i);
});
