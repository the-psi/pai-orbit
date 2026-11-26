'use strict';
// Unit tests for the GitHub board. No gh process is started: a fake exec records every call and
// answers from canned results.

const test = require('node:test');
const assert = require('node:assert/strict');
const { GitHubBoard } = require('../src/boards/github');

const REPO = 'acme/widgets';

/** True when `tokens` appear in `args` as a consecutive run. */
function seq(...tokens) {
  return (command, args) => {
    for (let i = 0; i + tokens.length <= args.length; i += 1) {
      if (tokens.every((t, j) => args[i + j] === t)) return true;
    }
    return false;
  };
}

/** routes: [matcher(command, args), result | (command, args, opts) => result][] — first match wins. */
function fakeExec(routes = []) {
  const calls = [];
  const exec = async (command, args, opts = {}) => {
    calls.push({ command, args, input: opts.input, cwd: opts.cwd });
    for (const [match, result] of routes) {
      if (match(command, args)) {
        const r = typeof result === 'function' ? result(command, args, opts) : result;
        return { code: 0, stdout: '', stderr: '', timedOut: false, aborted: false, ...r };
      }
    }
    return { code: 0, stdout: '', stderr: '', timedOut: false, aborted: false };
  };
  return { exec, calls };
}

function board(routes) {
  const fake = fakeExec(routes);
  const b = new GitHubBoard({
    repo: REPO,
    readyLabel: 'factory-ready',
    ownedLabel: 'factory-owned',
    waitingLabel: 'factory-waiting',
    declinedLabel: 'factory-declined',
    botUser: 'orbit-bot',
    exec: fake.exec,
    now: () => new Date('2026-03-01T10:00:00.000Z'),
  });
  return { b, calls: fake.calls };
}

function issue(number, extra = {}) {
  return {
    number,
    title: `Ticket ${number}`,
    body: 'Body',
    labels: [{ name: 'factory-ready' }],
    assignees: [],
    author: { login: 'alice' },
    url: `https://github.com/${REPO}/issues/${number}`,
    state: 'OPEN',
    ...extra,
  };
}

test('listEligible asks gh for open ready issues and maps them to tickets', async () => {
  const { b, calls } = board([[seq('issue', 'list'), { stdout: JSON.stringify([issue(7)]) }]]);
  const tickets = await b.listEligible();
  assert.deepEqual(calls[0].args, [
    'issue', 'list', '--repo', REPO, '--state', 'open', '--label', 'factory-ready',
    '--limit', '100', '--json', 'number,title,body,labels,assignees,author,url,state',
  ]);
  assert.equal(calls[0].command, 'gh');
  assert.deepEqual(tickets, [{
    id: '7',
    title: 'Ticket 7',
    body: 'Body',
    labels: ['factory-ready'],
    assignees: [],
    reporter: 'alice',
    state: 'open',
    url: `https://github.com/${REPO}/issues/7`,
  }]);
});

test('listEligible drops owned tickets and tickets assigned to a human', async () => {
  const issues = [
    issue(1),
    issue(2, { labels: [{ name: 'factory-ready' }, { name: 'factory-owned' }] }),
    issue(3, { assignees: [{ login: 'bob' }] }),
    issue(4, { assignees: [{ login: 'orbit-bot' }] }),
    issue(5, { assignees: [{ login: 'orbit-bot' }, { login: 'bob' }] }),
  ];
  const { b } = board([[seq('issue', 'list'), { stdout: JSON.stringify(issues) }]]);
  const tickets = await b.listEligible();
  assert.deepEqual(tickets.map((t) => t.id), ['1', '4']);
});

test('listEligible returns an empty list when gh prints nothing', async () => {
  const { b } = board([[seq('issue', 'list'), { stdout: '' }]]);
  assert.deepEqual(await b.listEligible(), []);
});

test('get views one issue and lower-cases its state', async () => {
  const { b, calls } = board([
    [seq('issue', 'view'), { stdout: JSON.stringify(issue(12, { state: 'CLOSED', body: null })) }],
  ]);
  const t = await b.get('12');
  assert.deepEqual(calls[0].args, [
    'issue', 'view', '12', '--repo', REPO, '--json', 'number,title,body,labels,assignees,author,url,state',
  ]);
  assert.equal(t.id, '12');
  assert.equal(t.state, 'closed');
  assert.equal(t.body, '');
  assert.equal(t.reporter, 'alice');
});

test('claim adds owned, removes ready and assigns the bot in one edit', async () => {
  const { b, calls } = board();
  await b.claim('7');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, [
    'issue', 'edit', '7', '--repo', REPO,
    '--add-label', 'factory-owned', '--remove-label', 'factory-ready', '--add-assignee', 'orbit-bot',
  ]);
});

test('release removes owned and waiting labels and the bot assignee', async () => {
  const { b, calls } = board();
  await b.release('7');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, [
    'issue', 'edit', '7', '--repo', REPO,
    '--remove-label', 'factory-owned', '--remove-label', 'factory-waiting', '--remove-assignee', 'orbit-bot',
  ]);
  assert.ok(!calls[0].args.includes('factory-declined'));
  assert.ok(!calls[0].args.includes('factory-ready'), 'the ready label is not restored');
});

test('release with declined also adds the declined label', async () => {
  const { b, calls } = board();
  await b.release('7', { declined: true });
  assert.deepEqual(calls[0].args.slice(-2), ['--add-label', 'factory-declined']);
  assert.ok(seq('--remove-label', 'factory-owned')('gh', calls[0].args));
  assert.ok(seq('--remove-assignee', 'orbit-bot')('gh', calls[0].args));
});

test('comment sends the body on stdin, not on the command line', async () => {
  const body = '## Question\n\nLine with "quotes" and --flags\n- item';
  const { b, calls } = board([
    [seq('issue', 'comment'), { stdout: `https://github.com/${REPO}/issues/7#issuecomment-987654\n` }],
  ]);
  const c = await b.comment('7', body);
  assert.deepEqual(calls[0].args, ['issue', 'comment', '7', '--repo', REPO, '--body-file', '-']);
  assert.equal(calls[0].input, body);
  assert.ok(!calls[0].args.some((a) => a.includes('Question')));
  assert.deepEqual(c, { id: '987654', author: 'orbit-bot', body, createdAt: '2026-03-01T10:00:00.000Z' });
});

test('comment still returns a Comment when gh prints no comment URL', async () => {
  const { b } = board([[seq('issue', 'comment'), { stdout: '' }]]);
  const c = await b.comment('7', 'hello');
  assert.equal(c.id, '');
  assert.equal(c.author, 'orbit-bot');
  assert.equal(c.body, 'hello');
});

test('commentsSince reads concatenated pages, keeps strictly newer comments, oldest first', async () => {
  const since = '2026-03-01T10:00:00.000Z';
  const page1 = [
    { id: 3, user: { login: 'carol' }, body: 'third', created_at: '2026-03-01T10:05:00Z' },
    { id: 1, user: { login: 'alice' }, body: 'exactly at since', created_at: '2026-03-01T10:00:00Z' },
    { id: 0, user: { login: 'alice' }, body: 'old, edited later', created_at: '2026-02-01T00:00:00Z' },
  ];
  const page2 = [
    { id: 2, user: { login: 'bob' }, body: 'tricky ][ }{ "text" \\ in body', created_at: '2026-03-01T10:00:01Z' },
  ];
  const { b, calls } = board([
    [seq('api', '--paginate'), { stdout: `${JSON.stringify(page1)}${JSON.stringify(page2)}\n` }],
  ]);
  const comments = await b.commentsSince('7', since);
  assert.deepEqual(calls[0].args, [
    'api', '--paginate', `repos/${REPO}/issues/7/comments?since=${since}&per_page=100`,
  ]);
  assert.deepEqual(comments, [
    { id: '2', author: 'bob', body: 'tricky ][ }{ "text" \\ in body', createdAt: '2026-03-01T10:00:01Z' },
    { id: '3', author: 'carol', body: 'third', createdAt: '2026-03-01T10:05:00Z' },
  ]);
});

test('commentsSince handles a single page and an empty result', async () => {
  const one = [{ id: 9, user: { login: 'dave' }, body: 'hi', created_at: '2026-03-02T00:00:00Z' }];
  const single = board([[seq('api', '--paginate'), { stdout: JSON.stringify(one) }]]);
  assert.equal((await single.b.commentsSince('7', '2026-03-01T00:00:00.000Z')).length, 1);
  const empty = board([[seq('api', '--paginate'), { stdout: '[]' }]]);
  assert.deepEqual(await empty.b.commentsSince('7', '2026-03-01T00:00:00.000Z'), []);
});

test('setState adds or removes the waiting label', async () => {
  const { b, calls } = board();
  await b.setState('7', { waiting: true });
  await b.setState('7', { waiting: false });
  assert.deepEqual(calls[0].args, ['issue', 'edit', '7', '--repo', REPO, '--add-label', 'factory-waiting']);
  assert.deepEqual(calls[1].args, ['issue', 'edit', '7', '--repo', REPO, '--remove-label', 'factory-waiting']);
});

test('setState ignores the column and never throws because of it', async () => {
  const failing = [[() => true, { code: 1, stderr: 'projects are unavailable' }]];
  const { b, calls } = board(failing);
  await b.setState('7', { column: 'In review' });
  await b.setState('7', {});
  assert.equal(calls.length, 0);

  const ok = board();
  await ok.b.setState('7', { waiting: true, column: 'In review' });
  assert.equal(ok.calls.length, 1);
  assert.ok(!ok.calls[0].args.includes('In review'));
});

test('close closes the issue', async () => {
  const { b, calls } = board();
  await b.close('7');
  assert.deepEqual(calls[0].args, ['issue', 'close', '7', '--repo', REPO]);
});

test('ensureLabels creates the four labels with --force', async () => {
  const { b, calls } = board();
  await b.ensureLabels();
  assert.deepEqual(calls.map((c) => c.args), [
    ['label', 'create', 'factory-ready', '--repo', REPO, '--force'],
    ['label', 'create', 'factory-owned', '--repo', REPO, '--force'],
    ['label', 'create', 'factory-waiting', '--repo', REPO, '--force'],
    ['label', 'create', 'factory-declined', '--repo', REPO, '--force'],
  ]);
});

test('every call is gh with an explicit --repo', async () => {
  const { b, calls } = board([
    [seq('issue', 'list'), { stdout: '[]' }],
    [seq('issue', 'view'), { stdout: JSON.stringify(issue(7)) }],
    [seq('api', '--paginate'), { stdout: '[]' }],
  ]);
  await b.listEligible();
  await b.get('7');
  await b.claim('7');
  await b.release('7');
  await b.comment('7', 'x');
  await b.setState('7', { waiting: true });
  await b.close('7');
  await b.ensureLabels();
  await b.commentsSince('7', '2026-03-01T00:00:00.000Z');
  for (const call of calls) {
    assert.equal(call.command, 'gh');
    if (call.args[0] === 'api') assert.ok(call.args.some((a) => a.startsWith(`repos/${REPO}/`)));
    else assert.equal(call.args[call.args.indexOf('--repo') + 1], REPO);
  }
});

test('a failing gh call throws an Error that names the command', async () => {
  const { b } = board([[seq('issue', 'view'), { code: 1, stderr: 'GraphQL: Could not resolve to an Issue' }]]);
  await assert.rejects(() => b.get('999'), (err) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /gh issue view 999/);
    assert.match(err.message, /exit 1/);
    assert.match(err.message, /Could not resolve to an Issue/);
    return true;
  });
});

test('a failing edit surfaces from claim', async () => {
  const { b } = board([[seq('issue', 'edit'), { code: 1, stderr: 'label not found' }]]);
  await assert.rejects(() => b.claim('7'), /gh issue edit 7 failed/);
});

test('ids that are not issue numbers are refused before gh is called', async () => {
  const { b, calls } = board();
  await assert.rejects(() => b.close('--help'), /Invalid GitHub issue number/);
  await assert.rejects(() => b.get('7; rm'), /Invalid GitHub issue number/);
  assert.equal(calls.length, 0);
});

// ---- one start label per ticket: ready (raw) or groomed (start at design)

test('listEligible queries each start label and returns a ticket once', async () => {
  const calls = [];
  const issue = (number, labels) => ({
    number, title: `t${number}`, body: '', labels: labels.map((name) => ({ name })),
    assignees: [], author: { login: 'alice' }, url: `https://github.com/o/r/issues/${number}`, state: 'OPEN',
  });
  const exec = async (command, args) => {
    calls.push(args);
    const label = args[args.indexOf('--label') + 1];
    const page = label === 'factory-ready'
      ? [issue(1, ['factory-ready']), issue(3, ['factory-ready', 'factory-groomed'])]
      : [issue(2, ['factory-groomed']), issue(3, ['factory-ready', 'factory-groomed'])];
    return { code: 0, stdout: JSON.stringify(page), stderr: '', timedOut: false, aborted: false };
  };
  const { GitHubBoard } = require('../src/boards/github');
  const b = new GitHubBoard({
    repo: 'o/r', readyLabel: 'factory-ready', groomedLabel: 'factory-groomed', ownedLabel: 'factory-owned',
    waitingLabel: 'factory-waiting', declinedLabel: 'factory-declined', botUser: 'bot', exec,
  });
  const tickets = await b.listEligible();
  assert.deepEqual(tickets.map((t) => t.id).sort(), ['1', '2', '3']);
  assert.deepEqual(calls.map((a) => a[a.indexOf('--label') + 1]), ['factory-ready', 'factory-groomed']);
});

test('claim removes both start labels', async () => {
  const calls = [];
  const exec = async (command, args) => { calls.push(args); return { code: 0, stdout: '', stderr: '', timedOut: false, aborted: false }; };
  const { GitHubBoard } = require('../src/boards/github');
  const b = new GitHubBoard({
    repo: 'o/r', readyLabel: 'factory-ready', groomedLabel: 'factory-groomed', ownedLabel: 'factory-owned',
    waitingLabel: 'factory-waiting', declinedLabel: 'factory-declined', botUser: 'bot', exec,
  });
  await b.claim('7');
  const args = calls[0];
  const removed = args.map((a, i) => (a === '--remove-label' ? args[i + 1] : null)).filter(Boolean);
  assert.deepEqual(removed.sort(), ['factory-groomed', 'factory-ready']);
  assert.equal(args[args.indexOf('--add-label') + 1], 'factory-owned');
});
