'use strict';
// Step 2b — Live board column discovery.
//
// Mirrors `core/modes/setup.md` Step 2b: rather than asking the user to type
// board column names, we query the live board via CLI tools (glab, gh, linear)
// and confirm what we found. Each backend degrades gracefully:
//
//   - CLI binary missing → return { available: false, columns: [], reason }
//     Caller falls back to asking the user manually.
//   - API call fails → same fall-back.
//   - CLI present but empty result → prompt the user with the fall-back path.
//
// All shell commands use execFileSync with argv arrays so quoting / injection
// are handled by Node, not the shell.

const { execFileSync } = require('node:child_process');

function binaryAvailable(bin) {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function runOrNull(bin, args, extra = {}) {
  try {
    return execFileSync(bin, args, {
      encoding: 'utf8',
      timeout: 15_000,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...extra,
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// GitLab
// ---------------------------------------------------------------------------

// Given a URL like https://git.thepsi.com/foo/bar/... return the URL-encoded
// namespace/project string for the GitLab API path.
function extractGitLabProject(boardUrl) {
  if (!boardUrl) return null;
  try {
    const u = new URL(boardUrl);
    // Strip leading '/' and any trailing '/-/boards' or similar path segments.
    const parts = u.pathname.replace(/^\//, '').split('/-/')[0].split('/');
    if (!parts.length) return null;
    // Encode with %2F path separator per GitLab REST convention.
    return parts.join('%2F');
  } catch {
    return null;
  }
}

function discoverGitLab(boardUrl) {
  if (!binaryAvailable('glab')) {
    return { available: false, reason: 'glab CLI not on PATH — install glab or provide columns manually.' };
  }
  const projectPath = extractGitLabProject(boardUrl);
  if (!projectPath) {
    return { available: false, reason: `could not parse a GitLab project path from board URL: ${boardUrl}` };
  }

  const boardsRaw = runOrNull('glab', ['api', `/projects/${projectPath}/boards`]);
  if (!boardsRaw) {
    return { available: false, reason: `glab api /projects/${projectPath}/boards failed — check auth (glab auth status) and permissions.` };
  }

  let boards;
  try { boards = JSON.parse(boardsRaw); } catch {
    return { available: false, reason: 'glab returned unparseable JSON for boards.' };
  }

  if (!Array.isArray(boards) || boards.length === 0) {
    // Fall back to project labels (setup.md Step 2b, no-boards branch).
    const labelsRaw = runOrNull('glab', ['api', `/projects/${projectPath}/labels`, '--paginate']);
    if (!labelsRaw) {
      return { available: false, reason: 'no boards and no labels — check auth / permissions.' };
    }
    let labels;
    try { labels = JSON.parse(labelsRaw); } catch { labels = []; }
    return {
      available: true,
      mode: 'labels',
      boards: [],
      labels: labels.map((l) => ({ name: l.name, color: l.color })),
    };
  }

  // For each board, fetch its lists (each list = a column).
  const boardsWithLists = boards.map((b) => {
    const listsRaw = runOrNull('glab', ['api', `/projects/${projectPath}/boards/${b.id}/lists`]);
    let lists = [];
    if (listsRaw) {
      try { lists = JSON.parse(listsRaw); } catch { lists = []; }
    }
    return {
      id: b.id,
      name: b.name || `Board ${b.id}`,
      lists: lists
        .sort((a, b2) => (a.position || 0) - (b2.position || 0))
        .map((l) => ({
          position: l.position,
          label: (l.label && l.label.name) || null,
          color: (l.label && l.label.color) || null,
        }))
        .filter((l) => l.label),
    };
  });

  return {
    available: true,
    mode: 'boards',
    boards: boardsWithLists,
  };
}

// ---------------------------------------------------------------------------
// GitHub Projects v2
// ---------------------------------------------------------------------------

function extractGitHubProject(boardUrl) {
  if (!boardUrl) return null;
  try {
    const u = new URL(boardUrl);
    const parts = u.pathname.replace(/^\//, '').split('/');
    // Typical shapes:
    //   /orgs/<owner>/projects/<num>
    //   /users/<owner>/projects/<num>
    //   /<owner>/<repo>/projects/<num>  (repo-scoped classic — different API)
    if (parts[0] === 'orgs' && parts[2] === 'projects') {
      return { owner: parts[1], number: parts[3], type: 'v2' };
    }
    if (parts[0] === 'users' && parts[2] === 'projects') {
      return { owner: parts[1], number: parts[3], type: 'v2' };
    }
    return null;
  } catch {
    return null;
  }
}

function discoverGitHubProject(boardUrl) {
  if (!binaryAvailable('gh')) {
    return { available: false, reason: 'gh CLI not on PATH — install gh or provide columns manually.' };
  }
  const parsed = extractGitHubProject(boardUrl);
  if (!parsed) {
    return { available: false, reason: `could not parse a GitHub Projects v2 URL: ${boardUrl}` };
  }

  const fieldsRaw = runOrNull('gh', [
    'project',
    'field-list',
    String(parsed.number),
    '--owner',
    parsed.owner,
    '--format',
    'json',
  ]);
  if (!fieldsRaw) {
    return { available: false, reason: `gh project field-list ${parsed.number} --owner ${parsed.owner} failed — check auth and Projects v2 scope.` };
  }

  let payload;
  try { payload = JSON.parse(fieldsRaw); } catch {
    return { available: false, reason: 'gh returned unparseable JSON for project fields.' };
  }

  const statusField = (payload.fields || []).find((f) => f.name === 'Status');
  if (!statusField || !statusField.options) {
    return { available: false, reason: 'no Status field with options found on the project (classic project?).' };
  }

  return {
    available: true,
    columns: statusField.options.map((o) => o.name),
  };
}

// ---------------------------------------------------------------------------
// Linear
// ---------------------------------------------------------------------------

function discoverLinear(_teamHint) {
  // The `linear` CLI is not universally available; skip auto-discovery unless
  // installed. Users can copy states from Linear settings if the CLI is missing.
  if (!binaryAvailable('linear')) {
    return { available: false, reason: 'linear CLI not on PATH — provide workflow states manually.' };
  }
  const out = runOrNull('linear', ['team', 'list']);
  if (!out) {
    return { available: false, reason: 'linear team list failed — check auth.' };
  }
  // The linear CLI's output shape is not stable JSON. Return raw text for the
  // caller to display; user picks states manually. Not a hard block.
  return { available: true, raw: out };
}

// ---------------------------------------------------------------------------
// Top-level dispatch
// ---------------------------------------------------------------------------

function discoverBoard(boardType, boardUrl) {
  switch (boardType) {
    case 'gitlab':
      return discoverGitLab(boardUrl);
    case 'github':
      return discoverGitHubProject(boardUrl);
    case 'linear':
      return discoverLinear(boardUrl);
    case 'jira':
    case 'notion':
    case 'none':
    default:
      return { available: false, reason: `no auto-discovery for '${boardType}' — enter columns manually.` };
  }
}

module.exports = {
  discoverBoard,
  discoverGitLab,
  discoverGitHubProject,
  discoverLinear,
  binaryAvailable,
};
