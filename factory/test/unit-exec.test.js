'use strict';
// Unit tests for src/exec.js. The only child process started is this Node binary.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run, runOk, resolveCommand } = require('../src/exec');

const NODE = process.execPath;
const HANG = ['-e', 'setTimeout(() => {}, 60000)'];

function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-factory-unit-exec-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  return dir;
}

// ---- run ----

test('run captures stdout, stderr and a zero exit code', async () => {
  const res = await run(NODE, ['-e', 'process.stdout.write("out"); process.stderr.write("err")']);
  assert.deepEqual(res, { code: 0, stdout: 'out', stderr: 'err', timedOut: false, aborted: false });
});

test('run reports a non-zero exit code without rejecting', async () => {
  const res = await run(NODE, ['-e', 'process.stdout.write("partial"); process.stderr.write("boom"); process.exit(3)']);
  assert.equal(res.code, 3);
  assert.equal(res.stdout, 'partial');
  assert.equal(res.stderr, 'boom');
  assert.equal(res.timedOut, false);
  assert.equal(res.aborted, false);
});

test('run writes input to stdin and closes it', async () => {
  const input = 'line one\n"quoted" $VAR `tick` & | < > %PATH%\nünïcödé\n';
  const res = await run(NODE, ['-e', 'process.stdin.pipe(process.stdout)'], { input });
  assert.equal(res.code, 0);
  assert.equal(res.stdout, input);
});

test('run closes stdin even with no input, so a reader does not hang', async () => {
  const res = await run(NODE, ['-e', 'let n = 0; process.stdin.on("data", (d) => { n += d.length; }); process.stdin.on("end", () => process.stdout.write(String(n)))'], { timeoutMs: 20000 });
  assert.equal(res.timedOut, false);
  assert.equal(res.stdout, '0');
});

test('run passes arguments through without a shell', async () => {
  const tricky = ['{"a":"b c"}', 'x && echo injected', '%PATH%', '$HOME', 'a"b'];
  const res = await run(NODE, ['-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', ...tricky]);
  assert.deepEqual(JSON.parse(res.stdout), tricky);
});

test('run honours cwd and env', async (t) => {
  const dir = tmpDir(t);
  const res = await run(NODE, ['-e', 'process.stdout.write(JSON.stringify({ cwd: process.cwd(), foo: process.env.FACTORY_UNIT_FOO, leaked: process.env.FACTORY_UNIT_LEAK || null }))'], {
    cwd: dir,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, FACTORY_UNIT_FOO: 'bar' },
  });
  assert.equal(res.code, 0, res.stderr);
  const out = JSON.parse(res.stdout);
  assert.equal(fs.realpathSync(out.cwd), fs.realpathSync(dir));
  assert.equal(out.foo, 'bar');
  assert.equal(out.leaked, null);
});

test('run with an explicit env does not pass the parent environment', async () => {
  process.env.FACTORY_UNIT_LEAK = 'secret';
  try {
    const res = await run(NODE, ['-e', 'process.stdout.write(String(process.env.FACTORY_UNIT_LEAK))'], {
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
    });
    assert.equal(res.stdout, 'undefined');
  } finally {
    delete process.env.FACTORY_UNIT_LEAK;
  }
});

test('run kills the child and reports timedOut on timeout', async () => {
  const started = Date.now();
  const res = await run(NODE, ['-e', 'process.stdout.write("started"); setTimeout(() => {}, 60000)'], { timeoutMs: 400 });
  assert.equal(res.timedOut, true);
  assert.equal(res.aborted, false);
  assert.notEqual(res.code, 0);
  assert.ok(Date.now() - started < 20000, 'the child was killed rather than waited for');
});

test('run does not report timedOut when the command finishes in time', async () => {
  const res = await run(NODE, ['-e', '0'], { timeoutMs: 30000 });
  assert.equal(res.code, 0);
  assert.equal(res.timedOut, false);
});

test('run kills the child and reports aborted when the signal fires', async () => {
  const ac = new AbortController();
  const started = Date.now();
  setTimeout(() => ac.abort(), 300);
  const res = await run(NODE, HANG, { signal: ac.signal });
  assert.equal(res.aborted, true);
  assert.equal(res.timedOut, false);
  assert.notEqual(res.code, 0);
  assert.ok(Date.now() - started < 20000);
});

test('run reports aborted for a signal that was already aborted', async () => {
  const ac = new AbortController();
  ac.abort();
  const res = await run(NODE, HANG, { signal: ac.signal, timeoutMs: 20000 });
  assert.equal(res.aborted, true);
  assert.equal(res.timedOut, false);
});

test('run resolves, never rejects, for a command that does not exist', async () => {
  const res = await run('orbit-factory-no-such-command-xyz', ['--version']);
  assert.equal(res.code, null);
  assert.equal(res.stdout, '');
  assert.ok(res.stderr.length > 0, 'the spawn error is reported in stderr');
  assert.equal(res.timedOut, false);
  assert.equal(res.aborted, false);
});

test('run resolves for a cwd that does not exist', async (t) => {
  const dir = tmpDir(t);
  const res = await run(NODE, ['-e', '0'], { cwd: path.join(dir, 'missing') });
  assert.notEqual(res.code, 0);
});

// ---- runOk ----

test('runOk returns trimmed stdout on success', async () => {
  assert.equal(await runOk(NODE, ['-e', 'console.log("  hello  ")']), 'hello');
});

test('runOk throws an Error naming the command, exit code and stderr on failure', async () => {
  await assert.rejects(
    runOk(NODE, ['-e', 'console.error("fatal: it broke"); process.exit(2)']),
    (err) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes(NODE), 'names the command');
      assert.match(err.message, /failed \(exit 2\)/);
      assert.match(err.message, /fatal: it broke/);
      return true;
    },
  );
});

test('runOk honours opts.exec and passes command, args and options to it', async () => {
  const calls = [];
  const exec = async (command, args, opts) => {
    calls.push({ command, args, opts });
    return { code: 0, stdout: 'abc123\n', stderr: '', timedOut: false, aborted: false };
  };
  const out = await runOk('git', ['rev-parse', 'HEAD'], { cwd: '/repo', exec });
  assert.equal(out, 'abc123');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'git');
  assert.deepEqual(calls[0].args, ['rev-parse', 'HEAD']);
  assert.equal(calls[0].opts.cwd, '/repo');
});

test('runOk with a fake exec names the command and its first arguments, and keeps the stderr tail', async () => {
  const stderr = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'fatal: not a git repository'].join('\n');
  const exec = async () => ({ code: 128, stdout: 'ignored stdout', stderr, timedOut: false, aborted: false });
  await assert.rejects(
    runOk('git', ['push', 'origin', 'main', '--force-with-lease', 'SECRET-LOOKING-ARG'], { exec }),
    (err) => {
      assert.match(err.message, /^git push origin main failed \(exit 128\): /);
      assert.match(err.message, /fatal: not a git repository$/);
      assert.ok(!err.message.includes('l1'), 'only the tail of stderr is kept');
      assert.ok(!err.message.includes('SECRET-LOOKING-ARG'), 'only the first arguments are echoed');
      return true;
    },
  );
});

test('runOk falls back to stdout for the detail when stderr is empty', async () => {
  const exec = async () => ({ code: 1, stdout: 'nothing to commit\n', stderr: '', timedOut: false, aborted: false });
  await assert.rejects(runOk('git', ['commit'], { exec }), /git commit failed \(exit 1\): nothing to commit/);
});

test('runOk throws for a command that could not be started', async () => {
  await assert.rejects(runOk('orbit-factory-no-such-command-xyz', ['--version']), /orbit-factory-no-such-command-xyz --version failed \(exit null\)/);
});

// ---- resolveCommand ----

/** A fake npm bin directory: tool.cmd that wraps node_modules\x\bin\tool.exe. */
function fakeNpmBin(t, { withExe = true } = {}) {
  const dir = tmpDir(t);
  fs.writeFileSync(path.join(dir, 'tool.cmd'), [
    '@ECHO off',
    'GOTO start',
    ':find_dp0',
    'SET dp0=%~dp0',
    'EXIT /b',
    ':start',
    'SETLOCAL',
    'CALL :find_dp0',
    '"%dp0%\\node_modules\\x\\bin\\tool.exe"   %*',
    '',
  ].join('\r\n'));
  // What exec.js looks for: the shim's relative target joined to the shim's directory.
  const exe = path.join(dir, 'node_modules\\x\\bin\\tool.exe');
  if (withExe) {
    fs.mkdirSync(path.dirname(exe), { recursive: true });
    fs.writeFileSync(exe, 'MZ');
  }
  return { dir, exe };
}

test('resolveCommand on win32 unwraps a .cmd shim to the .exe it starts', (t) => {
  const { dir, exe } = fakeNpmBin(t);
  assert.equal(resolveCommand('tool', { PATH: dir }, 'win32'), exe);
});

test('resolveCommand on win32 searches every PATH entry, and reads Path as well as PATH', (t) => {
  const { dir, exe } = fakeNpmBin(t);
  const empty = tmpDir(t);
  const missing = path.join(empty, 'does-not-exist');
  assert.equal(resolveCommand('tool', { PATH: [missing, empty, dir].join(';') }, 'win32'), exe);
  assert.equal(resolveCommand('tool', { Path: `${empty};${dir}` }, 'win32'), exe);
});

test('resolveCommand on win32 prefers a real .exe on PATH', (t) => {
  const dir = tmpDir(t);
  fs.writeFileSync(path.join(dir, 'tool.exe'), 'MZ');
  assert.equal(resolveCommand('tool', { PATH: dir }, 'win32'), path.join(dir, 'tool.exe'));
});

test('resolveCommand returns the command unchanged when the shim target is missing', (t) => {
  const { dir } = fakeNpmBin(t, { withExe: false });
  assert.equal(resolveCommand('tool', { PATH: dir }, 'win32'), 'tool');
});

test('resolveCommand returns the command unchanged for a shim that wraps no .exe', (t) => {
  const dir = tmpDir(t);
  fs.writeFileSync(path.join(dir, 'tool.cmd'), '@ECHO off\r\nnode "%dp0%\\node_modules\\x\\cli.js" %*\r\n');
  assert.equal(resolveCommand('tool', { PATH: dir }, 'win32'), 'tool');
});

test('resolveCommand returns the command unchanged when nothing is found', (t) => {
  const dir = tmpDir(t);
  assert.equal(resolveCommand('tool', { PATH: dir }, 'win32'), 'tool');
  assert.equal(resolveCommand('tool', { PATH: '' }, 'win32'), 'tool');
  assert.equal(resolveCommand('tool', {}, 'win32'), 'tool');
});

test('resolveCommand returns the command unchanged off Windows', (t) => {
  const { dir } = fakeNpmBin(t);
  assert.equal(resolveCommand('tool', { PATH: dir }, 'linux'), 'tool');
  assert.equal(resolveCommand('tool', { PATH: dir }, 'darwin'), 'tool');
});

test('resolveCommand returns the command unchanged when it has an extension or a path', (t) => {
  const { dir } = fakeNpmBin(t);
  assert.equal(resolveCommand('tool.cmd', { PATH: dir }, 'win32'), 'tool.cmd');
  assert.equal(resolveCommand('tool.exe', { PATH: dir }, 'win32'), 'tool.exe');
  assert.equal(resolveCommand('bin/tool', { PATH: dir }, 'win32'), 'bin/tool');
  assert.equal(resolveCommand('C:\\bin\\tool', { PATH: dir }, 'win32'), 'C:\\bin\\tool');
});

test('resolveCommand defaults to this process, and never throws', () => {
  assert.equal(typeof resolveCommand('orbit-factory-no-such-command-xyz'), 'string');
  assert.equal(resolveCommand('orbit-factory-no-such-command-xyz'), 'orbit-factory-no-such-command-xyz');
});
