#!/usr/bin/env node
'use strict';
// Operator CLI for the Agentic Factory.

const fs = require('node:fs');
const path = require('node:path');
const { load } = require('../src/config');
const { createFactory } = require('../src/index');
const { preflight } = require('../src/preflight');
const { StateStore } = require('../src/state');

const USAGE = `orbit-factory — run pai-orbit unattended, from backlog to release

Usage: orbit-factory <command> [options]

Running
  run                     Start the factory and keep polling the board
  once                    Do everything that can be done now, then exit
  preflight               Check the setup without starting anything

Watching
  status [--json]         Stage, what each ticket waits on, cost so far
  events <ticket>         The audit trail of one ticket

Control
  pause | resume          Stop or restart starting new work (running stages finish)
  stop <ticket>           Stop one ticket and hand it back to people

Local board (board.type "local", for trials)
  local add --id <id> --title <t> [--body <b>|--body-file <f>] [--label <l>]... [--reporter <u>] [--groomed]
  local comment <ticket> --author <u> --body <text>
  local review <pr> --author <u> --state approved|changes_requested [--body <text>]
  local show <ticket>

Options
  --config <file>         Factory config (default: $FACTORY_CONFIG or ./factory.config.json)
  --data <dir>            State, audit trail and workspaces (default: $FACTORY_DATA_DIR or ./.orbit-factory)
`;

function parse(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      const value = next === undefined || next.startsWith('--') ? true : argv[++i];
      if (key === 'label') (flags.label = flags.label || []).push(value);
      else flags[key] = value;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function need(value, what) {
  if (value === undefined || value === true || value === '') {
    throw new Error(`Missing ${what}. Run "orbit-factory --help".`);
  }
  return value;
}

function table(rows, columns) {
  if (!rows.length) return '(nothing)';
  const widths = columns.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] === undefined ? '' : r[c]).length)));
  const line = (cells) => cells.map((cell, i) => String(cell).padEnd(widths[i])).join('  ').trimEnd();
  return [line(columns), line(widths.map((w) => '-'.repeat(w))), ...rows.map((r) => line(columns.map((c) => (r[c] === undefined ? '' : r[c]))))].join('\n');
}

async function main(argv) {
  const { positional, flags } = parse(argv);
  const command = positional[0];
  if (!command || flags.help || command === 'help') {
    process.stdout.write(USAGE);
    return 0;
  }
  const dataDir = path.resolve(flags.data || process.env.FACTORY_DATA_DIR || '.orbit-factory');
  const configFile = path.resolve(flags.config || process.env.FACTORY_CONFIG || 'factory.config.json');
  const log = (msg) => process.stderr.write(`${new Date().toISOString()} ${msg}\n`);

  // Commands that need only the state on disk.
  if (command === 'pause' || command === 'resume') {
    new StateStore(dataDir).setControl({ paused: command === 'pause' });
    process.stdout.write(command === 'pause' ? 'Paused: no new stage will start.\n' : 'Resumed.\n');
    return 0;
  }
  if (command === 'stop') {
    const id = need(positional[1], 'ticket id');
    new StateStore(dataDir).requestStop(id);
    process.stdout.write(`Stop requested for #${id}. It is handed back on the factory's next pass.\n`);
    return 0;
  }
  if (command === 'events') {
    const id = need(positional[1], 'ticket id');
    for (const e of new StateStore(dataDir).events(id)) process.stdout.write(`${JSON.stringify(e)}\n`);
    return 0;
  }

  if (!['status', 'preflight', 'once', 'run', 'local'].includes(command)) {
    throw new Error(`Unknown command: ${command}. Run "orbit-factory --help".`);
  }
  const config = load(configFile);
  const factory = createFactory(config, { dataDir, log });

  switch (command) {
    case 'status': {
      const rows = factory.status();
      if (flags.json) process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
      else {
        const control = factory.store.control();
        process.stdout.write(`${table(rows, ['ticketId', 'status', 'stage', 'waitingFor', 'waitingHours', 'costUsd', 'activeMinutes', 'title'])}\n`);
        process.stdout.write(`\nSpent today: USD ${factory.store.spentToday().toFixed(2)} of ${config.limits.costPerDayUsd}${control.paused ? '   [PAUSED]' : ''}\n`);
      }
      return 0;
    }
    case 'preflight': {
      const report = await preflight(config, { codeHost: factory.codeHost });
      for (const c of report.checks) process.stdout.write(`${c.level.toUpperCase().padEnd(4)} ${c.name}: ${c.detail}\n`);
      process.stdout.write(report.ok ? '\nReady.\n' : '\nNot ready: fix the FAIL lines above.\n');
      return report.ok ? 0 : 1;
    }
    case 'once': {
      await factory.runUntilIdle();
      process.stdout.write(`${table(factory.status(), ['ticketId', 'status', 'stage', 'waitingFor', 'costUsd', 'title'])}\n`);
      return 0;
    }
    case 'run': {
      const report = await preflight(config, { codeHost: factory.codeHost });
      for (const c of report.checks.filter((x) => x.level !== 'ok')) log(`preflight ${c.level}: ${c.name}: ${c.detail}`);
      if (!report.ok && !flags['skip-preflight']) {
        log('preflight failed; not starting');
        return 1;
      }
      let stopping = false;
      const stop = () => { stopping = true; log('stopping after the stages in flight finish'); };
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
      log(`factory started for ${config.project}; polling every ${config.pollSeconds}s`);
      while (!stopping) {
        try { await factory.tick(); } catch (err) { log(`tick failed: ${err.message}`); }
        for (let waited = 0; waited < config.pollSeconds && !stopping; waited += 1) {
          await new Promise((resolve) => { setTimeout(resolve, 1000); });
        }
      }
      await factory.drain();
      return 0;
    }
    case 'local': {
      if (config.board.type !== 'local') throw new Error('The "local" commands need board.type "local".');
      const sub = positional[1];
      if (sub === 'add') {
        const body = flags['body-file'] ? fs.readFileSync(String(flags['body-file']), 'utf8') : (flags.body === true ? '' : flags.body || '');
        const t = await factory.board.create({
          id: need(flags.id, '--id'), title: need(flags.title, '--title'), body,
          labels: (flags.label || [config.board.readyLabel]).concat(flags.groomed ? [config.board.groomedLabel] : []), reporter: flags.reporter === true ? '' : flags.reporter || '',
        });
        process.stdout.write(`Created ticket #${t.id} with labels: ${t.labels.join(', ')}\n`);
        return 0;
      }
      if (sub === 'comment') {
        await factory.board.comment(need(positional[2], 'ticket id'), need(flags.body, '--body'), need(flags.author, '--author'));
        process.stdout.write('Comment added.\n');
        return 0;
      }
      if (sub === 'review') {
        await factory.codeHost.addReview(need(positional[2], 'pull request id'), {
          author: need(flags.author, '--author'), state: need(flags.state, '--state'), body: flags.body === true ? '' : flags.body || '',
        });
        process.stdout.write('Review recorded.\n');
        return 0;
      }
      if (sub === 'show') {
        process.stdout.write(`${JSON.stringify(factory.board.raw(need(positional[2], 'ticket id')), null, 2)}\n`);
        return 0;
      }
      throw new Error(`Unknown local command: ${sub}`);
    }
    default:
      throw new Error(`Unknown command: ${command}. Run "orbit-factory --help".`);
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (err) => { process.stderr.write(`orbit-factory: ${err.message}\n`); process.exitCode = 1; },
  );
}

module.exports = { main, parse };
