'use strict';
// The four swappable parts of the factory, as JSDoc types. Every method is async.
// Implementations live in boards/, codehosts/, runners/ and notifiers/.

/**
 * @typedef {object} Ticket
 * @property {string} id
 * @property {string} title
 * @property {string} body
 * @property {string[]} labels
 * @property {string[]} assignees   user names
 * @property {string} reporter      user name of the person who raised it
 * @property {'open'|'closed'} state
 * @property {string} url
 */

/**
 * @typedef {object} Comment
 * @property {string} id
 * @property {string} author     user name
 * @property {string} body
 * @property {string} createdAt  ISO 8601
 */

/**
 * @typedef {object} Board
 * @property {() => Promise<Ticket[]>} listEligible
 *   Open tickets that carry one of the two start labels (ready or groomed), do not carry the
 *   owned label, and are assigned to nobody other than the factory's own user.
 * @property {(id: string) => Promise<Ticket>} get
 * @property {(id: string) => Promise<void>} claim
 *   Add the owned label, remove both start labels, assign the factory's own user.
 * @property {(id: string, opts?: {declined?: boolean}) => Promise<void>} release
 *   Remove the owned and waiting labels and the factory's own assignment. With `declined`, add the
 *   declined label. The ready label is not restored.
 * @property {(id: string, body: string) => Promise<Comment>} comment
 * @property {(id: string, sinceIso: string) => Promise<Comment[]>} commentsSince
 *   Comments created strictly after `sinceIso`, oldest first.
 * @property {(id: string, state: {waiting?: boolean, column?: string}) => Promise<void>} setState
 *   Add or remove the waiting label; move to a column when the board supports it (best-effort,
 *   must not throw when the column cannot be set).
 * @property {(id: string) => Promise<void>} close
 */

/**
 * @typedef {object} Review
 * @property {string} author
 * @property {'approved'|'changes_requested'|'commented'} state
 * @property {string} sha          commit the review was submitted against
 * @property {string} body
 * @property {string} submittedAt  ISO 8601
 */

/**
 * @typedef {object} PrStatus
 * @property {'open'|'merged'|'closed'} state
 * @property {string} headSha
 * @property {boolean|null} mergeable   null when the host has not computed it yet
 * @property {Review[]} reviews         oldest first
 */

/**
 * @typedef {object} CodeHost
 * @property {() => string[]} gitAuthArgs
 *   Extra `git` arguments (for example `-c credential.helper=...`) the ORCHESTRATOR passes on
 *   clone, fetch and push. Never written into the clone's config, so the agent cannot reuse them.
 * @property {(dir: string, branch: string, opts?: {shared?: boolean}) => Promise<void>} push
 *   Push a branch. A ticket branch may be force-pushed (with lease). With `shared: true` (the
 *   base branch) the push must be plain, so the host refuses if the branch has moved.
 * @property {(pr: {branch: string, base: string, title: string, body: string}) => Promise<{id: string, url: string}>} openPr
 * @property {(id: string) => Promise<PrStatus>} prStatus
 * @property {(id: string) => Promise<void>} merge
 * @property {(base: string) => Promise<boolean|null>} baseProtected
 *   Whether the base branch requires review before merge; null when the host cannot say.
 */

/**
 * @typedef {object} StageResult  what an agent stage must return (contract/stage-result.schema.json)
 * @property {'done'|'needs_input'|'declined'|'failed'} status
 * @property {string} summary
 * @property {{question: string, why: string, options?: string[]}[]} [questions]
 * @property {{decision: string, basis: string}[]} [assumptions]
 * @property {string[]} [artifacts]
 * @property {string} [reason]
 * @property {{files?: number, changedLines?: number, services?: number, paths?: string[]}} [size]
 */

/**
 * @typedef {object} RunRequest
 * @property {string} stage
 * @property {string} cwd            the ticket's workspace
 * @property {string} prompt
 * @property {string} [sessionId]    resume this session when set
 * @property {number} budgetUsd
 * @property {number} timeoutMs
 * @property {object} env            the complete environment for the agent process
 * @property {string} transcriptPath where to save the raw runner output
 * @property {AbortSignal} [signal]
 */

/**
 * @typedef {object} RunOutcome
 * @property {StageResult|null} result   null when the run produced no valid result
 * @property {string} sessionId
 * @property {number} costUsd
 * @property {number} durationMs
 * @property {''|'budget'|'timeout'|'aborted'|'crash'|'invalid'} problem
 * @property {string} [detail]
 */

/**
 * @typedef {object} Runner
 * @property {(req: RunRequest) => Promise<RunOutcome>} run
 */

/**
 * @typedef {object} FactoryEvent
 * @property {string} type      question | approval_needed | reminder | escalation | handed_back |
 *                              declined | released | cost_warning | daily_limit | taken_over
 * @property {string} ticketId
 * @property {string} title
 * @property {string} url
 * @property {string} text
 * @property {string[]} [mention]
 */

/**
 * @typedef {object} Notifier
 * @property {(event: FactoryEvent) => Promise<void>} notify   must never throw
 */

module.exports = {};
