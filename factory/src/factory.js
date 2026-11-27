'use strict';
// The scheduler and the pipeline.
//
// One `tick()` does, in order: operator stop requests, take-over detection, checks on parked
// tickets (answers, approvals, timers), starting work on runnable tickets, the serialised
// release, and intake of new tickets. Stage work runs concurrently in "chains" (one per ticket,
// at most `concurrency`); a chain keeps going through stages until the ticket parks or ends.
//
// The agent never pushes, comments, merges or closes. Everything that writes to the board or the
// code host happens in this file (design decision 5).

const path = require('node:path');
const { stage: stageDef, nextStage, REWORK_STAGE, GATE_ROLE, featureDir, buildPrompt } = require('./stages');
const { workingMsBetween, workingDayHours } = require('./calendar');
const { slugify } = require('./workspace');
const { inRole, roleNames } = require('./roles');
const { FACTORY_MARK, decisionOf, isFactoryComment } = require('./decision');

const HOUR = 3600 * 1000;

// Environment variables the agent process may inherit. Board, code-host and chat credentials
// are never in this list, so the agent cannot use them (REQ-11, REQ-36, REQ-43).
const AGENT_ENV = [
  'PATH', 'Path', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA',
  'TEMP', 'TMP', 'TMPDIR', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'COMSPEC', 'PATHEXT', 'windir',
  'LANG', 'LC_ALL', 'TERM', 'TZ', 'SHELL', 'USER', 'USERNAME', 'NODE_EXTRA_CA_CERTS',
  'CLAUDE_CONFIG_DIR', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX',
  'DISABLE_AUTOUPDATER', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
];

class Factory {
  /**
   * @param {{config: object, board: object, codeHost: object, runner: object, notifier: object,
   *          store: object, workspace: object, now?: () => Date, log?: (msg: string) => void,
   *          env?: object}} deps
   */
  constructor(deps) {
    Object.assign(this, deps);
    this.now = deps.now || (() => new Date());
    this.log = deps.log || (() => {});
    this.env = deps.env || process.env;
    /** @type {Map<string, {promise: Promise<void>, abort: AbortController, reason: string}>} */
    this.chains = new Map();
    this.releasing = null;
    // Everything that changes the base branch runs one at a time per project: merges, and the
    // release. Two merges racing can collide, and a merge during a release moves the base under
    // it (REQ-22, REQ-30).
    this.mergeQueue = Promise.resolve();
  }

  // ------------------------------------------------------------------ scheduling

  /** One pass over everything. Returns after starting work, not after finishing it. */
  async tick() {
    const control = this.store.control();
    await this._handleStops(control);
    for (const run of this.store.active()) {
      await this._guard(run, 'poll', () => this._poll(run));
    }
    if (control.paused) return;
    for (const run of this.store.active()) {
      if (run.status !== 'running' || run.stage === 'release' || this.chains.has(run.ticketId)) continue;
      if (this.chains.size >= this.config.concurrency) break;
      this._startChain(run.ticketId);
    }
    this._maybeRelease();
    await this._intake();
  }

  /** Wait for every chain and release in flight to finish. */
  async drain() {
    while (this.chains.size || this.releasing) {
      await Promise.all([...this.chains.values()].map((c) => c.promise).concat(this.releasing || []));
    }
  }

  /** Tick and drain until nothing changes (tests, and `factory once`). */
  async runUntilIdle(maxTicks = 50) {
    let before = '';
    for (let i = 0; i < maxTicks; i += 1) {
      await this.tick();
      await this.drain();
      const after = JSON.stringify(this.store.all().map((r) => [r.ticketId, r.status, r.stage, r.updatedAt]));
      if (after === before) return;
      before = after;
    }
  }

  async _guard(run, what, fn) {
    try {
      return await fn();
    } catch (err) {
      this.log(`#${run.ticketId} ${what} failed: ${err.message}`);
      this.store.event(run.ticketId, 'error', { during: what, message: err.message });
      return undefined;
    }
  }

  _startChain(ticketId) {
    const abort = new AbortController();
    const entry = { abort, reason: '', promise: null };
    entry.promise = (async () => {
      try {
        for (let guard = 0; guard < 100; guard += 1) {
          const run = this.store.load(ticketId);
          if (!run || run.status !== 'running' || run.stage === 'release') break;
          if (this.store.control().paused) break;
          const keepGoing = await this._runStage(run, entry);
          if (!keepGoing) break;
        }
      } catch (err) {
        const run = this.store.load(ticketId);
        this.log(`#${ticketId} chain error: ${err.stack || err.message}`);
        if (run && run.status === 'running') {
          await this._guard(run, 'hand-back', () => this._handBack(run, `The factory hit an internal error in stage ${run.stage}: ${err.message}`));
        }
      } finally {
        this.chains.delete(ticketId);
      }
    })();
    this.chains.set(ticketId, entry);
  }

  async _handleStops(control) {
    for (const id of control.stop) {
      const chain = this.chains.get(id);
      if (chain) {
        chain.reason = 'stopped';
        chain.abort.abort();
        continue; // the chain hands the ticket back when the runner returns
      }
      const run = this.store.load(id);
      if (run && ['running', 'waiting_answer', 'waiting_approval'].includes(run.status)) {
        await this._guard(run, 'stop', () => this._handBack(run, 'Stopped by an operator.'));
      }
      this.store.clearStop(id);
    }
  }

  // ------------------------------------------------------------------ intake

  async _intake() {
    if (this.chains.size >= this.config.concurrency) return;
    if (this._dailyLimitReached()) return;
    let eligible;
    try {
      eligible = await this.board.listEligible();
    } catch (err) {
      this.log(`intake: cannot read the board: ${err.message}`);
      return;
    }
    for (const ticket of eligible) {
      if (this.chains.size >= this.config.concurrency) break;
      const existing = this.store.load(ticket.id);
      if (existing && ['running', 'waiting_answer', 'waiting_approval'].includes(existing.status)) continue;
      try {
        await this.board.claim(ticket.id);
      } catch (err) {
        this.log(`intake: cannot claim #${ticket.id}: ${err.message}`);
        continue;
      }
      const slug = slugify(ticket.title);
      const run = {
        ticketId: String(ticket.id),
        title: ticket.title,
        url: ticket.url,
        reporter: ticket.reporter,
        // Kept so the review screen can show what was asked without calling the board.
        body: String(ticket.body || '').slice(0, 20000),
        // Which start label the person used. Recorded now because claiming removes the label.
        groomed: ticket.labels.includes(this.config.board.groomedLabel),
        slug,
        branch: `factory/${slugify(String(ticket.id), 20)}-${slug}`,
        featureDir: featureDir(this.config, slug),
        status: 'running',
        stage: 'intake',
        costUsd: 0,
        stageCost: {},
        activeMs: 0,
        sessions: {},
        attempts: {},
        failures: {},
        rework: {},
        fixAttempts: 0,
        approvals: {},
        pending: null,
        pr: null,
        feedback: null,
        answers: '',
        resume: '',
        costWarned: false,
        createdAt: this.now().toISOString(),
      };
      this.store.save(run);
      this.store.event(run.ticketId, 'claimed', { title: run.title });
      this._startChain(run.ticketId);
    }
  }

  /** Why a ticket is unsuitable at intake, or '' when it may proceed (REQ-23). */
  _intakeProblem(ticket) {
    const s = this.config.suitability;
    const labels = ticket.labels.map((l) => l.toLowerCase());
    const sensitive = s.sensitiveLabels.filter((l) => labels.includes(l.toLowerCase()));
    if (sensitive.length) return `it is labelled as a sensitive area (${sensitive.join(', ')}), which this project keeps with people`;
    const epic = s.epicLabels.filter((l) => labels.includes(l.toLowerCase()));
    if (epic.length) return `it is labelled ${epic.join(', ')}, which is too large for one unattended run`;
    const criteria = String(ticket.body || '').split('\n')
      .filter((l) => /^\s*[-*]\s*\[[ xX]\]/.test(l) || /^\s*(?:[-*]\s*)?AC[-\s]?\d+/i.test(l)).length;
    if (criteria > s.maxAcceptanceCriteria) {
      return `it lists ${criteria} acceptance criteria; the limit for one unattended ticket is ${s.maxAcceptanceCriteria}`;
    }
    if (!String(ticket.title || '').trim() && !String(ticket.body || '').trim()) return 'it has no title or description';
    return '';
  }

  // ------------------------------------------------------------------ one stage

  /** Run the ticket's current stage. Returns true when the chain should continue. */
  async _runStage(run, chain) {
    const def = stageDef(run.stage);
    if (def.kind === 'agent') return this._runAgentStage(run, chain);
    switch (run.stage) {
      case 'intake': return this._stageIntake(run);
      case 'pr': return this._stagePr(run);
      case 'merge': return this._stageMerge(run);
      case 'done': return this._stageDone(run);
      default: throw new Error(`No handler for stage ${run.stage}`);
    }
  }

  async _stageIntake(run) {
    const ticket = await this.board.get(run.ticketId);
    const problem = this._intakeProblem(ticket);
    if (problem) {
      await this._decline(run, `The factory did not start this ticket because ${problem}.`);
      return false;
    }
    const dir = await this.workspace.prepare(run.ticketId, run.branch);
    if (!run.groomed) return this._moveTo(run, 'groom');

    // A person already groomed this ticket: use their requirements and start at design.
    const found = this._groomedFeatureDir(ticket, run, dir);
    if (!found) {
      await this._decline(run, [
        `This ticket was labelled \`${this.config.board.groomedLabel}\`, but the factory could not find its requirements.`,
        `Put the path in the ticket description (for example \`${featureDir(this.config, '<feature>')}/requirements.md\`)`,
        `and make sure the file is on the \`${this.config.repo.baseBranch}\` branch, then add the label again. To have the factory groom the ticket itself, use \`${this.config.board.readyLabel}\` instead.`,
      ].join(' '));
      return false;
    }
    run.featureDir = found;
    run.groomedBy = 'person';
    this.store.save(run);
    this.store.event(run.ticketId, 'groomed_ticket', { requirements: `${found}/requirements.md` });
    await this._guard(run, 'groomed comment', () => this._post(run.ticketId,
      `Picked up as an already groomed ticket. Using \`${found}/requirements.md\` and starting at design.`));
    return this._moveTo(run, 'design');
  }

  /**
   * The feature folder of a ticket a person groomed: the requirements path named in the ticket
   * text, or else the folder the factory would have used. '' when no requirements.md is there.
   */
  _groomedFeatureDir(ticket, run, dir) {
    const base = featureDir(this.config, 'X').slice(0, -1); // "<docsRoot>/features/"
    const text = String(ticket.body || '').replace(/\\/g, '/');
    const candidates = [];
    let from = 0;
    for (;;) {
      const at = text.indexOf(base, from);
      if (at === -1) break;
      const m = text.slice(at + base.length).match(/^([A-Za-z0-9._-]+)\/requirements\.md/);
      if (m && !/^\.+$/.test(m[1])) candidates.push(base + m[1]);
      from = at + base.length;
    }
    candidates.push(run.featureDir);
    return candidates.find((c) => this.workspace.exists(dir, `${c}/requirements.md`)) || '';
  }

  async _moveTo(run, stageName) {
    run.stage = stageName;
    run.status = 'running';
    this.store.save(run);
    this.store.event(run.ticketId, 'stage', { stage: stageName });
    const column = this.config.board.columns && this.config.board.columns[stageName];
    if (column) await this._guard(run, 'column move', () => this.board.setState(run.ticketId, { column }));
    return true;
  }

  _dailyLimitReached() {
    return this.store.spentToday() >= this.config.limits.costPerDayUsd;
  }

  _agentEnv(extraNames = []) {
    const names = AGENT_ENV.concat(this.config.runner.envPassthrough || [], extraNames);
    const env = {};
    for (const name of names) {
      if (this.env[name] !== undefined) env[name] = this.env[name];
    }
    env.ORBIT_FACTORY = '1';
    return env;
  }

  /** Limit checks before a stage (REQ-18, REQ-44). Returns false when the stage must not start. */
  async _limitsAllow(run) {
    const l = this.config.limits;
    if (run.costUsd >= l.costPerTicketUsd) {
      await this._handBack(run, `The ticket reached its cost limit (USD ${run.costUsd.toFixed(2)} of ${l.costPerTicketUsd}).`);
      return false;
    }
    if (run.activeMs >= l.activeHoursPerTicket * HOUR) {
      await this._handBack(run, `The ticket reached its active run-time limit of ${l.activeHoursPerTicket} hours.`);
      return false;
    }
    if (this._dailyLimitReached()) {
      const control = this.store.control();
      const today = this.store.dayKey();
      if (control.dailyLimitNotified !== today) {
        this.store.setControl({ dailyLimitNotified: today });
        await this._notify(run, 'daily_limit', `The project reached its daily spend limit of USD ${l.costPerDayUsd}. No new stage will start today.`);
      }
      if (run.blockedDay !== today) {
        run.blockedDay = today;
        this.store.save(run);
        this.store.event(run.ticketId, 'blocked', { reason: 'daily spend limit' });
      }
      return false;
    }
    return true;
  }

  async _runAgentStage(run, chain, extra = {}) {
    const stageName = run.stage;
    const def = stageDef(stageName);
    const l = this.config.limits;
    if (!(await this._limitsAllow(run))) return false;

    const ticket = extra.ticket || await this.board.get(run.ticketId);
    const dir = extra.dir || await this.workspace.prepare(run.ticketId, run.branch);
    if (run.feedback && run.feedback.source === 'conflict') await this.workspace.fetch(dir);

    const budgetUsd = Math.min(l.costPerStageUsd, l.costPerTicketUsd - run.costUsd, l.costPerDayUsd - this.store.spentToday());
    run.attempts[stageName] = (run.attempts[stageName] || 0) + 1;
    const resumeId = run.resume === stageName ? run.sessions[stageName] : '';
    // The independent reviewer must leave the work exactly as it found it.
    const verifying = stageName === 'verify';
    const before = verifying ? await this.workspace.headSha(dir) : '';
    this.store.save(run);
    this.store.event(run.ticketId, 'stage_start', { stage: stageName, attempt: run.attempts[stageName], resumed: Boolean(resumeId) });

    const outcome = await this.runner.run({
      stage: stageName,
      cwd: dir,
      prompt: buildPrompt(stageName, { config: this.config, run, ticket, ...extra.promptCtx }),
      sessionId: resumeId || undefined,
      budgetUsd,
      timeoutMs: l.hoursPerStage * HOUR,
      env: this._agentEnv(extra.envNames),
      transcriptPath: this.store.transcriptPath(run.ticketId, stageName, run.attempts[stageName]),
      livePath: this.store.livePath(run.ticketId),
      signal: chain ? chain.abort.signal : undefined,
      ...(verifying ? { model: this.config.runner.reviewModel || undefined, denyTools: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'] } : {}),
    });
    if (verifying) {
      // Whatever it did, the branch goes back to what it was reviewing. A reviewer that edits the
      // work is no longer independent of it.
      await this._guard(run, 'restore after review', async () => {
        await this.workspace.git(['reset', '--quiet', '--hard', before], dir);
        await this.workspace.git(['clean', '--quiet', '-fd'], dir);
      });
    }

    // While the agent ran, a person may have taken the ticket over (recorded by _poll). Keep that
    // status: record what this stage cost and do nothing else with its result (REQ-35).
    const onDisk = this.store.load(run.ticketId);
    if (onDisk && onDisk.status === 'taken_over') {
      onDisk.costUsd = round(onDisk.costUsd + outcome.costUsd);
      onDisk.activeMs += outcome.durationMs;
      this.store.addSpend(outcome.costUsd);
      this.store.save(onDisk);
      this.store.event(run.ticketId, 'stage_end', { stage: stageName, problem: 'aborted', detail: 'ticket taken over', costUsd: outcome.costUsd });
      return false;
    }

    run.costUsd = round(run.costUsd + outcome.costUsd);
    run.stageCost[stageName] = round((run.stageCost[stageName] || 0) + outcome.costUsd);
    run.activeMs += outcome.durationMs;
    run.sessions[stageName] = outcome.sessionId;
    run.resume = '';
    this.store.addSpend(outcome.costUsd);
    this.store.save(run);
    this.store.event(run.ticketId, 'stage_end', {
      stage: stageName,
      status: outcome.result ? outcome.result.status : '',
      problem: outcome.problem,
      detail: outcome.detail,
      costUsd: outcome.costUsd,
      durationMs: outcome.durationMs,
      summary: outcome.result ? outcome.result.summary : '',
      assumptions: outcome.result ? outcome.result.assumptions : [],
    });
    if (!run.costWarned && run.costUsd >= l.costPerTicketUsd * l.costWarnShare) {
      run.costWarned = true;
      this.store.save(run);
      await this._notify(run, 'cost_warning', `The ticket has used USD ${run.costUsd.toFixed(2)} of its USD ${l.costPerTicketUsd} limit.`);
    }

    if (outcome.problem === 'aborted') {
      if (chain && chain.reason === 'taken_over') return false; // already recorded by _poll
      this.store.clearStop(run.ticketId);
      await this._handBack(run, 'Stopped by an operator.');
      return false;
    }
    if (extra.raw) return outcome; // the release batch handles its own outcome

    // Keep whatever the agent left uncommitted, so no work is lost on any path below.
    await this._guard(run, 'commit', () => this.workspace.commitAll(dir, `factory(${stageName}): work for #${run.ticketId}`));

    if (outcome.problem === 'budget' || outcome.problem === 'timeout') {
      await this._handBack(run, `Stage ${stageName} stopped at its ${outcome.problem === 'budget' ? 'cost' : 'time'} limit: ${outcome.detail}.`);
      return false;
    }
    if (outcome.problem) return this._stageFailed(run, stageName, `${outcome.problem}: ${outcome.detail}`);

    const result = outcome.result;
    switch (result.status) {
      case 'needs_input':
        if (!result.questions.length) return this._stageFailed(run, stageName, 'it asked for input but returned no questions');
        await this._push(run, dir);
        await this._parkForAnswer(run, stageName, result.questions);
        return false;
      case 'declined':
        await this._decline(run, result.reason || result.summary || `The agent declined the ticket in stage ${stageName}.`);
        return false;
      case 'failed':
        if (stageName === 'test') return this._testsFailed(run, result);
        return this._stageFailed(run, stageName, result.reason || result.summary || 'no reason given');
      default:
        break;
    }

    // status: done
    if (verifying) return this._afterIndependentReview(run, result);
    if (def.artifact && !this.workspace.exists(dir, path.posix.join(run.featureDir, def.artifact))) {
      return this._stageFailed(run, stageName, `it reported done but ${run.featureDir}/${def.artifact} does not exist`);
    }
    if (stageName === 'design') {
      if (!result.size || !Array.isArray(result.size.paths)) return this._stageFailed(run, stageName, 'it reported done without the size estimate and file list');
      const problem = this._sizeProblem(result.size);
      if (problem) {
        await this._push(run, dir);
        await this._decline(run, `After design, the factory stopped this ticket because ${problem}. The requirements and design are on branch \`${run.branch}\`.`);
        return false;
      }
    }
    if (stageName === 'build') {
      // The design named the files it expected to change. Check what was actually changed.
      const changed = await this.workspace.diffSize(dir);
      const hits = sensitiveHits(changed.paths, this.config.suitability.sensitivePaths);
      if (hits.length) {
        await this._handBack(run, `The build changed files in a protected area (${hits.join(', ')}), which this project keeps with people.`);
        return false;
      }
    }
    await this._push(run, dir);
    run.feedback = null;
    run.answers = '';
    run.failures[stageName] = 0;
    this.store.save(run);

    if (def.gateAfter && this.config.gates[def.gateAfter] === true) {
      await this._parkForApproval(run, def.gateAfter, [
        `Stage **${stageName}** is finished and waits for approval.`,
        '',
        result.summary,
        '',
        `Output: \`${run.featureDir}/${def.artifact}\` on branch \`${run.branch}\`.`,
      ].join('\n'));
      return false;
    }
    return this._moveTo(run, nextStage(stageName, this.config));
  }

  /**
   * The independent reviewer's verdict. Blocking findings send the work back to build, a limited
   * number of times; after that it goes to the person anyway, with the findings in front of them.
   * The reviewer never approves a merge: that stays with the person at the merge gate.
   */
  async _afterIndependentReview(run, result) {
    const review = result.review;
    if (!review || !['approve', 'request_changes'].includes(review.verdict) || !Array.isArray(review.findings)) {
      return this._stageFailed(run, 'verify', 'it reported done without a verdict');
    }
    const blocking = review.findings.filter((f) => f.severity === 'blocking');
    const round = (run.rework.verify || 0) + 1;
    const wantsChanges = review.verdict === 'request_changes' && blocking.length > 0;
    run.independentReview = {
      verdict: wantsChanges ? 'request_changes' : 'approve',
      findings: review.findings,
      summary: result.summary || '',
      model: this.config.runner.reviewModel || 'the default model',
      round,
      at: this.now().toISOString(),
      unresolved: false,
    };
    run.failures.verify = 0;
    this.store.event(run.ticketId, 'independent_review', { verdict: run.independentReview.verdict, blocking: blocking.length, notes: review.findings.length - blocking.length, round });
    if (wantsChanges && round <= this.config.limits.independentReviewRounds) {
      run.rework.verify = round;
      run.feedback = {
        source: 'independent review',
        text: blocking.map((f, i) => `${i + 1}. ${f.file ? `${f.file}: ` : ''}${f.text}`).join('\n'),
      };
      run.resume = '';
      this.store.event(run.ticketId, 'rework', { gate: 'independent review', cycle: round });
      return this._moveTo(run, 'build');
    }
    // Out of rounds with findings still open: a person decides, knowing that.
    run.independentReview.unresolved = wantsChanges;
    run.feedback = null;
    this.store.save(run);
    return this._moveTo(run, nextStage('verify', this.config));
  }

  /** What the independent reviewer said, as text for the ticket and the pull request. */
  _independentReviewText(run) {
    const r = run.independentReview;
    if (!r) return '';
    const head = r.unresolved
      ? `**Independent review: changes still requested** after ${r.round} round(s). The points below were not resolved.`
      : `**Independent review: approved**${r.round > 1 ? ` after ${r.round - 1} round(s) of fixes` : ''}.`;
    const lines = r.findings.map((f) => `- ${f.severity === 'blocking' ? '**Blocking**' : 'Note'}${f.file ? ` (\`${f.file}\`)` : ''}: ${f.text}`);
    return [head, r.summary, ...lines, '', 'This is a second opinion from an agent that did not write the change. It does not replace your approval.'].filter((x) => x !== '').join('\n');
  }

  /** After-design size and sensitivity check (REQ-23, AC-38). */
  _sizeProblem(size) {
    const s = this.config.suitability;
    // Decided here from the planned file paths, not by asking the agent whether the work is
    // "sensitive": a billing library is not a sensitive change just because it is about billing.
    const hits = sensitiveHits(size.paths || [], s.sensitivePaths);
    if (hits.length) return `it would change files in a protected area (${hits.join(', ')})`;
    if (size.files > s.maxFiles) return `the design needs about ${size.files} files; the limit is ${s.maxFiles}`;
    if (size.changedLines > s.maxChangedLines) return `the design needs about ${size.changedLines} changed lines; the limit is ${s.maxChangedLines}`;
    if (size.services > s.maxServices) return `the design touches ${size.services} services; the limit is ${s.maxServices}`;
    return '';
  }

  async _stageFailed(run, stageName, why) {
    run.failures[stageName] = (run.failures[stageName] || 0) + 1;
    run.sessions[stageName] = '';
    this.store.save(run);
    if (run.failures[stageName] > this.config.limits.stageRetries) {
      await this._handBack(run, `Stage ${stageName} could not finish after ${run.failures[stageName]} attempts. Last cause: ${why}.`);
      return false;
    }
    this.store.event(run.ticketId, 'retry', { stage: stageName, why });
    return true; // the chain runs the same stage again
  }

  async _testsFailed(run, result) {
    run.fixAttempts += 1;
    const why = result.reason || result.summary || 'tests failed';
    if (run.fixAttempts > this.config.limits.testFixAttempts) {
      this.store.save(run);
      await this._handBack(run, `Tests are still failing after ${this.config.limits.testFixAttempts} fix attempts. Last report: ${why}`);
      return false;
    }
    run.feedback = { source: 'test', text: why };
    this.store.event(run.ticketId, 'fix_attempt', { attempt: run.fixAttempts });
    return this._moveTo(run, 'build');
  }

  /**
   * Push the ticket branch. A code host can refuse a push for a moment (seen on GitHub when two
   * tickets pushed at the same instant), so a failed push is tried again before it is an error.
   */
  async _push(run, dir) {
    const delays = this.pushRetryDelaysMs || [2000, 6000];
    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.codeHost.push(dir, run.branch);
        return;
      } catch (err) {
        if (attempt >= delays.length) throw err;
        this.store.event(run.ticketId, 'push_retry', { attempt: attempt + 1, message: String(err.message).slice(0, 300) });
        await new Promise((resolve) => { setTimeout(resolve, delays[attempt]); });
      }
    }
  }

  // ------------------------------------------------------------------ pr, merge, done

  async _stagePr(run) {
    const dir = await this.workspace.prepare(run.ticketId, run.branch);
    await this._push(run, dir);
    if (!run.pr) {
      run.pr = await this.codeHost.openPr({
        branch: run.branch,
        base: this.config.repo.baseBranch,
        title: `${run.title} (#${run.ticketId})`,
        body: [
          `Ticket: #${run.ticketId} ${run.url}`,
          '',
          `Built by the Agentic Factory. Requirements, design and test plan are in \`${run.featureDir}/\`.`,
          '',
          this._hostWords().prNote,
        ].join('\n'),
      });
      this.store.save(run);
      this.store.event(run.ticketId, 'pr_opened', { pr: run.pr });
    }
    run.stage = 'merge';
    const second = this._independentReviewText(run);
    await this._parkForApproval(run, 'merge', `Pull request ready for review: ${run.pr.url}${second ? `\n\n${second}` : ''}`);
    return false;
  }

  /** Post a comment as the factory, marked so the factory can recognise it later. */
  async _post(ticketId, body) {
    return this.board.comment(ticketId, `${body}\n\n${FACTORY_MARK}`);
  }

  _single() {
    return this.config.trial.singleAccount === true;
  }

  _inRole(role, user, reporter) {
    return inRole(this.config, role, user, reporter);
  }

  /**
   * What people said since the factory asked: ticket comments, plus decisions made on the status
   * page. A status-page decision is turned into the same shape as a comment, so one piece of code
   * checks who it is from and what it says, wherever it was given.
   */
  async _commentsAndDecisions(run) {
    const comments = await this.board.commentsSince(run.ticketId, run.pending.since);
    const seen = run.decisionsSeen || [];
    const fresh = this.store.decisions(run.ticketId).filter((d) => !seen.includes(d.id));
    if (!fresh.length) return comments;
    // Each decision is looked at once. One that does not match what is being asked now is dropped.
    run.decisionsSeen = seen.concat(fresh.map((d) => d.id));
    this.store.save(run);
    const p = run.pending;
    const usable = fresh.filter((d) => new Date(d.at) >= new Date(p.since)
      && (d.kind === 'answer' ? p.kind === 'answer' && d.stage === p.stage : p.kind === 'approval' && d.gate === p.gate));
    const asComments = usable.map((d) => ({
      id: `page-${d.id}`,
      author: d.by,
      createdAt: d.at,
      viaStatusPage: true,
      body: d.kind === 'approve' ? 'approve' : d.kind === 'reject' ? `reject ${d.text || ''}` : String(d.text || ''),
    }));
    return comments.concat(asComments).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  /** Put a status-page decision on the ticket too, so the ticket stays the complete record. */
  async _recordOnTicket(run, comment, text) {
    if (!comment.viaStatusPage) return;
    await this._guard(run, 'record on ticket', () => this._post(run.ticketId, text));
  }

  /** The newest review from each named merge approver. */
  /** Words for the code review step. A code host may supply its own (`codeHost.words`). */
  _hostWords() {
    return this.codeHost.words || {
      prNote: 'This pull request needs an approving review from a named merge approver before the factory merges it. To send it back, submit a review that requests changes.',
      approveHow: (who) => `Approve by submitting an approving review on the pull request. Only a review from ${who} counts, and it must be on the latest commit.`,
    };
  }

  _approverReviews(run, status) {
    const latest = new Map();
    for (const r of status.reviews) {
      if (r.state === 'commented') continue;
      if (this._inRole('mergeApprover', r.author, run.reporter)) latest.set(r.author, r);
    }
    return [...latest.values()];
  }

  _stageMerge(run) {
    const next = this.mergeQueue.then(() => this._mergeNow(run));
    this.mergeQueue = next.catch(() => {});
    return next;
  }

  async _mergeNow(run) {
    const status = await this.codeHost.prStatus(run.pr.id);
    if (status.state === 'merged') return this._afterMerge(run, 'a person');
    if (status.state === 'closed') {
      await this._handBack(run, 'The pull request was closed without being merged.');
      return false;
    }
    // Re-check the approval against the current head: an approval on an older commit is void (REQ-41).
    let approval = this._approverReviews(run, status).find((r) => r.state === 'approved' && r.sha === status.headSha);
    const byComment = run.approvals.mergeComment;
    if (!approval && this._single() && byComment && byComment.sha === status.headSha) {
      approval = { author: byComment.by, submittedAt: byComment.at, sha: byComment.sha };
    }
    if (!approval) {
      await this._parkForApproval(run, 'merge', `The pull request changed after it was approved, so it needs approval again: ${run.pr.url}`);
      return false;
    }
    if (status.mergeable === false) {
      return this._rework(run, 'merge', { source: 'conflict', text: `The branch conflicts with ${this.config.repo.baseBranch} and cannot be merged.` });
    }
    try {
      await this.codeHost.merge(run.pr.id);
    } catch (err) {
      if (err.conflict) {
        return this._rework(run, 'merge', { source: 'conflict', text: `The branch conflicts with ${this.config.repo.baseBranch} and cannot be merged.` });
      }
      // Never force a merge the code host refuses (REQ-40, AC-34).
      await this._handBack(run, `The code host refused the merge: ${err.message}`);
      return false;
    }
    run.approvals.merge = { by: approval.author, at: approval.submittedAt, sha: approval.sha };
    return this._afterMerge(run, 'the factory');
  }

  async _afterMerge(run, by) {
    this.store.event(run.ticketId, 'merged', { by, pr: run.pr });
    run.stage = 'release';
    await this._parkForApproval(run, 'release', [
      `The pull request was merged by ${by}.`,
      '',
      `Release level for this project: \`${this.config.release.level}\`.`,
    ].join('\n'));
    return false;
  }

  async _stageDone(run) {
    await this.board.close(run.ticketId);
    await this.board.release(run.ticketId);
    run.status = 'done';
    this.store.save(run);
    this.store.event(run.ticketId, 'done', { costUsd: run.costUsd });
    return false;
  }

  // ------------------------------------------------------------------ release (serialised)

  _maybeRelease() {
    if (this.releasing) return;
    const ready = this.store.active().filter((r) => r.status === 'running' && r.stage === 'release');
    if (!ready.length) return;
    const queued = this.mergeQueue.then(() => this._release(ready));
    this.mergeQueue = queued.catch(() => {});
    this.releasing = queued
      .catch((err) => this.log(`release error: ${err.stack || err.message}`))
      .finally(() => { this.releasing = null; });
  }

  /** One release for every merged ticket whose release is approved (REQ-30). */
  async _release(runs) {
    const lead = runs[0];
    const base = this.config.repo.baseBranch;
    let outcome;
    try {
      const dir = await this.workspace.prepare(lead.ticketId, lead.branch);
      await this.workspace.checkoutBase(dir);
      outcome = await this._runAgentStage(lead, null, {
        raw: true,
        dir,
        envNames: this.config.release.envPassthrough || [], // release credentials, only here (REQ-43)
        promptCtx: {
          releaseTickets: runs.map((r) => `#${r.ticketId} ${r.title}`).join('; '),
          approvedBy: [...new Set(runs.map((r) => r.approvals.release && r.approvals.release.by).filter(Boolean))].join(', '),
        },
      });
      if (outcome === false) return; // a limit stopped it; _runAgentStage already handled the lead
      if (outcome.result && outcome.result.status === 'done') {
        await this.workspace.commitAll(dir, `factory(release): ${runs.map((r) => `#${r.ticketId}`).join(' ')}`);
        // Push the base branch only if the release steps added commits (a version bump, say),
        // and never by force. A release that only tags pushes just the tag.
        const ahead = Number(await this.workspace.git(['rev-list', '--count', `origin/${base}..HEAD`], dir));
        if (ahead > 0) await this.codeHost.push(dir, base, { shared: true });
        if (typeof this.codeHost.pushTags === 'function') await this.codeHost.pushTags(dir);
      }
    } catch (err) {
      outcome = { result: null, problem: 'crash', detail: err.message };
    }
    const ok = outcome.result && outcome.result.status === 'done' && !outcome.problem;
    for (const stale of runs) {
      const run = this.store.load(stale.ticketId);
      if (!run || run.status !== 'running') continue;
      if (ok) {
        await this._guard(run, 'release comment', () => this._post(run.ticketId, `Released (level \`${this.config.release.level}\`).\n\n${outcome.result.summary}`));
        await this._notify(run, 'released', `Released at level ${this.config.release.level}.`);
        this.store.event(run.ticketId, 'released', { level: this.config.release.level });
        await this._moveTo(run, 'done'); // also applies the stage-to-column map (REQ-6)
        await this._guard(run, 'close', () => this._stageDone(run));
      } else {
        // A failed release is never retried without a person (REQ-31).
        const why = outcome.result ? (outcome.result.reason || outcome.result.summary) : `${outcome.problem}: ${outcome.detail}`;
        await this._guard(run, 'hand-back', () => this._handBack(run, `The release failed and was not retried. ${why}`));
      }
    }
  }

  // ------------------------------------------------------------------ parking

  async _parkForAnswer(run, stageName, questions) {
    const who = this._roleNames('answer', run);
    const body = [
      `### The factory needs an answer to continue (stage: ${stageName})`,
      '',
      ...questions.map((q, i) => {
        const options = q.options && q.options.length ? `\n   Options: ${q.options.join(' / ')}` : '';
        return `${i + 1}. **${q.question}**\n   Why it matters: ${q.why}${options}`;
      }),
      '',
      `Reply in one comment on this ticket. Only a reply from ${who} is used.`,
      '',
      '<!-- orbit-factory:question -->',
    ].join('\n');
    const comment = await this._post(run.ticketId, body);
    run.status = 'waiting_answer';
    run.resume = stageName;
    run.pending = { kind: 'answer', stage: stageName, questions, since: comment.createdAt, reminded: false, escalated: false };
    this.store.save(run);
    this.store.event(run.ticketId, 'question', { stage: stageName, questions });
    await this._guard(run, 'waiting label', () => this.board.setState(run.ticketId, { waiting: true }));
    await this._notify(run, 'question', `${questions.length} question(s) in stage ${stageName}.`, this.config.roles.answer);
  }

  async _parkForApproval(run, gate, text) {
    const role = GATE_ROLE[gate];
    const who = this._roleNames(role, run);
    const how = gate === 'merge' && this._single()
      ? `Single-account trial: reply \`approve\` on this ticket to merge the pull request, or \`reject <what to change>\`. Only a reply from ${who} counts.`
      : gate === 'merge'
      ? this._hostWords().approveHow(who)
      : `Reply \`approve\` on this ticket to continue, or \`reject <what to change>\`. Only a reply from ${who} counts.`;
    const comment = await this._post(run.ticketId, [
      `### Approval needed: ${gate}`,
      '',
      text,
      '',
      how,
      '',
      `<!-- orbit-factory:approval ${gate} -->`,
    ].join('\n'));
    run.status = 'waiting_approval';
    run.pending = { kind: 'approval', gate, since: comment.createdAt, reminded: false, escalated: false };
    this.store.save(run);
    this.store.event(run.ticketId, 'approval_needed', { gate });
    await this._guard(run, 'waiting label', () => this.board.setState(run.ticketId, { waiting: true }));
    await this._notify(run, 'approval_needed', `Approval needed at the ${gate} gate.`, this.config.roles[role]);
  }

  _roleNames(role, run) {
    return roleNames(this.config, role, run.reporter);
  }

  // ------------------------------------------------------------------ polling parked and running tickets

  async _poll(run) {
    const ticket = await this.board.get(run.ticketId);
    const bot = this.config.board.botUser;
    const human = ticket.assignees.find((a) => a !== bot);
    const lostMarker = !ticket.labels.includes(this.config.board.ownedLabel);
    if (ticket.state === 'closed' || human || lostMarker) {
      const why = ticket.state === 'closed' ? 'the ticket was closed'
        : human ? `the ticket was assigned to ${human}` : 'the factory ownership label was removed';
      return this._takenOver(run, why);
    }
    if (this.chains.has(run.ticketId)) return undefined;
    if (run.status === 'waiting_answer') return this._checkAnswer(run, ticket);
    if (run.status === 'waiting_approval') return this._checkApproval(run, ticket);
    return undefined;
  }

  /** A person took the ticket: stop and touch nothing else (REQ-35). */
  async _takenOver(run, why) {
    const chain = this.chains.get(run.ticketId);
    if (chain) {
      chain.reason = 'taken_over';
      chain.abort.abort();
    }
    run.status = 'taken_over';
    run.pending = null;
    this.store.save(run);
    this.store.event(run.ticketId, 'taken_over', { why });
    await this._notify(run, 'taken_over', `The factory stopped working on this ticket because ${why}. Branch \`${run.branch}\` is left as it is.`);
  }

  async _checkAnswer(run, ticket) {
    const comments = await this._commentsAndDecisions(run);
    const answers = comments.filter((c) => !isFactoryComment(c) && this._inRole('answer', c.author, ticket.reporter));
    if (!answers.length) return this._timers(run, 'an answer');
    for (const c of answers) {
      await this._recordOnTicket(run, c, `**Answer from ${c.author}**, given on the status page:\n\n${quote(c.body)}`);
    }
    const text = answers.map((c) => `**${c.author}** (${c.createdAt}):\n\n${quote(c.body)}`).join('\n\n');
    const dir = await this.workspace.prepare(run.ticketId, run.branch);
    this.workspace.appendFile(dir, path.posix.join(run.featureDir, 'decisions-log.md'), [
      `## ${this.now().toISOString().slice(0, 10)} — questions from stage ${run.pending.stage}`,
      '',
      ...run.pending.questions.map((q, i) => `${i + 1}. ${q.question}`),
      '',
      text,
      '',
      '',
    ].join('\n'));
    await this.workspace.commitAll(dir, `docs: record answers for #${run.ticketId} (${run.pending.stage})`);
    await this._push(run, dir);
    run.answers = text;
    run.pending = null;
    run.status = 'running';
    this.store.save(run);
    this.store.event(run.ticketId, 'answered', { by: answers.map((c) => c.author) });
    await this._guard(run, 'waiting label', () => this.board.setState(run.ticketId, { waiting: false }));
    return undefined;
  }

  async _checkApproval(run, ticket) {
    const gate = run.pending.gate;
    if (gate === 'merge') return this._checkMergeApproval(run);
    const role = GATE_ROLE[gate];
    const comments = await this._commentsAndDecisions(run);
    for (const c of comments) {
      if (isFactoryComment(c) || !this._inRole(role, c.author, ticket.reporter)) continue; // REQ-39
      const decision = decisionOf(c.body);
      if (decision && decision.approve) {
        if (gate === 'release' && this.config.release.level === 'production'
          && run.approvals.merge && run.approvals.merge.by === c.author) {
          if (!run.pending.distinctNoted) {
            run.pending.distinctNoted = true;
            this.store.save(run);
            await this._post(run.ticketId, `A production release needs a different approver from the person who approved the merge (${c.author}).`);
          }
          continue;
        }
        run.approvals[gate] = { by: c.author, at: c.createdAt };
        run.pending = null;
        await this._recordOnTicket(run, c, `**Approved** at the ${gate} stop by ${c.author}, on the status page.`);
        this.store.event(run.ticketId, 'approved', { gate, by: c.author, ...(c.viaStatusPage ? { how: 'status page' } : {}) });
        await this._guard(run, 'waiting label', () => this.board.setState(run.ticketId, { waiting: false }));
        if (gate === 'release') {
          run.status = 'running'; // stage is already 'release'; the release batch picks it up
          this.store.save(run);
          return undefined;
        }
        await this._moveTo(run, nextStage(REWORK_STAGE[gate], this.config));
        return undefined;
      }
      if (decision && decision.reject) {
        const feedback = decision.text || 'Rejected without a stated reason.';
        await this._recordOnTicket(run, c, `**Sent back** at the ${gate} stop by ${c.author}, on the status page:\n\n${quote(feedback)}`);
        this.store.event(run.ticketId, 'rejected', { gate, by: c.author });
        if (gate === 'release') {
          await this._handBack(run, `The release was declined by ${c.author}: ${feedback} The change is already merged.`);
          return undefined;
        }
        await this._rework(run, gate, { source: `${gate} gate, ${c.author}`, text: feedback });
        return undefined;
      }
    }
    return this._timers(run, `approval at the ${gate} gate`);
  }

  async _checkMergeApproval(run) {
    const status = await this.codeHost.prStatus(run.pr.id);
    if (status.state === 'merged') {
      run.pending = null;
      await this._guard(run, 'waiting label', () => this.board.setState(run.ticketId, { waiting: false }));
      await this._afterMerge(run, 'a person');
      return undefined;
    }
    if (status.state === 'closed') {
      await this._handBack(run, 'The pull request was closed without being merged.');
      return undefined;
    }
    if (this._single()) {
      // A code host does not let an account approve its own pull request, so in a single-account
      // trial the approval is a comment on the ticket. It is tied to the commit it was given for.
      const comments = await this._commentsAndDecisions(run);
      for (const c of comments) {
        if (isFactoryComment(c) || !this._inRole('mergeApprover', c.author, run.reporter)) continue;
        const decision = decisionOf(c.body);
        if (decision && decision.approve) {
          run.approvals.mergeComment = { by: c.author, at: c.createdAt, sha: status.headSha };
          await this._recordOnTicket(run, c, `**Approved** for merge by ${c.author}, on the status page.`);
          run.pending = null;
          run.status = 'running'; // stage is already 'merge'
          this.store.save(run);
          this.store.event(run.ticketId, 'approved', { gate: 'merge', by: c.author, how: 'comment (single-account trial)' });
          await this._guard(run, 'waiting label', () => this.board.setState(run.ticketId, { waiting: false }));
          return undefined;
        }
        if (decision && decision.reject) {
          const feedback = decision.text || 'Rejected without a stated reason.';
          await this._recordOnTicket(run, c, `**Sent back** at code review by ${c.author}, on the status page:\n\n${quote(feedback)}`);
          this.store.event(run.ticketId, 'rejected', { gate: 'merge', by: c.author });
          await this._rework(run, 'merge', { source: `code review, ${c.author}`, text: feedback });
          return undefined;
        }
      }
    }
    const reviews = this._approverReviews(run, status);
    const changes = reviews.filter((r) => r.state === 'changes_requested' && new Date(r.submittedAt) > new Date(run.pending.since));
    if (changes.length) {
      const text = changes.map((r) => `${r.author}: ${r.body || '(no text)'}`).join('\n\n');
      this.store.event(run.ticketId, 'rejected', { gate: 'merge', by: changes.map((r) => r.author) });
      await this._rework(run, 'merge', { source: 'pull request review', text });
      return undefined;
    }
    if (reviews.some((r) => r.state === 'approved' && r.sha === status.headSha)) {
      run.pending = null;
      run.status = 'running'; // stage is already 'merge'
      this.store.save(run);
      this.store.event(run.ticketId, 'approved', { gate: 'merge' });
      await this._guard(run, 'waiting label', () => this.board.setState(run.ticketId, { waiting: false }));
      return undefined;
    }
    return this._timers(run, 'a pull request review');
  }

  /** Send a stage back for rework, up to the limit (REQ-13, AC-36). */
  async _rework(run, gate, feedback) {
    run.rework[gate] = (run.rework[gate] || 0) + 1;
    if (run.rework[gate] > this.config.limits.reworkCyclesPerGate) {
      await this._handBack(run, `The ${gate} gate sent the work back more than ${this.config.limits.reworkCyclesPerGate} times.`);
      return false;
    }
    const target = REWORK_STAGE[gate];
    run.feedback = feedback;
    run.resume = target;
    run.pending = null;
    this.store.event(run.ticketId, 'rework', { gate, cycle: run.rework[gate] });
    await this._guard(run, 'waiting label', () => this.board.setState(run.ticketId, { waiting: false }));
    return this._moveTo(run, target);
  }

  /** Reminder, escalation and maximum parked age, in working time (REQ-15, REQ-42). */
  async _timers(run, what) {
    const w = this.config.waiting;
    const hours = workingMsBetween(this.config.calendar, run.pending.since, this.now()) / HOUR;
    if (hours >= w.maxParkedDays * workingDayHours(this.config.calendar)) {
      await this._handBack(run, `The ticket waited more than ${w.maxParkedDays} working days for ${what}.`);
      return;
    }
    if (!run.pending.escalated && hours >= w.escalationHours) {
      run.pending.escalated = true;
      run.pending.reminded = true;
      this.store.save(run);
      this.store.event(run.ticketId, 'escalation', { waitingFor: what });
      await this._guard(run, 'escalation comment', () => this._post(run.ticketId, `Escalation: the factory has waited ${Math.floor(hours)} working hours for ${what}.`));
      await this._notify(run, 'escalation', `Still waiting for ${what} after ${Math.floor(hours)} working hours.`, this.config.roles.escalation);
      return;
    }
    if (!run.pending.reminded && hours >= w.reminderHours) {
      run.pending.reminded = true;
      this.store.save(run);
      this.store.event(run.ticketId, 'reminder', { waitingFor: what });
      await this._guard(run, 'reminder comment', () => this._post(run.ticketId, `Reminder: the factory is waiting for ${what}.`));
      await this._notify(run, 'reminder', `Waiting for ${what}.`);
    }
  }

  // ------------------------------------------------------------------ endings

  /** Stop, keep the work, report, give the ticket back to people (REQ-17). */
  async _handBack(run, reason) {
    let pushed = '';
    try {
      const dir = this.workspace.dirFor(run.ticketId);
      if (this.workspace.exists(dir, '.git')) {
        await this.workspace.commitAll(dir, `factory: work in progress for #${run.ticketId}`);
        if ((await this.workspace.git(['rev-parse', '--abbrev-ref', 'HEAD'], dir)) === run.branch) {
          await this._push(run, dir);
          pushed = `Work so far is on branch \`${run.branch}\`.`;
        }
      }
    } catch (err) {
      pushed = `The work so far could not be pushed (${err.message}); it is kept in the factory workspace.`;
    }
    const stageAt = run.stage;
    run.status = 'handed_back';
    run.pending = null;
    run.handBackReason = reason;
    this.store.save(run);
    this.store.event(run.ticketId, 'handed_back', { stage: stageAt, reason });
    await this._guard(run, 'hand-back comment', () => this._post(run.ticketId, [
      '### The factory handed this ticket back',
      '',
      `**Stage:** ${stageAt}`,
      `**Cause:** ${reason}`,
      `**Cost so far:** USD ${run.costUsd.toFixed(2)}`,
      '',
      pushed,
      run.pr ? `Pull request: ${run.pr.url}` : '',
    ].filter((l) => l !== '').join('\n')));
    await this._guard(run, 'release ticket', () => this.board.release(run.ticketId));
    await this._notify(run, 'handed_back', reason, this.config.roles.escalation);
  }

  /** Refuse a ticket and return it to people with the reason (REQ-24). */
  async _decline(run, reason) {
    run.status = 'declined';
    run.pending = null;
    run.declineReason = reason;
    this.store.save(run);
    this.store.event(run.ticketId, 'declined', { stage: run.stage, reason });
    await this._guard(run, 'decline comment', () => this._post(run.ticketId, `### The factory declined this ticket\n\n${reason}`));
    await this._guard(run, 'release ticket', () => this.board.release(run.ticketId, { declined: true }));
    await this._notify(run, 'declined', reason);
  }

  async _notify(run, type, text, mention) {
    try {
      await this.notifier.notify({ type, ticketId: run.ticketId, title: run.title, url: run.url, text, mention: mention || [] });
    } catch (err) {
      this.log(`notify failed: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------ reporting

  /** What an operator sees (REQ-26). */
  status() {
    const now = this.now();
    return this.store.all().map((r) => ({
      ticketId: r.ticketId,
      title: r.title,
      status: r.status,
      stage: r.stage,
      waitingFor: r.pending ? (r.pending.kind === 'answer' ? `answer (${r.pending.stage})` : `approval (${r.pending.gate})`) : '',
      waitingHours: r.pending ? Math.round((now - new Date(r.pending.since)) / HOUR * 10) / 10 : 0,
      costUsd: r.costUsd,
      activeMinutes: Math.round(r.activeMs / 60000),
      branch: r.branch,
      pr: r.pr ? r.pr.url : '',
      reason: r.handBackReason || r.declineReason || '',
    }));
  }
}

/** Turn a path pattern (`**` any depth, `*` within one folder) into a regular expression. */
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*') {
      i += 1;
      if (glob[i + 1] === '/') { i += 1; re += '(?:.*/)?'; } else re += '.*';
    } else if (ch === '*') re += '[^/]*';
    else re += ch.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** Which of `paths` fall under a protected pattern, as "path (pattern)". */
function sensitiveHits(paths, patterns) {
  const out = [];
  for (const p of paths) {
    const file = String(p).replace(/\\/g, '/').replace(/^\.\//, '');
    const pattern = patterns.find((g) => globToRegExp(g).test(file));
    if (pattern) out.push(`${file} matches ${pattern}`);
  }
  return out;
}

function round(n) {
  return Math.round(n * 1e6) / 1e6;
}

function quote(text) {
  return String(text).split('\n').map((l) => `> ${l}`).join('\n');
}

module.exports = { Factory, AGENT_ENV, globToRegExp, sensitiveHits, FACTORY_MARK, isFactoryComment, decisionOf };
