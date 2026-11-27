'use strict';
// A small client for the GitLab REST API (v4), used by the GitLab board and code host.
// It uses Node's built-in fetch, so the factory needs no GitLab library and no `glab` CLI, and it
// works the same against gitlab.com and a self-hosted GitLab.

class GitLabError extends Error {
  /** @param {string} message @param {number} status @param {*} body */
  constructor(message, status, body) {
    super(message);
    this.name = 'GitLabError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Where a repository lives, from its clone URL.
 *   https://git.example.com/group/sub/app.git  ->  { baseUrl: 'https://git.example.com', project: 'group/sub/app' }
 *   git@git.example.com:group/app.git          ->  { baseUrl: 'https://git.example.com', project: 'group/app' }
 * A GitLab served under a path (https://host/gitlab/...) cannot be told apart from a group, so
 * such a setup names `gitlab.apiUrl` and `gitlab.project` in the config instead.
 */
function parseRepoUrl(url) {
  const text = String(url || '').trim();
  let host;
  let pathPart;
  let scheme = 'https';
  const scp = text.match(/^(?:[^@/\s]+@)?([^:/\s]+):(?!\/\/)(.+)$/);
  if (/^(https?|ssh):\/\//i.test(text)) {
    let u;
    try { u = new URL(text); } catch { throw new Error(`repo.url is not a valid URL: ${url}`); }
    if (/^http/i.test(u.protocol)) {
      scheme = u.protocol.replace(':', '');
      host = u.host; // keeps a non-default port
    } else {
      host = u.hostname; // the ssh port is not the web port
    }
    pathPart = u.pathname;
  } else if (scp) {
    host = scp[1];
    pathPart = scp[2];
  } else {
    throw new Error(`repo.url is not a GitLab repository URL: ${url}`);
  }
  const project = pathPart.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.git$/i, '');
  if (!host || !/^[^/\s]+(\/[^/\s]+)+$/.test(project)) {
    throw new Error(`repo.url does not name a GitLab project (group/name): ${url}`);
  }
  return { baseUrl: `${scheme}://${host}`, project };
}

class GitLabApi {
  /**
   * @param {{baseUrl: string, project: string, token?: string, fetch?: Function, timeoutMs?: number}} opts
   *   `baseUrl` is the site (https://git.example.com) or the API root (…/api/v4).
   */
  constructor(opts) {
    if (!opts || !opts.baseUrl) throw new Error('GitLabApi needs a baseUrl');
    if (!opts.project) throw new Error('GitLabApi needs a project (group/name)');
    const base = String(opts.baseUrl).replace(/\/+$/, '');
    this.apiUrl = /\/api\/v\d+$/.test(base) ? base : `${base}/api/v4`;
    this.siteUrl = this.apiUrl.replace(/\/api\/v\d+$/, '');
    this.project = opts.project;
    this.token = opts.token || '';
    this.fetch = opts.fetch || globalThis.fetch;
    this.timeoutMs = opts.timeoutMs || 30000;
    if (typeof this.fetch !== 'function') throw new Error('GitLabApi needs fetch (Node 18 or newer)');
  }

  /** `/projects/<encoded path><suffix>` */
  p(suffix = '') {
    return `/projects/${encodeURIComponent(this.project)}${suffix}`;
  }

  _url(path, query) {
    const url = new URL(this.apiUrl + path);
    for (const [k, v] of Object.entries(query || {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    return url;
  }

  /**
   * One request. Resolves to `{status, data, headers}`; rejects with GitLabError on a status
   * outside 2xx. The token never appears in an error message.
   */
  async request(method, path, opts = {}) {
    if (!this.token) throw new GitLabError('No GitLab token is set (see gitlab.tokenEnv in the config)', 0, null);
    const headers = { 'PRIVATE-TOKEN': this.token, Accept: 'application/json' };
    let body;
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    const what = `GitLab ${method} ${path}`;
    let res;
    try {
      res = await this.fetch(this._url(path, opts.query), {
        method, headers, body, signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new GitLabError(`${what} did not complete: ${err && err.message}`, 0, null);
    }
    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    if (!res.ok) {
      let detail = '';
      if (data && typeof data === 'object') detail = JSON.stringify(data.message || data.error || data).slice(0, 300);
      else if (typeof data === 'string') detail = data.slice(0, 300);
      throw new GitLabError(`${what} failed (HTTP ${res.status})${detail ? `: ${detail}` : ''}`, res.status, data);
    }
    return { status: res.status, data, headers: res.headers };
  }

  async get(path, query) { return (await this.request('GET', path, { query })).data; }

  async post(path, body) { return (await this.request('POST', path, { body })).data; }

  async put(path, body) { return (await this.request('PUT', path, { body })).data; }

  /** Every page of a list endpoint, as one array. Stops after `maxPages` as a safety limit. */
  async all(path, query = {}, maxPages = 50) {
    const out = [];
    let page = '1';
    for (let i = 0; i < maxPages && page; i += 1) {
      const res = await this.request('GET', path, { query: { per_page: 100, ...query, page } });
      if (!Array.isArray(res.data)) throw new GitLabError(`GitLab GET ${path} did not return a list`, res.status, res.data);
      out.push(...res.data);
      page = (res.headers && res.headers.get && res.headers.get('x-next-page')) || '';
    }
    return out;
  }
}

/** Issue and merge request numbers go into URLs; accept digits only. */
function iid(id, what) {
  const n = String(id);
  if (!/^\d+$/.test(n)) throw new Error(`Invalid GitLab ${what} number: ${JSON.stringify(id)}`);
  return n;
}

module.exports = { GitLabApi, GitLabError, parseRepoUrl, iid };
