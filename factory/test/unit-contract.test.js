'use strict';
// Structural tests for the unattended contract and the single-source rule: the factory invokes
// orbit modes, it never carries a copy of their text.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FACTORY = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(FACTORY, '..');
const SCHEMA_FILE = path.join(FACTORY, 'contract', 'stage-result.schema.json');
const CONTRACT_FILE = path.join(FACTORY, 'contract', 'unattended.md');
const MODES_DIR = path.join(REPO_ROOT, 'plugins', 'pai-orbit', 'core', 'modes');
const STATUSES = ['done', 'needs_input', 'declined', 'failed'];

/** Every file under `dir`, recursively. */
function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/** The first non-empty line of each orbit mode, e.g. "You are now in GROOM MODE." */
function modeFirstLines() {
  return fs.readdirSync(MODES_DIR).filter((f) => f.endsWith('.md')).sort().map((f) => {
    const first = fs.readFileSync(path.join(MODES_DIR, f), 'utf8').split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0);
    return { file: f, line: first };
  });
}

// ---- the result schema ----

test('stage-result.schema.json is valid JSON', () => {
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(SCHEMA_FILE, 'utf8')));
});

test('stage-result.schema.json is a draft-07 object schema', () => {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_FILE, 'utf8'));
  assert.equal(schema.$schema, 'http://json-schema.org/draft-07/schema#');
  assert.equal(schema.type, 'object');
});

test('stage-result.schema.json requires status and summary', () => {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_FILE, 'utf8'));
  assert.ok(Array.isArray(schema.required));
  assert.ok(schema.required.includes('status'));
  assert.ok(schema.required.includes('summary'));
  assert.equal(schema.properties.summary.type, 'string');
});

test('the status enum is exactly done, needs_input, declined, failed', () => {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_FILE, 'utf8'));
  assert.equal(schema.properties.status.type, 'string');
  assert.deepEqual(schema.properties.status.enum, STATUSES);
});

test('the schema describes every field the contract tells the agent to return', () => {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_FILE, 'utf8'));
  for (const field of ['status', 'summary', 'questions', 'assumptions', 'artifacts', 'reason', 'size']) {
    assert.ok(schema.properties[field], `schema has ${field}`);
  }
  assert.deepEqual(schema.properties.questions.items.required, ['question', 'why']);
  assert.deepEqual(schema.properties.assumptions.items.required, ['decision', 'basis']);
  for (const key of ['files', 'changedLines', 'services', 'sensitiveAreas']) {
    assert.ok(schema.properties.size.properties[key], `size has ${key}`);
  }
});

// ---- the unattended contract ----

test('unattended.md is the "Unattended contract" and is not empty', () => {
  const text = fs.readFileSync(CONTRACT_FILE, 'utf8');
  assert.ok(text.trim().length > 200);
  assert.match(text, /Unattended contract/);
});

for (const status of STATUSES) {
  test(`unattended.md mentions the status ${status}`, () => {
    const text = fs.readFileSync(CONTRACT_FILE, 'utf8');
    assert.ok(text.includes(`\`${status}\``) || text.includes(`"${status}"`), `the contract must name the status ${status}`);
  });
}

test('unattended.md mentions decisions-log.md', () => {
  assert.ok(fs.readFileSync(CONTRACT_FILE, 'utf8').includes('decisions-log.md'));
});

test('unattended.md names every result field of the schema, and no other', () => {
  const text = fs.readFileSync(CONTRACT_FILE, 'utf8');
  const schema = JSON.parse(fs.readFileSync(SCHEMA_FILE, 'utf8'));
  for (const field of Object.keys(schema.properties)) {
    assert.ok(text.includes(`\`${field}\``), `the contract explains the result field ${field}`);
  }
});

test('unattended.md forbids merging, pushing and opening pull requests', () => {
  const text = fs.readFileSync(CONTRACT_FILE, 'utf8');
  assert.match(text, /Merge anything/i);
  assert.match(text, /Push, pull request/i);
  assert.match(text, /Never do these/i);
});

// ---- the single-source rule ----

test('the orbit modes can be read and each starts with its mode declaration', () => {
  const modes = modeFirstLines();
  assert.ok(modes.length >= 10, `expected the orbit modes under ${MODES_DIR}, found ${modes.length}`);
  for (const m of modes) {
    assert.ok(m.line && m.line.length >= 10, `${m.file} has a usable first line`);
  }
  const groom = modes.find((m) => m.file === 'groom.md');
  assert.ok(groom, 'groom.md exists');
  assert.match(groom.line, /GROOM MODE/);
});

for (const sub of ['src', 'contract', 'bin', 'config']) {
  test(`no file under factory/${sub} contains the first line of an orbit mode`, () => {
    const modes = modeFirstLines();
    const files = filesUnder(path.join(FACTORY, sub));
    if (sub === 'src' || sub === 'contract') assert.ok(files.length > 0, `factory/${sub} has files`);
    const copies = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const m of modes) {
        if (text.includes(m.line)) copies.push(`${path.relative(REPO_ROOT, file)} contains the first line of ${m.file}: ${JSON.stringify(m.line)}`);
      }
    }
    assert.deepEqual(copies, [], 'mode text must stay in plugins/pai-orbit/core/modes and be invoked, not copied');
  });
}

test('no file under factory/src or factory/contract declares a mode headspace of its own', () => {
  const offenders = [];
  for (const sub of ['src', 'contract']) {
    for (const file of filesUnder(path.join(FACTORY, sub))) {
      if (/You are now in [A-Z ]+ MODE/.test(fs.readFileSync(file, 'utf8'))) offenders.push(path.relative(REPO_ROOT, file));
    }
  }
  assert.deepEqual(offenders, []);
});

test('the built plugin the factory runs carries the same modes as core', () => {
  const dist = path.join(REPO_ROOT, 'plugins', 'pai-orbit', 'dist', 'claude-code');
  assert.ok(fs.existsSync(path.join(dist, '.claude-plugin', 'plugin.json')));
  const distText = filesUnder(dist).filter((f) => f.endsWith('.md')).map((f) => fs.readFileSync(f, 'utf8'));
  for (const mode of ['groom', 'design', 'build', 'test', 'playwright', 'review', 'release']) {
    const first = modeFirstLines().find((m) => m.file === `${mode}.md`);
    assert.ok(first, `core has ${mode}.md`);
    assert.ok(distText.some((text) => text.includes(first.line)), `the built plugin contains the ${mode} mode the factory invokes`);
  }
});
