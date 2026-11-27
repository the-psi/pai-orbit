'use strict';
// The setup page: a form that turns a handful of answers into the files a deployment needs.
// `orbit-factory setup` serves it. It needs no config, because making one is its job.
//
// People type credentials into this page, so:
//   - every API call must carry the setup code printed in the terminal at start
//   - a call from another site's page is refused (Origin check)
//   - credentials are never logged and never kept in memory after the response
//   - it writes files only into the one folder it was started with (--out), and never over an
//     existing file unless told to

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const build = require('./build');
const { GitLabApi, parseRepoUrl } = require('../gitlab-api');
const { GitLabCodeHost } = require('../codehosts/gitlab');

const PAGE = fs.readFileSync(path.join(__dirname, 'page.html'), 'utf8');
const MAX_BODY = 64 * 1024;

function same(a, b) {
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());
}

function send(res, status, type, body) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'",
  });
  res.end(body);
}

const json = (res, status, value) => send(res, status, 'application/json; charset=utf-8', JSON.stringify(value));

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('The request is too large.'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('The request is not valid JSON.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

/** The token was never tried: the platform could not be reached from where this page runs. */
function noNetwork(platform, address) {
  return `Could not reach ${platform} (${address}) from where the setup page is running. This is a network problem, not a problem with the token: the token was never checked. `
    + 'If the setup page runs in Docker, check that containers have internet access (a VPN or network change often needs a Docker restart). You can skip this test; the files are made the same way.';
}

/**
 * Ask the platform whether the token works for this repository and whose it is.
 * Returns only words about the result; the token is never echoed.
 */
async function testConnection(form, secrets, fetchImpl) {
  const f = build.normalise(form);
  const token = String((secrets && secrets.token) || '').trim();
  if (!f.repoUrl) return { ok: false, lines: ['Enter the repository URL first.'] };
  if (!token) return { ok: false, lines: [`Enter the ${f.platform === 'github' ? 'GitHub' : 'GitLab'} token first.`] };
  const lines = [];
  let ok = true;
  const fail = (line) => { ok = false; lines.push(line); };

  if (f.platform === 'gitlab') {
    let where;
    try { where = parseRepoUrl(f.repoUrl); } catch (err) { return { ok: false, lines: [err.message] }; }
    const api = new GitLabApi({ ...where, token, fetch: fetchImpl, timeoutMs: 15000 });
    try {
      await api.get('/user');
    } catch (err) {
      if (!err.status) return { ok: false, lines: [noNetwork('GitLab', where.baseUrl)] };
    }
    const access = await new GitLabCodeHost({ api }).checkAccess();
    if (!access.ok) fail(access.detail);
    else lines.push(`The token works: ${access.detail}.`);
    if (access.ok && f.botUser && access.user !== f.botUser) fail(`The token belongs to "${access.user}", but the factory's account name is "${f.botUser}". They must be the same.`);
    return { ok, lines };
  }

  const m = f.repoUrl.match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  if (!m) return { ok: false, lines: ['This does not look like a GitHub repository URL.'] };
  const call = async (url) => {
    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'orbit-factory-setup' },
      signal: AbortSignal.timeout(15000),
    });
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    return { status: res.status, data };
  };
  try {
    const repo = await call(`https://api.github.com/repos/${m[1]}/${m[2]}`);
    if (repo.status === 401) return { ok: false, lines: ['GitHub did not accept the token.'] };
    if (repo.status === 404 || repo.status === 403) return { ok: false, lines: [`The token cannot see the repository ${m[1]}/${m[2]}.`] };
    if (repo.status !== 200) return { ok: false, lines: [`GitHub answered with status ${repo.status}.`] };
    const perms = (repo.data && repo.data.permissions) || {};
    if (perms.push) lines.push(`The token can read and write ${m[1]}/${m[2]}.`);
    else fail(`The token can see ${m[1]}/${m[2]} but cannot write to it. The factory needs to push branches and open pull requests.`);
    const user = await call('https://api.github.com/user');
    const login = user.status === 200 && user.data ? user.data.login : '';
    if (login && f.botUser && login !== f.botUser) fail(`The token belongs to "${login}", but the factory's account name is "${f.botUser}". They must be the same.`);
    else if (login) lines.push(`The token belongs to ${login}.`);
    else lines.push('GitHub did not say whose token this is (some token types do not), so the account name was not checked.');
  } catch (err) {
    return { ok: false, lines: [noNetwork('GitHub', 'https://api.github.com')] };
  }
  return { ok, lines };
}

/**
 * @param {{code: string, outDir?: string, image?: string, fetch?: Function, log?: Function}} opts
 *   `code` is required on every API call. `outDir` allows "Save to folder". `image` prefills
 *   the image field (a published image knows its own address).
 */
function createSetupServer(opts) {
  if (!opts || !opts.code) throw new Error('The setup page needs a setup code');
  const outDir = opts.outDir ? path.resolve(opts.outDir) : '';
  const fetchImpl = opts.fetch || globalThis.fetch;

  const authorised = (req) => {
    const given = req.headers['x-setup-code'];
    if (typeof given !== 'string' || !same(given, opts.code)) return false;
    // A page on another site cannot set the header without a preflight we never answer, and its
    // Origin would not be ours.
    const origin = req.headers.origin;
    if (origin) {
      try { if (new URL(origin).host !== req.headers.host) return false; } catch { return false; }
    }
    return true;
  };

  const save = (files, overwrite) => {
    if (!outDir) return { status: 400, body: { error: 'This setup page was started without a folder to save into. Download the files instead.' } };
    try { fs.mkdirSync(outDir, { recursive: true }); } catch (err) {
      return { status: 500, body: { error: `Cannot use the folder: ${err.message}` } };
    }
    const existing = files.filter((f) => fs.existsSync(path.join(outDir, f.name))).map((f) => f.name);
    if (existing.length && !overwrite) return { status: 409, body: { error: 'Some files are already there.', existing } };
    const written = [];
    try {
      for (const f of files) {
        // Names come from build.js, never from the request, so they cannot leave the folder.
        fs.writeFileSync(path.join(outDir, f.name), f.content, { mode: f.secret ? 0o600 : 0o644 });
        written.push(f.name);
      }
    } catch (err) {
      return { status: 500, body: { error: `Could not write ${files[written.length].name}: ${err.message}. Download the files instead.`, written } };
    }
    return { status: 200, body: { written, folder: outDir } };
  };

  return http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://setup.local'); } catch { return send(res, 400, 'text/plain; charset=utf-8', 'Bad request'); }
    try {
      if (req.method === 'GET' && url.pathname === '/') return send(res, 200, 'text/html; charset=utf-8', PAGE);
      if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, 'text/plain; charset=utf-8', 'ok');
      if (!url.pathname.startsWith('/api/')) return send(res, 404, 'text/plain; charset=utf-8', 'Not found');
      if (!authorised(req)) return json(res, 401, { error: 'The setup code is missing or wrong. Use the address printed in the terminal.' });

      if (req.method === 'GET' && url.pathname === '/api/options') {
        return json(res, 200, { ...build.options(), canSave: Boolean(outDir), folder: outDir, image: String(opts.image || '') });
      }
      if (req.method !== 'POST') return json(res, 405, { error: 'Use POST.' });
      const body = await readJson(req);
      const form = body.form || {};
      const secrets = body.secrets || {};

      if (url.pathname === '/api/check') {
        return json(res, 200, { problems: [...build.check(form), ...build.checkSecrets(form, secrets)] });
      }
      if (url.pathname === '/api/test') {
        return json(res, 200, await testConnection(form, secrets, fetchImpl));
      }
      if (url.pathname === '/api/build' || url.pathname === '/api/save') {
        const problems = [...build.check(form), ...build.checkSecrets(form, secrets)];
        if (problems.length) return json(res, 422, { problems });
        const out = build.buildAll(form, secrets);
        if (url.pathname === '/api/build') return json(res, 200, out);
        const result = save(out.files, body.overwrite === true);
        if (result.status === 200 && opts.log) opts.log(`setup: wrote ${result.body.written.join(', ')} to ${outDir}`);
        return json(res, result.status, result.body);
      }
      return json(res, 404, { error: 'Not found.' });
    } catch (err) {
      // Never put the request body in an error: it may hold credentials.
      return json(res, err.status || 500, { error: err.status ? err.message : 'Something went wrong on the setup page.' });
    }
  });
}

/** Where the setup page listens. Inside the container it must accept the published port. */
function setupListenPlan(flags = {}, env = process.env) {
  const host = flags.host || env.FACTORY_SETUP_HOST || (env.FACTORY_SANDBOXED ? '0.0.0.0' : '127.0.0.1');
  const port = Number(flags.port || env.FACTORY_SETUP_PORT || 8080);
  return { host, port };
}

function newCode() {
  return crypto.randomBytes(18).toString('base64url');
}

module.exports = { createSetupServer, setupListenPlan, newCode, testConnection };
