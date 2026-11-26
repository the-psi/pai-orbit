'use strict';
// Unit tests for src/runners/claude-cli.js with a fake `exec`: no CLI and no model is started.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ClaudeCliRunner, parseOutput, extractResult } = require('../src/runners/claude-cli');

const STATUSES = ['done', 'needs_input', 'declined', 'failed'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PROMPT = '/pai-orbit:groom ticket #42\n\nUNIQUE-PROMPT-MARKER "quoted" $x `y`';

const OPTS = {
  command: 'claude',
  model: '',
  pluginDir: '/opt/plugins/pai-orbit',
  permissionMode: 'acceptEdits',
  allowedTools: ['Read', 'Edit', 'Bash'],
  disallowedTools: ['AskUserQuestion', 'Bash(git push:*)', 'WebFetch'],
};

function ok(stdout) {
  return { code: 0, stdout: typeof stdout === 'string' ? stdout : JSON.stringify(stdout), stderr: '', timedOut: false, aborted: false };
}

/** A runner whose exec records its calls and returns `res` (or the next of a list). */
function makeRunner(res = ok({ type: 'result', structured_output: { status: 'done', summary: 's' } }), opts = {}) {
  const calls = [];
  const exec = async (command, args, execOpts) => {
    calls.push({ command, args, opts: execOpts });
    return typeof res === 'function' ? res(command, args, execOpts) : res;
  };
  return { runner: new ClaudeCliRunner({ ...OPTS, ...opts, exec }), calls };
}

function request(over = {}) {
  return {
    stage: 'groom', prompt: PROMPT, cwd: '/work/ticket-42', env: { PATH: '' },
    budgetUsd: 7.5, timeoutMs: 120 * 60000, ...over,
  };
}

/** The value that follows a flag; fails when the flag is absent or appears twice. */
function valueOf(args, flag) {
  const i = args.indexOf(flag);
  assert.notEqual(i, -1, `${flag} is missing from the arguments`);
  assert.equal(args.lastIndexOf(flag), i, `${flag} appears more than once`);
  assert.ok(i + 1 < args.length, `${flag} has no value`);
  return args[i + 1];
}

// ---- the argument list ----

test('one run starts the CLI once, headless, with JSON output', async () => {
  const { runner, calls } = makeRunner();
  await runner.run(request());
  assert.equal(calls.length, 1);
  const { command, args } = calls[0];
  assert.equal(command, 'claude');
  assert.ok(args.includes('-p'));
  assert.equal(valueOf(args, '--output-format'), 'stream-json');
  assert.ok(args.includes('--verbose'), 'stream-json needs --verbose in print mode');
  assert.ok(args.every((a) => typeof a === 'string'), 'every argument is a string');
});

test('--json-schema carries the stage-result schema as one JSON string', async () => {
  const { runner, calls } = makeRunner();
  await runner.run(request());
  const schema = JSON.parse(valueOf(calls[0].args, '--json-schema'));
  assert.deepEqual(schema.properties.status.enum, STATUSES);
  assert.deepEqual(schema.required, ['status', 'summary']);
  const onDisk = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contract', 'stage-result.schema.json'), 'utf8'));
  assert.deepEqual(schema, onDisk);
});

test('--append-system-prompt carries the unattended contract text', async () => {
  const { runner, calls } = makeRunner();
  await runner.run(request());
  const contract = valueOf(calls[0].args, '--append-system-prompt');
  assert.ok(contract.trim().length > 0);
  assert.match(contract, /Unattended contract/);
  assert.equal(contract, fs.readFileSync(path.join(__dirname, '..', 'contract', 'unattended.md'), 'utf8'));
});

test('the plugin, permission mode, prompt handling and budget flags are set', async () => {
  const { runner, calls } = makeRunner();
  await runner.run(request());
  const { args } = calls[0];
  assert.equal(valueOf(args, '--plugin-dir'), '/opt/plugins/pai-orbit');
  assert.equal(valueOf(args, '--permission-mode'), 'acceptEdits');
  assert.equal(valueOf(args, '--permission-prompts'), 'none');
  assert.equal(valueOf(args, '--max-budget-usd'), '7.5');
});

test('--max-budget-usd is rounded to cents and never below one cent', async () => {
  const { runner } = makeRunner();
  assert.equal(valueOf(runner.args(request({ budgetUsd: 3.14159 }), 'sid'), '--max-budget-usd'), '3.14');
  assert.equal(valueOf(runner.args(request({ budgetUsd: 15 }), 'sid'), '--max-budget-usd'), '15');
  assert.equal(valueOf(runner.args(request({ budgetUsd: 0 }), 'sid'), '--max-budget-usd'), '0.01');
  assert.equal(valueOf(runner.args(request({ budgetUsd: 0.001 }), 'sid'), '--max-budget-usd'), '0.01');
  assert.equal(valueOf(runner.args(request({ budgetUsd: -4 }), 'sid'), '--max-budget-usd'), '0.01');
});

test('--allowedTools and --disallowedTools are comma-joined', async () => {
  const { runner, calls } = makeRunner();
  await runner.run(request());
  const { args } = calls[0];
  assert.equal(valueOf(args, '--allowedTools'), 'Read,Edit,Bash');
  assert.equal(valueOf(args, '--disallowedTools'), 'AskUserQuestion,Bash(git push:*),WebFetch');
});

test('empty tool lists add no tool flags', async () => {
  const { runner, calls } = makeRunner(undefined, { allowedTools: [], disallowedTools: [] });
  await runner.run(request());
  assert.ok(!calls[0].args.includes('--allowedTools'));
  assert.ok(!calls[0].args.includes('--disallowedTools'));
});

test('a new run passes --session-id with a fresh UUID and no --resume', async () => {
  const { runner, calls } = makeRunner();
  const first = await runner.run(request());
  const second = await runner.run(request());
  const id1 = valueOf(calls[0].args, '--session-id');
  const id2 = valueOf(calls[1].args, '--session-id');
  assert.match(id1, UUID);
  assert.match(id2, UUID);
  assert.notEqual(id1, id2);
  assert.ok(!calls[0].args.includes('--resume'));
  assert.equal(first.sessionId, id1, 'the session id the CLI was started with is returned');
  assert.equal(second.sessionId, id2);
});

test('a run with req.sessionId passes --resume <id> and no --session-id', async () => {
  const { runner, calls } = makeRunner();
  const out = await runner.run(request({ sessionId: 'sess-prev-1' }));
  assert.equal(valueOf(calls[0].args, '--resume'), 'sess-prev-1');
  assert.ok(!calls[0].args.includes('--session-id'));
  assert.equal(out.sessionId, 'sess-prev-1');
});

test('the prompt goes in on stdin and is not in argv', async () => {
  const { runner, calls } = makeRunner();
  await runner.run(request());
  assert.equal(calls[0].opts.input, PROMPT);
  assert.ok(!calls[0].args.includes(PROMPT));
  assert.ok(calls[0].args.every((a) => !a.includes('UNIQUE-PROMPT-MARKER')), 'no argument contains the prompt text');
});

test('cwd, env, timeout and signal are handed to exec', async () => {
  const { runner, calls } = makeRunner();
  const ac = new AbortController();
  const env = { PATH: '', ANTHROPIC_API_KEY: 'k' };
  await runner.run(request({ env, signal: ac.signal, timeoutMs: 1234 }));
  assert.equal(calls[0].opts.cwd, '/work/ticket-42');
  assert.equal(calls[0].opts.env, env);
  assert.equal(calls[0].opts.timeoutMs, 1234);
  assert.equal(calls[0].opts.signal, ac.signal);
});

test('--model is passed only when a model is configured', async () => {
  const without = makeRunner();
  await without.runner.run(request());
  assert.ok(!without.calls[0].args.includes('--model'));
  const withModel = makeRunner(undefined, { model: 'some-model-id' });
  await withModel.runner.run(request());
  assert.equal(valueOf(withModel.calls[0].args, '--model'), 'some-model-id');
});

test('contractPath and schemaPath override the shipped contract files', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-factory-unit-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  fs.writeFileSync(path.join(dir, 'c.md'), 'custom contract');
  fs.writeFileSync(path.join(dir, 's.json'), '{\n  "type": "object"\n}\n');
  const { runner, calls } = makeRunner(undefined, { contractPath: path.join(dir, 'c.md'), schemaPath: path.join(dir, 's.json') });
  await runner.run(request());
  assert.equal(valueOf(calls[0].args, '--append-system-prompt'), 'custom contract');
  assert.equal(valueOf(calls[0].args, '--json-schema'), '{"type":"object"}');
});

// ---- outcome mapping ----

test('a JSON result with structured_output is returned with cost and session id', async () => {
  const { runner } = makeRunner(ok({
    type: 'result', subtype: 'success', is_error: false, session_id: 'cli-session-9', total_cost_usd: 1.2345,
    result: 'Done.',
    structured_output: {
      status: 'needs_input', summary: 'Two things are unclear.',
      questions: [{ question: 'Which page?', why: 'blocks scope' }],
      assumptions: [{ decision: 'd', basis: 'b' }],
      artifacts: ['docs/features/x/requirements.md'],
    },
  }));
  const out = await runner.run(request());
  assert.equal(out.problem, '');
  assert.equal(out.detail, '');
  assert.equal(out.sessionId, 'cli-session-9');
  assert.equal(out.costUsd, 1.2345);
  assert.equal(typeof out.durationMs, 'number');
  assert.ok(out.durationMs >= 0);
  assert.deepEqual(out.result, {
    status: 'needs_input',
    summary: 'Two things are unclear.',
    questions: [{ question: 'Which page?', why: 'blocks scope' }],
    assumptions: [{ decision: 'd', basis: 'b' }],
    artifacts: ['docs/features/x/requirements.md'],
    reason: '',
    size: undefined,
  });
});

for (const status of STATUSES) {
  test(`a structured_output with status ${status} is accepted`, async () => {
    const { runner } = makeRunner(ok({ type: 'result', structured_output: { status, summary: 'x', reason: 'why' } }));
    const out = await runner.run(request());
    assert.equal(out.problem, '');
    assert.equal(out.result.status, status);
    assert.equal(out.result.reason, 'why');
  });
}

test("subtype error_max_budget_usd maps to problem 'budget' and still reports the cost", async () => {
  const { runner } = makeRunner(ok({
    type: 'result', subtype: 'error_max_budget_usd', is_error: true, session_id: 's-1', total_cost_usd: 15.02,
  }));
  const out = await runner.run(request());
  assert.equal(out.problem, 'budget');
  assert.equal(out.result, null);
  assert.equal(out.costUsd, 15.02);
  assert.equal(out.sessionId, 's-1');
  assert.ok(out.detail.length > 0);
});

test("timedOut maps to problem 'timeout' and names the limit", async () => {
  const { runner } = makeRunner({ code: null, stdout: '', stderr: '', timedOut: true, aborted: false });
  const out = await runner.run(request({ timeoutMs: 120 * 60000 }));
  assert.equal(out.problem, 'timeout');
  assert.equal(out.result, null);
  assert.match(out.detail, /120 minutes/);
  assert.equal(out.costUsd, 0);
});

test("aborted maps to problem 'aborted'", async () => {
  const { runner } = makeRunner({ code: null, stdout: '', stderr: '', timedOut: false, aborted: true });
  const out = await runner.run(request());
  assert.equal(out.problem, 'aborted');
  assert.equal(out.result, null);
});

test('a killed run never returns a result, even if stdout holds one', async () => {
  const stdout = JSON.stringify({ type: 'result', structured_output: { status: 'done', summary: 's' } });
  for (const flags of [{ timedOut: true, aborted: false }, { timedOut: false, aborted: true }]) {
    const { runner } = makeRunner({ code: null, stdout, stderr: '', ...flags });
    const out = await runner.run(request());
    assert.equal(out.result, null);
    assert.equal(out.problem, flags.timedOut ? 'timeout' : 'aborted');
  }
});

test("empty stdout with exit 1 maps to 'crash' with the stderr tail in detail", async () => {
  const stderr = 'line 1\nline 2\nline 3\nError: could not load plugin\n    at somewhere\nfatal: giving up\n';
  const { runner } = makeRunner({ code: 1, stdout: '', stderr, timedOut: false, aborted: false });
  const out = await runner.run(request());
  assert.equal(out.problem, 'crash');
  assert.equal(out.result, null);
  assert.match(out.detail, /exit 1/);
  assert.match(out.detail, /fatal: giving up/);
  assert.match(out.detail, /could not load plugin/);
  assert.ok(!out.detail.includes('line 1'), 'only the tail is kept');
  assert.ok(out.detail.length <= 500);
});

test("stdout that is not JSON maps to 'crash'", async () => {
  const { runner } = makeRunner({ code: 0, stdout: 'I have finished the work!', stderr: '', timedOut: false, aborted: false });
  const out = await runner.run(request());
  assert.equal(out.problem, 'crash');
  assert.equal(out.result, null);
});

test("a command that could not be started maps to 'crash'", async () => {
  const { runner } = makeRunner({ code: null, stdout: '', stderr: 'spawn claude ENOENT', timedOut: false, aborted: false });
  const out = await runner.run(request());
  assert.equal(out.problem, 'crash');
  assert.match(out.detail, /ENOENT/);
});

test('a very long crash output is cut to a bounded detail', async () => {
  const { runner } = makeRunner({ code: 1, stdout: '', stderr: 'x'.repeat(5000), timedOut: false, aborted: false });
  const out = await runner.run(request());
  assert.ok(out.detail.length <= 500);
});

test("valid JSON without structured_output maps to 'invalid'", async () => {
  const { runner } = makeRunner(ok({
    type: 'result', subtype: 'success', is_error: false, session_id: 's-2', total_cost_usd: 0.4,
    result: 'All done, requirements written.',
  }));
  const out = await runner.run(request());
  assert.equal(out.problem, 'invalid');
  assert.equal(out.result, null);
  assert.equal(out.costUsd, 0.4, 'the cost of an invalid run still counts');
  assert.equal(out.sessionId, 's-2');
  assert.ok(out.detail.length > 0);
});

test("is_error: true maps to 'crash' with the error text in detail", async () => {
  const { runner } = makeRunner(ok({
    type: 'result', subtype: 'error_during_execution', is_error: true, session_id: 's-3', total_cost_usd: 0.1,
    result: 'API Error: overloaded',
  }));
  const out = await runner.run(request());
  assert.equal(out.problem, 'crash');
  assert.equal(out.result, null);
  assert.match(out.detail, /error_during_execution/);
  assert.match(out.detail, /API Error: overloaded/);
  assert.equal(out.costUsd, 0.1);
});

test('a `result` field holding a JSON string is accepted as a fallback', async () => {
  const { runner } = makeRunner(ok({
    type: 'result', session_id: 's-4', total_cost_usd: 0.2,
    result: JSON.stringify({ status: 'declined', summary: 'Too vague.', reason: 'no purpose' }),
  }));
  const out = await runner.run(request());
  assert.equal(out.problem, '');
  assert.equal(out.result.status, 'declined');
  assert.equal(out.result.summary, 'Too vague.');
  assert.equal(out.result.reason, 'no purpose');
});

test('an array of messages is handled: the last result message is used', async () => {
  const { runner } = makeRunner(ok([
    { type: 'system', subtype: 'init', session_id: 's-5' },
    { type: 'assistant', message: { content: [] } },
    { type: 'result', session_id: 's-5', total_cost_usd: 0.9, structured_output: { status: 'done', summary: 'From an array.' } },
  ]));
  const out = await runner.run(request());
  assert.equal(out.problem, '');
  assert.equal(out.result.summary, 'From an array.');
  assert.equal(out.costUsd, 0.9);
  assert.equal(out.sessionId, 's-5');
});

test('an array with no result message is a crash, not a result', async () => {
  const { runner } = makeRunner(ok([{ type: 'system', subtype: 'init' }]));
  const out = await runner.run(request());
  assert.equal(out.result, null);
  assert.equal(out.problem, 'crash');
});

test('a structured_output with an unknown status is rejected', async () => {
  for (const status of ['success', 'DONE', '', undefined, 1]) {
    const { runner } = makeRunner(ok({ type: 'result', structured_output: { status, summary: 'x' } }));
    const out = await runner.run(request());
    assert.equal(out.result, null, `status ${String(status)}`);
    assert.equal(out.problem, 'invalid');
  }
});

test('log lines before the JSON object are tolerated', async () => {
  const { runner } = makeRunner(ok(`warning: something\n${JSON.stringify({ type: 'result', structured_output: { status: 'done', summary: 'ok' } })}\n`));
  const out = await runner.run(request());
  assert.equal(out.problem, '');
  assert.equal(out.result.status, 'done');
});

test('the transcript file is written with the raw output', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-factory-unit-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  const transcriptPath = path.join(dir, 'runs', '42', 'transcripts', 'groom-01.json');
  const stdout = JSON.stringify({ type: 'result', session_id: 's-6', structured_output: { status: 'done', summary: 's' } });
  const { runner, calls } = makeRunner({ code: 0, stdout, stderr: 'a warning', timedOut: false, aborted: false });
  await runner.run(request({ transcriptPath }));
  const saved = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
  assert.equal(saved.stage, 'groom');
  assert.equal(saved.exitCode, 0);
  assert.equal(saved.timedOut, false);
  assert.equal(saved.stdout, stdout);
  assert.equal(saved.stderr, 'a warning');
  assert.equal(saved.sessionId, valueOf(calls[0].args, '--session-id'));
});

test('the transcript is written for a failed run too', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-factory-unit-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  const transcriptPath = path.join(dir, 'build-02.json');
  const { runner } = makeRunner({ code: 1, stdout: '', stderr: 'it crashed', timedOut: false, aborted: false });
  const out = await runner.run(request({ stage: 'build', transcriptPath }));
  assert.equal(out.problem, 'crash');
  const saved = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
  assert.equal(saved.stage, 'build');
  assert.equal(saved.exitCode, 1);
  assert.equal(saved.stderr, 'it crashed');
});

test('a transcript that cannot be written does not fail the stage', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-factory-unit-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  const blocker = path.join(dir, 'a-file');
  fs.writeFileSync(blocker, 'x');
  const { runner } = makeRunner();
  const out = await runner.run(request({ transcriptPath: path.join(blocker, 'sub', 'transcript.json') }));
  assert.equal(out.problem, '');
  assert.equal(out.result.status, 'done');
});

// ---- parseOutput ----

test('parseOutput: empty, blank and missing output is null', () => {
  assert.equal(parseOutput(''), null);
  assert.equal(parseOutput('   \n  '), null);
  assert.equal(parseOutput(undefined), null);
  assert.equal(parseOutput(null), null);
});

test('parseOutput: one JSON object', () => {
  assert.deepEqual(parseOutput('  {"type":"result","a":1}\n'), { type: 'result', a: 1 });
  assert.deepEqual(parseOutput('{\n  "type": "result",\n  "a": 1\n}'), { type: 'result', a: 1 }, 'pretty-printed');
});

test('parseOutput: falls back to the last line when the whole text is not JSON', () => {
  assert.deepEqual(parseOutput('some log line\n{"type":"result","a":2}\n\n'), { type: 'result', a: 2 });
  assert.deepEqual(parseOutput('{"type":"system"}\n{"type":"result","a":3}'), { type: 'result', a: 3 }, 'JSON lines');
});

test('parseOutput: an array yields its last result message', () => {
  assert.deepEqual(
    parseOutput(JSON.stringify([{ type: 'result', n: 1 }, { type: 'assistant' }, { type: 'result', n: 2 }, null, { type: 'user' }])),
    { type: 'result', n: 2 },
  );
  assert.equal(parseOutput('[]'), null);
  assert.equal(parseOutput('[{"type":"assistant"}]'), null);
});

test('parseOutput: text that is not JSON, and JSON that is not an object, is null', () => {
  assert.equal(parseOutput('not json at all'), null);
  assert.equal(parseOutput('line one\nline two'), null);
  assert.equal(parseOutput('42'), null);
  assert.equal(parseOutput('"a string"'), null);
  assert.equal(parseOutput('null'), null);
  assert.equal(parseOutput('true'), null);
});

// ---- extractResult ----

test('extractResult: normalises a structured_output', () => {
  assert.deepEqual(
    extractResult({ structured_output: { status: 'done', summary: 'ok', size: { files: 2 }, extra: 'dropped' } }),
    { status: 'done', summary: 'ok', questions: [], assumptions: [], artifacts: [], reason: '', size: { files: 2 } },
  );
});

test('extractResult: fills missing and wrongly-typed fields with safe values', () => {
  const out = extractResult({ structured_output: { status: 'failed', questions: 'none', assumptions: null, artifacts: {}, reason: 404, size: 'big' } });
  assert.deepEqual(out, { status: 'failed', summary: '', questions: [], assumptions: [], artifacts: [], reason: '404', size: undefined });
});

test('extractResult: structured_output wins over the result string', () => {
  const out = extractResult({
    structured_output: { status: 'done', summary: 'structured' },
    result: JSON.stringify({ status: 'failed', summary: 'text' }),
  });
  assert.equal(out.summary, 'structured');
});

test('extractResult: falls back to a JSON string in result', () => {
  assert.equal(extractResult({ result: '{"status":"needs_input","summary":"q"}' }).status, 'needs_input');
});

test('extractResult: null when there is nothing usable', () => {
  assert.equal(extractResult({}), null);
  assert.equal(extractResult({ result: 'plain prose' }), null);
  assert.equal(extractResult({ result: '"just a string"' }), null);
  assert.equal(extractResult({ result: '{"summary":"no status"}' }), null);
  assert.equal(extractResult({ result: { status: 'done' } }), null, 'a result object is not the structured output');
  assert.equal(extractResult({ structured_output: 'done' }), null);
  assert.equal(extractResult({ structured_output: { summary: 'no status' } }), null);
  assert.equal(extractResult({ structured_output: { status: 'finished', summary: 'x' } }), null);
});

test('extractResult: accepts exactly the four statuses of the contract', () => {
  for (const status of STATUSES) assert.equal(extractResult({ structured_output: { status } }).status, status);
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contract', 'stage-result.schema.json'), 'utf8'));
  for (const status of schema.properties.status.enum) {
    assert.ok(extractResult({ structured_output: { status } }), `the runner must accept schema status ${status}`);
  }
});
