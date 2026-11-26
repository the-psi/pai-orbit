'use strict';
// Runner that starts the Claude Code CLI headless (`claude -p`) with the built pai-orbit plugin.
//
// Flags used were checked against `claude --help` (v2.1.308): -p, --output-format json,
// --json-schema, --append-system-prompt, --plugin-dir, --permission-mode, --permission-prompts,
// --allowedTools, --disallowedTools, --max-budget-usd, --resume, --session-id, --model.
// The prompt goes in on stdin so ticket text never has to survive shell quoting.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { run, resolveCommand } = require('../exec');

const CONTRACT_DIR = path.resolve(__dirname, '..', '..', 'contract');

class ClaudeCliRunner {
  /**
   * @param {{command: string, model?: string, pluginDir: string, permissionMode: string,
   *          allowedTools: string[], disallowedTools: string[], exec?: Function,
   *          contractPath?: string, schemaPath?: string}} opts
   */
  constructor(opts) {
    this.opts = opts;
    this.exec = opts.exec || run;
    this.contract = fs.readFileSync(opts.contractPath || path.join(CONTRACT_DIR, 'unattended.md'), 'utf8');
    this.schema = JSON.stringify(JSON.parse(
      fs.readFileSync(opts.schemaPath || path.join(CONTRACT_DIR, 'stage-result.schema.json'), 'utf8'),
    ));
  }

  /** Arguments for one run. Exposed for tests. */
  args(req, sessionId) {
    const o = this.opts;
    const args = [
      '-p',
      // The agent reports each step as it happens; the last line is the result.
      '--output-format', 'stream-json', '--verbose',
      '--json-schema', this.schema,
      '--append-system-prompt', this.contract,
      '--plugin-dir', o.pluginDir,
      '--permission-mode', o.permissionMode,
      '--permission-prompts', 'none',
      '--max-budget-usd', String(Math.max(0.01, Math.round(req.budgetUsd * 100) / 100)),
    ];
    if (o.allowedTools && o.allowedTools.length) args.push('--allowedTools', o.allowedTools.join(','));
    if (o.disallowedTools && o.disallowedTools.length) args.push('--disallowedTools', o.disallowedTools.join(','));
    if (o.bashGuardPath) {
      // Orbit's bash-guard hook is normally wired per project by /setup. The factory wires it for
      // every run, so it is on even in a project that was never set up.
      args.push('--settings', JSON.stringify({
        hooks: {
          PreToolUse: [{
            matcher: 'Bash',
            hooks: [{ type: 'command', command: `bash "${o.bashGuardPath.replace(/\\/g, '/')}"`, timeout: 10 }],
          }],
        },
      }));
    }
    if (o.model) args.push('--model', o.model);
    if (req.sessionId) args.push('--resume', req.sessionId);
    else args.push('--session-id', sessionId);
    return args;
  }

  /** @param {import('../interfaces').RunRequest} req */
  async run(req) {
    const started = Date.now();
    const sessionId = req.sessionId || crypto.randomUUID();
    const command = resolveCommand(this.opts.command, req.env);
    const live = liveWriter(req);
    const res = await this.exec(command, this.args(req, sessionId), {
      cwd: req.cwd,
      env: req.env,
      input: req.prompt,
      timeoutMs: req.timeoutMs,
      signal: req.signal,
      onStdout: live,
    });
    const durationMs = Date.now() - started;
    if (req.transcriptPath) {
      try {
        fs.mkdirSync(path.dirname(req.transcriptPath), { recursive: true });
        fs.writeFileSync(req.transcriptPath, JSON.stringify({
          stage: req.stage, sessionId, exitCode: res.code, timedOut: res.timedOut,
          stdout: res.stdout, stderr: res.stderr,
        }, null, 2));
      } catch { /* a transcript that cannot be written must not fail the stage */ }
    }
    const parsed = parseOutput(res.stdout);
    const base = {
      result: null,
      sessionId: (parsed && parsed.session_id) || sessionId,
      costUsd: Number((parsed && parsed.total_cost_usd) || 0),
      durationMs,
      problem: '',
      detail: '',
    };
    if (res.aborted) return { ...base, problem: 'aborted', detail: 'stopped by the orchestrator' };
    if (res.timedOut) return { ...base, problem: 'timeout', detail: `no result within ${Math.round(req.timeoutMs / 60000)} minutes` };
    if (!parsed) {
      const tail = (res.stderr || res.stdout || '').trim().split('\n').slice(-3).join(' ');
      return { ...base, problem: 'crash', detail: `exit ${res.code}: ${tail}`.slice(0, 500) };
    }
    if (parsed.subtype === 'error_max_budget_usd') {
      return { ...base, problem: 'budget', detail: 'the stage budget was used up' };
    }
    const result = extractResult(parsed);
    if (!result) {
      const why = parsed.is_error ? `${parsed.subtype || 'error'}: ${String(parsed.result || '').slice(0, 300)}` : 'the run ended without a structured result';
      return { ...base, problem: parsed.is_error ? 'crash' : 'invalid', detail: why };
    }
    return { ...base, result };
  }
}

/**
 * One line for the status page from one thing the agent did. Returns '' for steps not worth
 * showing. Paths are shown relative to the ticket's workspace.
 */
function activityText(block, cwd) {
  const input = block.input || {};
  const rel = (p) => {
    const file = String(p || '').replace(/\\/g, '/');
    const base = String(cwd || '').replace(/\\/g, '/').replace(/\/+$/, '');
    return base && file.startsWith(`${base}/`) ? file.slice(base.length + 1) : file;
  };
  const short = (t, n = 140) => { const x = String(t || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };
  if (block.type === 'text') return block.text && block.text.trim() ? `Says: ${short(block.text, 180)}` : '';
  if (block.type !== 'tool_use') return '';
  switch (block.name) {
    case 'Read': return `Reading ${rel(input.file_path)}`;
    case 'Write': return `Writing ${rel(input.file_path)}`;
    case 'Edit':
    case 'MultiEdit': return `Editing ${rel(input.file_path)}`;
    case 'Bash': {
      if (input.description) return `Running: ${short(input.description)}`;
      // Drop the "cd <workspace>;" the agent often puts first, and show paths relative to it.
      const base = String(cwd || '').split(String.fromCharCode(92)).join('/').replace(/[/]+$/, '');
      let cmd = String(input.command || '');
      if (base) {
        const lead = `cd ${base}`;
        if (cmd.startsWith(lead)) cmd = cmd.slice(lead.length).replace(/^[\s;&]+/, '');
        cmd = cmd.split(`${base}/`).join('');
      }
      return `Running: ${short(cmd)}`;
    }
    case 'Glob': return `Looking for files: ${short(input.pattern, 80)}`;
    case 'Grep': return `Searching the code for: ${short(input.pattern, 80)}`;
    case 'Agent':
    case 'Task': return `Starting a helper agent: ${short(input.description || input.prompt, 100)}`;
    case 'Skill': return `Using the ${short(input.skill, 40)} skill`;
    case 'TodoWrite': return 'Updating its task list';
    case 'StructuredOutput': return 'Writing the stage result';
    default: return `Using ${block.name}`;
  }
}

/**
 * Turn the agent's output stream into lines in the live activity file. Returns a function to feed
 * with output chunks. Never throws: the status page is a convenience, the run is not.
 */
function liveWriter(req) {
  if (!req.livePath) return undefined;
  try {
    fs.mkdirSync(path.dirname(req.livePath), { recursive: true });
    fs.writeFileSync(req.livePath, '');
  } catch { return undefined; }
  let buffer = '';
  return (chunk) => {
    buffer += chunk;
    let nl = buffer.indexOf('\n');
    while (nl !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      nl = buffer.indexOf('\n');
      if (!line.startsWith('{')) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.type !== 'assistant' || !msg.message || !Array.isArray(msg.message.content)) continue;
      for (const block of msg.message.content) {
        const text = activityText(block, req.cwd);
        if (!text) continue;
        try {
          fs.appendFileSync(req.livePath, `${JSON.stringify({ at: new Date().toISOString(), stage: req.stage, text })}\n`);
        } catch { /* ignore */ }
      }
    }
  };
}

/**
 * The CLI streams one JSON object per line and the last is the result. A single JSON object or
 * an array of messages (other output modes) is read as well.
 */
function parseOutput(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return null;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    const last = text.split('\n').filter(Boolean).pop();
    try { value = JSON.parse(last); } catch { return null; }
  }
  if (Array.isArray(value)) value = value.filter((m) => m && m.type === 'result').pop() || null;
  return value && typeof value === 'object' ? value : null;
}

const STATUSES = ['done', 'needs_input', 'declined', 'failed'];

function extractResult(parsed) {
  let out = parsed.structured_output;
  if (!out && typeof parsed.result === 'string') {
    try { out = JSON.parse(parsed.result); } catch { out = null; }
  }
  if (!out || typeof out !== 'object' || !STATUSES.includes(out.status)) return null;
  return {
    status: out.status,
    summary: String(out.summary || ''),
    questions: Array.isArray(out.questions) ? out.questions : [],
    assumptions: Array.isArray(out.assumptions) ? out.assumptions : [],
    artifacts: Array.isArray(out.artifacts) ? out.artifacts : [],
    reason: out.reason ? String(out.reason) : '',
    size: out.size && typeof out.size === 'object' ? out.size : undefined,
  };
}

module.exports = { ClaudeCliRunner, parseOutput, extractResult, activityText, liveWriter };
