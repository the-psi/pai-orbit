'use strict';
// Who may answer and who may approve. One place, used by the pipeline (which acts on a decision)
// and by the status page (which only offers a decision to someone allowed to make it).

/** Which role approves at each gate. */
const GATE_ROLE = {
  requirements: 'requirementsApprover',
  design: 'designApprover',
  merge: 'mergeApprover',
  release: 'releaseApprover',
};

/**
 * @param {object} config
 * @param {string} role      a key of config.roles
 * @param {string} user      the person's name on the board, code host or status page
 * @param {string} reporter  who raised the ticket (for the `@reporter` entry)
 */
function inRole(config, role, user, reporter) {
  const list = config.roles[role] || [];
  if (!user) return false;
  // The factory's own account never counts (REQ-40), except in a single-account trial, where the
  // person and the factory share one account.
  const single = config.trial && config.trial.singleAccount === true;
  if (user === config.board.botUser && !single) return false;
  return list.includes(user) || list.includes('*') || (list.includes('@reporter') && user === reporter);
}

/** The people named for a role, as text for a person to read. */
function roleNames(config, role, reporter) {
  const list = (config.roles[role] || []).map((n) => {
    if (n === '@reporter') return reporter ? `the reporter (${reporter})` : 'the reporter';
    if (n === '*') return 'any reviewer the code host accepts';
    return n;
  });
  return list.length ? list.join(', ') : 'a named person';
}

module.exports = { GATE_ROLE, inRole, roleNames };
