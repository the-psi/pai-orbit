'use strict';
// The protected-area check is decided from file paths, not from the agent's opinion of whether
// the work is "sensitive". Found by the first Docker run: a billing library's ordinary feature
// was refused because the agent, asked to judge, called it "billing".

const test = require('node:test');
const assert = require('node:assert/strict');
const { globToRegExp, sensitiveHits } = require('../src/factory');
const { DEFAULTS } = require('../src/config');

const PATTERNS = DEFAULTS.suitability.sensitivePaths;
const hit = (p) => sensitiveHits([p], PATTERNS).length > 0;

test('files inside a protected folder are caught at any depth', () => {
  for (const p of ['src/auth/login.js', 'auth/index.js', 'services/api/src/payments/charge.ts',
    'db/migrations/001.sql', '.github/workflows/ci.yml', 'infra/main.tf', 'deploy/terraform/vpc.tf',
    '.claude/settings.json', 'Dockerfile', 'docker/Dockerfile.prod', 'app/billing/invoice.js',
    'src/sessions/store.js', 'lib/secrets/vault.js', 'pkg/crypto/aes.go']) {
    assert.ok(hit(p), `${p} should be protected`);
  }
});

test('ordinary files are not caught, even when a word like billing is in the name', () => {
  for (const p of ['src/index.js', 'src/discount.js', 'test/discount.test.js', 'src/billing-report.js',
    'docs/features/bulk-discount/design.md', 'docs/domain/pricing-rules.md', 'src/author.js',
    'src/payments.js', 'README.md', 'package.json']) {
    assert.ok(!hit(p), `${p} should not be protected`);
  }
});

test('Windows separators and a leading ./ are normalised', () => {
  assert.ok(hit('src\\auth\\login.js'));
  assert.ok(hit('./.github/workflows/ci.yml'));
});

test('the report names the file and the pattern', () => {
  assert.deepEqual(sensitiveHits(['src/a.js', 'src/auth/x.js'], PATTERNS), ['src/auth/x.js matches **/auth/**']);
});

test('glob rules: ** crosses folders, * does not, other characters are literal', () => {
  assert.ok(globToRegExp('**/x/**').test('a/b/x/c/d.js'));
  assert.ok(globToRegExp('**/x/**').test('x/d.js'));
  assert.ok(!globToRegExp('**/x/**').test('ax/d.js'));
  assert.ok(globToRegExp('src/*.js').test('src/a.js'));
  assert.ok(!globToRegExp('src/*.js').test('src/sub/a.js'));
  assert.ok(!globToRegExp('a.b').test('aXb'));
});
