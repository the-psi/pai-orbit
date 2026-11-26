'use strict';
// Runner that calls no model. Used by the tests, and by `runner.type: "fake"` to rehearse the
// whole flow (board, gates, questions, limits) without spending anything.
//
// A handler decides what each stage "does". The default handler writes the stage's expected
// document and reports `done`.

const fs = require('node:fs');
const path = require('node:path');

const ARTIFACT = { groom: 'requirements.md', design: 'design.md', test: 'test-plan.md' };

function featureDirFrom(prompt) {
  const m = String(prompt).match(/Feature folder: `([^`]+)\/`/);
  return m ? m[1] : 'docs/features/ticket';
}

/** What a well-behaved agent would do for a stage, with no questions. */
function defaultHandler(req) {
  const dir = featureDirFrom(req.prompt);
  const write = {};
  if (ARTIFACT[req.stage]) write[`${dir}/${ARTIFACT[req.stage]}`] = `# ${req.stage} output (fake runner)\n`;
  if (req.stage === 'build') write['src/feature.txt'] = `built by the fake runner\n`;
  const result = { status: 'done', summary: `Fake ${req.stage} completed.`, artifacts: Object.keys(write) };
  if (req.stage === 'design') result.size = { files: 2, changedLines: 40, services: 1, paths: ['src/feature.txt'] };
  if (req.stage === 'verify') result.review = { verdict: 'approve', findings: [] };
  return { result, write, costUsd: 0.5 };
}

class FakeRunner {
  /** @param {{handler?: (req: object, call: number) => object|Promise<object>}} [opts] */
  constructor(opts = {}) {
    this.handler = opts.handler || defaultHandler;
    this.calls = [];
  }

  /** @param {import('../interfaces').RunRequest} req */
  async run(req) {
    this.calls.push(req);
    let out = await this.handler(req, this.calls.length);
    if (out === undefined || out === null) out = defaultHandler(req);
    if (out.useDefault) out = { ...defaultHandler(req), ...out, useDefault: undefined };
    for (const [rel, content] of Object.entries(out.write || {})) {
      const file = path.join(req.cwd, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    return {
      result: out.result || null,
      sessionId: out.sessionId || req.sessionId || `fake-${req.stage}-${this.calls.length}`,
      costUsd: out.costUsd === undefined ? 0.5 : out.costUsd,
      durationMs: out.durationMs === undefined ? 1000 : out.durationMs,
      problem: out.problem || (out.result ? '' : 'invalid'),
      detail: out.detail || '',
    };
  }
}

module.exports = { FakeRunner, defaultHandler, featureDirFrom };
