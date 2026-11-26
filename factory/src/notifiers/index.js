'use strict';
// Notifiers send a one-way alert that points people at the ticket. Answers and approvals are
// never read from chat: the ticket is the record. A notifier must never throw.

class ConsoleNotifier {
  constructor(opts = {}) {
    this.write = opts.write || ((line) => process.stdout.write(`${line}\n`));
  }

  async notify(event) {
    const who = event.mention && event.mention.length ? ` [for: ${event.mention.join(', ')}]` : '';
    this.write(`[factory] ${event.type} #${event.ticketId} ${event.title} — ${event.text}${who} ${event.url}`);
  }
}

/** Keeps events in memory (tests). */
class MemoryNotifier {
  constructor() {
    this.events = [];
  }

  async notify(event) {
    this.events.push(event);
  }
}

/** Slack incoming webhook. Outbound only. */
class SlackNotifier {
  /** @param {{webhookUrl: string, fetch?: Function, onError?: Function}} opts */
  constructor(opts) {
    this.webhookUrl = opts.webhookUrl;
    this.fetch = opts.fetch || globalThis.fetch;
    this.onError = opts.onError || (() => {});
  }

  async notify(event) {
    try {
      const who = event.mention && event.mention.length ? `\nFor: ${event.mention.join(', ')}` : '';
      const text = `*${labelFor(event.type)}* — #${event.ticketId} ${event.title}\n${event.text}${who}\n${event.url}`;
      const res = await this.fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) this.onError(new Error(`Slack webhook returned ${res.status}`));
    } catch (err) {
      this.onError(err);
    }
  }
}

const LABELS = {
  question: 'The factory needs an answer',
  approval_needed: 'Approval needed',
  reminder: 'Reminder: the factory is waiting',
  escalation: 'Escalation: the factory is still waiting',
  handed_back: 'Ticket handed back to people',
  declined: 'Ticket declined by the factory',
  released: 'Released',
  cost_warning: 'Cost warning',
  daily_limit: 'Daily spend limit reached',
  taken_over: 'Ticket taken over by a person',
};

function labelFor(type) {
  return LABELS[type] || type;
}

module.exports = { ConsoleNotifier, MemoryNotifier, SlackNotifier, labelFor };
