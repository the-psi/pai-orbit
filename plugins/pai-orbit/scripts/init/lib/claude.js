'use strict';
// Claude Code target — stub per D9. The functional install path for Claude is the
// `/setup` mode inside Claude Code itself; this CLI exists to serve Copilot-only teams.
module.exports = {
  async run(_ctx) {
    process.stderr.write(
      [
        'pai-orbit: `init claude` is not yet implemented in this CLI (D9).',
        '',
        'Use Claude Code instead:',
        '  1. Install the pai-orbit plugin in Claude Code (see README.md).',
        '  2. Open the project and run /setup.',
        '',
        'The CLI path will be wired when there is concrete demand for non-Claude-Code Claude installs.',
        '',
      ].join('\n'),
    );
    process.exit(2);
  },
};
