'use strict';
// Unit tests for src/notifiers/index.js. No network: fetch is always injected.

const test = require('node:test');
const assert = require('node:assert/strict');
const { ConsoleNotifier, MemoryNotifier, SlackNotifier, labelFor } = require('../src/notifiers');

const WEBHOOK = 'https://hooks.example.invalid/services/T000/B000/XXXX';

function event(over = {}) {
  return {
    type: 'question', ticketId: '42', title: 'Add greeting',
    text: 'Two questions need an answer.', url: 'https://example.invalid/issues/42',
    mention: ['alice', 'po'], ...over,
  };
}

// ---- console ----

test('ConsoleNotifier writes one line with the ticket id, text, title, people and link', async () => {
  const lines = [];
  await new ConsoleNotifier({ write: (l) => lines.push(l) }).notify(event());
  assert.equal(lines.length, 1);
  assert.ok(!lines[0].includes('\n'), 'a single line');
  assert.ok(lines[0].includes('#42'));
  assert.ok(lines[0].includes('Two questions need an answer.'));
  assert.ok(lines[0].includes('Add greeting'));
  assert.ok(lines[0].includes('question'));
  assert.ok(lines[0].includes('alice, po'));
  assert.ok(lines[0].includes('https://example.invalid/issues/42'));
});

test('ConsoleNotifier copes with no one to mention', async () => {
  for (const mention of [[], undefined]) {
    const lines = [];
    await new ConsoleNotifier({ write: (l) => lines.push(l) }).notify(event({ mention }));
    assert.equal(lines.length, 1);
    assert.ok(lines[0].includes('#42'));
    assert.ok(!lines[0].includes('[for:'));
  }
});

test('ConsoleNotifier writes to stdout by default', async () => {
  const original = process.stdout.write;
  const written = [];
  process.stdout.write = (chunk) => { written.push(String(chunk)); return true; };
  try {
    await new ConsoleNotifier().notify(event({ ticketId: '77', text: 'default sink' }));
  } finally {
    process.stdout.write = original;
  }
  assert.equal(written.length, 1);
  assert.ok(written[0].includes('#77'));
  assert.ok(written[0].includes('default sink'));
  assert.ok(written[0].endsWith('\n'));
});

// ---- memory ----

test('MemoryNotifier collects events in order', async () => {
  const n = new MemoryNotifier();
  assert.deepEqual(n.events, []);
  const a = event({ type: 'question' });
  const b = event({ type: 'approval_needed', ticketId: '43' });
  await n.notify(a);
  await n.notify(b);
  assert.deepEqual(n.events, [a, b]);
  assert.equal(n.events[0], a, 'the event itself is kept');
});

// ---- slack ----

test('SlackNotifier posts JSON with a text field to the webhook', async () => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; };
  const errors = [];
  await new SlackNotifier({ webhookUrl: WEBHOOK, fetch, onError: (e) => errors.push(e) }).notify(event());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, WEBHOOK);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['content-type'], 'application/json');
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(Object.keys(body), ['text']);
  assert.equal(typeof body.text, 'string');
  assert.ok(body.text.includes('#42'));
  assert.ok(body.text.includes('Add greeting'));
  assert.ok(body.text.includes('Two questions need an answer.'));
  assert.ok(body.text.includes('alice, po'));
  assert.ok(body.text.includes('https://example.invalid/issues/42'));
  assert.ok(body.text.includes(labelFor('question')));
  assert.deepEqual(errors, []);
});

test('SlackNotifier message omits the "For:" line when nobody is mentioned', async () => {
  let body;
  const fetch = async (url, init) => { body = JSON.parse(init.body); return { ok: true, status: 200 }; };
  await new SlackNotifier({ webhookUrl: WEBHOOK, fetch }).notify(event({ mention: [] }));
  assert.ok(!body.text.includes('For:'));
});

test('SlackNotifier never throws when fetch rejects: it calls onError', async () => {
  const errors = [];
  const fetch = async () => { throw new Error('getaddrinfo ENOTFOUND hooks.example.invalid'); };
  const n = new SlackNotifier({ webhookUrl: WEBHOOK, fetch, onError: (e) => errors.push(e) });
  await assert.doesNotReject(n.notify(event()));
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /ENOTFOUND/);
});

test('SlackNotifier never throws when fetch throws synchronously', async () => {
  const errors = [];
  const fetch = () => { throw new TypeError('Invalid URL'); };
  const n = new SlackNotifier({ webhookUrl: 'not a url', fetch, onError: (e) => errors.push(e) });
  await assert.doesNotReject(n.notify(event()));
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Invalid URL/);
});

test('SlackNotifier never throws on a non-ok status: it calls onError with the status', async () => {
  for (const status of [400, 404, 429, 500]) {
    const errors = [];
    const fetch = async () => ({ ok: false, status });
    const n = new SlackNotifier({ webhookUrl: WEBHOOK, fetch, onError: (e) => errors.push(e) });
    await assert.doesNotReject(n.notify(event()));
    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof Error);
    assert.ok(errors[0].message.includes(String(status)));
  }
});

test('SlackNotifier without an onError swallows failures silently', async () => {
  const rejecting = new SlackNotifier({ webhookUrl: WEBHOOK, fetch: async () => { throw new Error('down'); } });
  await assert.doesNotReject(rejecting.notify(event()));
  const notOk = new SlackNotifier({ webhookUrl: WEBHOOK, fetch: async () => ({ ok: false, status: 503 }) });
  await assert.doesNotReject(notOk.notify(event()));
});

test('SlackNotifier never throws on a malformed event', async () => {
  const errors = [];
  const n = new SlackNotifier({ webhookUrl: WEBHOOK, fetch: async () => ({ ok: true, status: 200 }), onError: (e) => errors.push(e) });
  await assert.doesNotReject(n.notify(undefined));
  await assert.doesNotReject(n.notify(null));
  assert.equal(errors.length, 2);
});

test('SlackNotifier error reports do not leak the webhook URL', async () => {
  const errors = [];
  const n = new SlackNotifier({ webhookUrl: WEBHOOK, fetch: async () => ({ ok: false, status: 403 }), onError: (e) => errors.push(e) });
  await n.notify(event());
  assert.ok(!errors[0].message.includes(WEBHOOK));
});

test('labelFor gives a human label for known event types and the type itself otherwise', () => {
  for (const type of ['question', 'approval_needed', 'reminder', 'escalation', 'handed_back', 'declined', 'released', 'cost_warning', 'daily_limit', 'taken_over']) {
    assert.notEqual(labelFor(type), type, `${type} has a label`);
    assert.ok(labelFor(type).length > 0);
  }
  assert.equal(labelFor('something_new'), 'something_new');
});
