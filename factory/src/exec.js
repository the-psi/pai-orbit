'use strict';
// Child-process helpers. The orchestrator shells out to git, gh and the agent CLI; everything
// goes through here so tests can substitute a fake `exec`.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Run a command to completion.
 * @param {string} command
 * @param {string[]} args
 * @param {{cwd?: string, env?: object, input?: string, timeoutMs?: number, signal?: AbortSignal,
 *          onStdout?: (chunk: string) => void}} [opts] `onStdout` sees output as it arrives
 * @returns {Promise<{code: number|null, stdout: string, stderr: string, timedOut: boolean, aborted: boolean}>}
 */
function run(command, args, opts = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd: opts.cwd,
        env: opts.env || process.env,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve({ code: null, stdout: '', stderr: String(err && err.message), timedOut: false, aborted: false });
      return;
    }
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let aborted = false;
    let timer = null;
    const kill = () => {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
    };
    if (opts.timeoutMs && opts.timeoutMs > 0) {
      timer = setTimeout(() => { timedOut = true; kill(); }, opts.timeoutMs);
    }
    const onAbort = () => { aborted = true; kill(); };
    if (opts.signal) {
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener('abort', onAbort, { once: true });
    }
    child.stdout.on('data', (d) => {
      stdout += d;
      if (opts.onStdout) { try { opts.onStdout(String(d)); } catch { /* a listener must not break the run */ } }
    });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      resolve({ code: null, stdout, stderr: stderr + String(err && err.message), timedOut, aborted });
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
      resolve({ code, stdout, stderr, timedOut, aborted });
    });
    child.stdin.on('error', () => { /* child exited before reading stdin */ });
    if (opts.input !== undefined) child.stdin.write(opts.input);
    child.stdin.end();
  });
}

/** Run a command and throw with stderr when it fails. Returns trimmed stdout. */
async function runOk(command, args, opts = {}) {
  const res = await (opts.exec || run)(command, args, opts);
  if (res.code !== 0) {
    const detail = (res.stderr || res.stdout || '').trim().split('\n').slice(-5).join('\n');
    throw new Error(`${command} ${args.slice(0, 3).join(' ')} failed (exit ${res.code}): ${detail}`);
  }
  return res.stdout.trim();
}

/**
 * Resolve a bare command name to something `spawn` can start without a shell.
 * On Windows an npm-installed CLI is a `.cmd` shim, which spawn cannot run directly and whose
 * quoting rules would mangle JSON arguments. If the shim wraps an `.exe`, return that instead.
 */
function resolveCommand(command, env = process.env, platform = process.platform) {
  if (platform !== 'win32' || path.extname(command) || command.includes('/') || command.includes('\\')) {
    return command;
  }
  const dirs = String(env.PATH || env.Path || '').split(';').filter(Boolean);
  for (const dir of dirs) {
    const exe = path.join(dir, `${command}.exe`);
    if (fs.existsSync(exe)) return exe;
    const cmd = path.join(dir, `${command}.cmd`);
    if (fs.existsSync(cmd)) {
      const text = fs.readFileSync(cmd, 'utf8');
      const m = text.match(/"%dp0%\\([^"]+\.exe)"/i);
      if (m) {
        const target = path.join(dir, m[1]);
        if (fs.existsSync(target)) return target;
      }
    }
  }
  return command;
}

module.exports = { run, runOk, resolveCommand };
