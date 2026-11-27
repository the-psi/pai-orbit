'use strict';
// Found by the first run against GitHub: the person used "Quote reply" and typed `approve`. The
// factory wanted a comment starting with `/approve` and ignored it. A person's reply is read the
// way people actually write it.

const test = require('node:test');
const assert = require('node:assert/strict');
const { decisionOf } = require('../src/factory');

test('approve, with or without the slash', () => {
  for (const body of ['/approve', 'approve', 'Approve', 'APPROVED', 'approved.', '/approve looks good', '  /approve  ', 'approve!']) {
    assert.deepEqual(decisionOf(body), { approve: true }, body);
  }
});

test('a quote reply: the quoted text is skipped and the typed line decides', () => {
  const quoted = [
    '> ### Approval needed: design',
    '> ',
    '> Reply `/approve` on this ticket to continue, or `/reject <what to change>`.',
    '',
    'approve',
  ].join('\n');
  assert.deepEqual(decisionOf(quoted), { approve: true });
  assert.deepEqual(decisionOf('> something\r\n\r\napprove\r\n'), { approve: true });
});

test('quoting the instructions alone is not a decision', () => {
  assert.equal(decisionOf('> Reply `/approve` on this ticket to continue, or `/reject <what to change>`.'), null);
  assert.equal(decisionOf('> /approve'), null);
});

test('reject carries the feedback, including later lines', () => {
  assert.deepEqual(decisionOf('/reject rename the helper'), { reject: true, text: 'rename the helper' });
  assert.deepEqual(decisionOf('reject: use 19%, not 20%'), { reject: true, text: 'use 19%, not 20%' });
  assert.deepEqual(decisionOf('> quoted\n\nrejected - the tests are missing\nadd one for DE'), { reject: true, text: 'the tests are missing\nadd one for DE' });
  assert.deepEqual(decisionOf('/reject'), { reject: true, text: '' });
});

test('ordinary sentences are not decisions', () => {
  for (const body of ['', 'I will approve this tomorrow', 'approve this later please', 'looks good', 'Use 19%.',
    'not sure, can you explain?', 'approval pending', 'rejection is not on the table', 'approved by the board last week']) {
    assert.equal(decisionOf(body), null, body);
  }
});
