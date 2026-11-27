'use strict';
// How the factory reads a person's decision from a comment, and how it marks its own comments.
// Kept apart from the pipeline so a code host adapter can use the same rules (GitLab: sending a
// merge request back is a comment on it).

// Every comment the factory posts ends with this marker. It is how the factory tells its own
// comments from a person's when both come from one account (single-account trial).
const FACTORY_MARK = '<!-- orbit-factory -->';

/**
 * Read a person's approval or rejection from a comment.
 * People reply the way the tool in front of them makes easy: with "Quote reply", which puts the
 * quoted text first, and with or without the slash. So quoted lines are skipped, and the first
 * line a person actually typed decides: `/approve`, `approve`, `approved`, or `/reject <why>`,
 * `reject <why>`. Anything else is not a decision.
 * @returns {{approve: true}|{reject: true, text: string}|null}
 */
function decisionOf(body) {
  const lines = String(body || '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('>'));
  if (!lines.length) return null;
  const first = lines[0];
  if (/^\/approve\b/i.test(first) || /^approved?[.!]?$/i.test(first)) return { approve: true };
  const m = first.match(/^\/reject(?:ed)?\b[\s:,-]*(.*)$/i) || first.match(/^reject(?:ed)?\b[\s:,-]*(.*)$/i);
  if (m) return { reject: true, text: [m[1], ...lines.slice(1)].join('\n').trim() };
  return null;
}

function isFactoryComment(comment) {
  return /<!--\s*orbit-factory/.test(String(comment.body || ''));
}

module.exports = { FACTORY_MARK, decisionOf, isFactoryComment };
