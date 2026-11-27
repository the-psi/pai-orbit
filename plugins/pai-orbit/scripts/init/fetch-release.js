#!/usr/bin/env node
// pai-orbit — fetch an adapter's dist from its GitHub Release asset.
//
// Usage: node fetch-release.js <agent>
//   Downloads  https://github.com/<owner>/<repo>/releases/download/v<version>/pai-orbit-<agent>.tar.gz
//   (owner/repo from package.json `repository`, version from package.json `version`),
//   unpacks it into a fresh temp directory and prints that directory on stdout.
//   Exit 0 on success; non-zero with a one-line reason on stderr on any failure,
//   so callers can fall back to the bundled dist/.
//
// Why: release-asset downloads are counted per file by GitHub (download_count),
// which is how installs are tracked per coding agent. The npx tarball itself
// (codeload.github.com) is not counted anywhere.
//
// Node built-ins only (https, zlib, a minimal tar reader) — no new dependencies.
//
// Env overrides (testing / escape hatches):
//   PAI_ORBIT_OFFLINE=1          skip the download, fail immediately (→ bundled files)
//   PAI_ORBIT_RELEASE_BASE=<url> replace https://github.com/<owner>/<repo>/releases/download

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const zlib = require('node:zlib');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 5;
const AGENTS = new Set(['codex', 'copilot']);

function fail(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

function readPackage() {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const repo = typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository || {}).url || '';
  const m = repo.match(/github\.com[/:]([^/]+)\/([^/.#]+)/);
  if (!m) throw new Error(`cannot parse GitHub repo from package.json repository: ${repo}`);
  return { version: pkg.version, owner: m[1], repo: m[2] };
}

function download(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (!url.startsWith('https://')) return reject(new Error(`refusing non-https URL: ${url}`));
    const req = https.get(url, { headers: { 'User-Agent': 'pai-orbit-installer' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirects >= MAX_REDIRECTS) return reject(new Error('too many redirects'));
        return resolve(download(new URL(res.headers.location, url).toString(), redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error(`timed out after ${TIMEOUT_MS / 1000}s`)));
    req.on('error', reject);
  });
}

function cstr(buf, start, len) {
  const s = buf.subarray(start, start + len);
  const nul = s.indexOf(0);
  return s.subarray(0, nul === -1 ? s.length : nul).toString('utf8');
}

// Minimal tar reader: ustar/GNU regular files + directories, GNU long names (L)
// and pax `path=` records (x). Anything else (symlinks, devices) is skipped.
function untar(buf, destRoot) {
  let offset = 0;
  let longName = null;
  let files = 0;
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const size = parseInt(cstr(header, 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(header[156] || 48);
    const prefix = cstr(header, 345, 155);
    let name = cstr(header, 0, 100);
    if (prefix) name = `${prefix}/${name}`;
    const body = buf.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;

    if (type === 'L') { longName = cstr(body, 0, body.length); continue; }
    if (type === 'x') {
      const m = body.toString('utf8').match(/\d+ path=([^\n]*)\n/);
      if (m) longName = m[1];
      continue;
    }
    if (type === 'g') continue;
    if (longName) { name = longName; longName = null; }

    const rel = path.posix.normalize(name.replace(/^\.\//, ''));
    if (!rel || rel === '.' ) continue;
    if (rel.startsWith('..') || path.posix.isAbsolute(rel)) throw new Error(`unsafe path in archive: ${name}`);
    const dest = path.join(destRoot, ...rel.split('/'));

    if (type === '5') {
      fs.mkdirSync(dest, { recursive: true });
    } else if (type === '0' || type === '\0' || type === '7') {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, body);
      const mode = parseInt(cstr(header, 100, 8).trim() || '0', 8);
      if (mode & 0o111) { try { fs.chmodSync(dest, 0o755); } catch { /* Windows */ } }
      files += 1;
    }
  }
  return files;
}

async function main() {
  const agent = process.argv[2];
  if (!AGENTS.has(agent)) fail(`unknown agent '${agent}' (expected codex|copilot)`);
  if (process.env.PAI_ORBIT_OFFLINE === '1') fail('PAI_ORBIT_OFFLINE=1');

  const { version, owner, repo } = readPackage();
  const base = process.env.PAI_ORBIT_RELEASE_BASE || `https://github.com/${owner}/${repo}/releases/download`;
  const url = `${base}/v${version}/pai-orbit-${agent}.tar.gz`;

  const gz = await download(url);
  const tar = zlib.gunzipSync(gz);
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), `pai-orbit-${agent}-v${version}-`));
  const files = untar(tar, dest);
  if (files === 0) throw new Error('archive contained no files');
  process.stdout.write(dest);
}

main().catch((err) => fail(err.message));
