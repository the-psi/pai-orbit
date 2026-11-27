'use strict';
// A ticket a person has already groomed: the factory must skip its own groom stage, use the
// person's requirements.md, and start at design. A ticket without the groomed label is unchanged.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRig, git } = require('./helpers');

/** Commit a requirements.md to the remote's main branch, as a person's /groom session would. */
function seedRequirements(rig, folder, text = '# Requirements written by a person\n') {
  const file = path.join(rig.seed, 'docs', 'features', folder, 'requirements.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  git(rig.seed, 'add', `docs/features/${folder}/requirements.md`);
  git(rig.seed, 'commit', '--quiet', '-m', `docs: groom ${folder} — requirements`);
  git(rig.seed, 'push', '--quiet', 'origin', 'main');
}

// A person adds exactly one start label. For a groomed ticket it is this one, on its own.
const GROOMED = ['factory-groomed'];

test('AC-41: a groomed ticket starts at design and uses the requirements named in the ticket', async (t) => {
  const rig = makeRig({ config: { gates: { requirements: true, design: false } } });
  t.after(rig.cleanup);
  seedRequirements(rig, 'payments-export', '# Person-written requirements\n\nREQ-1: export a CSV.\n');
  await rig.addTicket('7', {
    title: 'Export payments as CSV',
    body: 'Groomed already. Requirements: docs/features/payments-export/requirements.md',
    labels: GROOMED,
  });
  await rig.factory.runUntilIdle();

  const run = rig.run('7');
  const stages = rig.runner.calls.map((c) => c.stage);
  assert.ok(!stages.includes('groom'), `groom must not run for a groomed ticket: ${stages}`);
  assert.equal(stages[0], 'design');
  assert.equal(run.featureDir, 'docs/features/payments-export');
  // The requirements gate is for the factory's own grooming; a person's requirements skip it.
  assert.equal(run.pending.gate, 'merge', rig.logs.join('\n'));
  assert.ok(rig.events('7').includes('groomed_ticket'));
  // Claiming removed the start label, so the ticket cannot be picked up a second time.
  assert.ok(!rig.ticket('7').labels.includes('factory-groomed'));
  assert.ok(rig.ticket('7').labels.includes('factory-owned'));
  assert.match(rig.comments('7').map((c) => c.body).join('\n'), /already groomed ticket.*payments-export\/requirements\.md/);
  // The design prompt points the agent at the person's folder, and the design lands next to it.
  assert.match(rig.runner.calls[0].prompt, /Feature folder: `docs\/features\/payments-export\/`/);
  assert.equal(rig.remoteGit('show', `${run.branch}:docs/features/payments-export/requirements.md`),
    '# Person-written requirements\n\nREQ-1: export a CSV.');
  assert.ok(rig.remoteGit('show', `${run.branch}:docs/features/payments-export/design.md`));
});

test('AC-41: with no path in the ticket, the folder named after the ticket title is used', async (t) => {
  const rig = makeRig();
  t.after(rig.cleanup);
  seedRequirements(rig, 'add-dark-mode');
  await rig.addTicket('8', { title: 'Add dark mode', body: 'Groomed in the last session.', labels: GROOMED });
  await rig.factory.tick();
  await rig.factory.drain();
  assert.equal(rig.run('8').featureDir, 'docs/features/add-dark-mode');
  assert.equal(rig.runner.calls[0].stage, 'design');
});

test('AC-42: a ticket labelled groomed with no requirements file is declined before any agent call', async (t) => {
  const rig = makeRig();
  t.after(rig.cleanup);
  await rig.addTicket('9', {
    title: 'Something groomed elsewhere',
    body: 'See docs/features/not-there/requirements.md',
    labels: GROOMED,
  });
  await rig.factory.runUntilIdle();
  assert.equal(rig.run('9').status, 'declined');
  assert.equal(rig.runner.calls.length, 0);
  const ticket = rig.ticket('9');
  assert.ok(ticket.labels.includes('factory-declined'));
  assert.ok(!ticket.labels.includes('factory-ready'));
  assert.match(ticket.comments.at(-1).body, /could not find its requirements/);
});

test('AC-42: a path that tries to leave the features folder is not followed', async (t) => {
  const rig = makeRig();
  t.after(rig.cleanup);
  await rig.addTicket('10', {
    title: 'Sneaky path',
    body: 'Requirements: docs/features/../requirements.md and docs/features/../../x/requirements.md',
    labels: GROOMED,
  });
  await rig.factory.runUntilIdle();
  assert.equal(rig.run('10').status, 'declined');
  assert.equal(rig.runner.calls.length, 0);
});

test('AC-43: a ticket without the groomed label is still groomed by the factory', async (t) => {
  const rig = makeRig();
  t.after(rig.cleanup);
  seedRequirements(rig, 'ticket-11'); // even though a matching folder exists
  await rig.addTicket('11', { title: 'Ticket 11' });
  await rig.factory.tick();
  await rig.factory.drain();
  assert.equal(rig.runner.calls[0].stage, 'groom');
  assert.ok(!rig.events('11').includes('groomed_ticket'));
});

test('AC-41: intake checks still apply to a groomed ticket', async (t) => {
  const rig = makeRig();
  t.after(rig.cleanup);
  seedRequirements(rig, 'rotate-keys');
  await rig.addTicket('12', { title: 'Rotate keys', labels: GROOMED.concat('security') });
  await rig.factory.runUntilIdle();
  assert.equal(rig.run('12').status, 'declined');
  assert.equal(rig.runner.calls.length, 0);
});

test('AC-41: a ticket carrying both start labels is treated as groomed, and both are removed', async (t) => {
  const rig = makeRig();
  t.after(rig.cleanup);
  seedRequirements(rig, 'both-labels');
  await rig.addTicket('13', { title: 'Both labels', labels: ['factory-ready', 'factory-groomed'] });
  await rig.factory.tick();
  await rig.factory.drain();
  assert.equal(rig.runner.calls[0].stage, 'design');
  const labels = rig.ticket('13').labels;
  assert.ok(!labels.includes('factory-ready') && !labels.includes('factory-groomed'), `start labels left behind: ${labels}`);
});

test('AC-42: a declined groomed ticket is not picked up again until a person re-labels it', async (t) => {
  const rig = makeRig();
  t.after(rig.cleanup);
  await rig.addTicket('14', { title: 'No requirements yet', labels: GROOMED });
  await rig.factory.runUntilIdle();
  await rig.factory.runUntilIdle();
  assert.equal(rig.run('14').status, 'declined');
  assert.equal(rig.store.events('14').filter((e) => e.type === 'claimed').length, 1);
});
