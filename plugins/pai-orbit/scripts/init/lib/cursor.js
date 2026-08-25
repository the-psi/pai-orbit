'use strict';
// Cursor target — stub per D9. The functional install path for Cursor is the
// `/setup` mode inside Cursor itself; this CLI exists to serve Copilot-only teams.
module.exports = {
  async run(_ctx) {
    process.stderr.write(
      [
        'pai-orbit: `init cursor` is not yet implemented in this CLI (D9).',
        '',
        'Use Cursor instead:',
        '  1. Install the pai-orbit plugin in Cursor (see docs/cursor-plugin-install-and-usage.md).',
        '  2. Open the project and run /setup.',
        '',
        'The CLI path will be wired when there is concrete demand for non-Cursor Cursor installs.',
        '',
      ].join('\n'),
    );
    process.exit(2);
  },
};
