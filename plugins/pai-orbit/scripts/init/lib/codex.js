'use strict';
// Codex CLI target — delegates to the adapter's own installer.
//
// The Codex adapter (upstream #51) shipped `plugins/pai-orbit/adapters/codex/install.js`
// as the package `bin` and documented `npx github:the-psi/pai-orbit init codex`.
// This CLI now owns that `bin` entry, so the codex target forwards the same
// subcommand to the adapter installer in a child process — the documented
// command keeps working and the codex install logic stays in one place.
//
// Forwarded as an argv array via execFileSync (no shell), and the child inherits
// cwd, so it installs into the user's project exactly as before.

const path = require('node:path');
const { execFileSync } = require('node:child_process');

const INSTALLER = path.join('plugins', 'pai-orbit', 'adapters', 'codex', 'install.js');

module.exports = {
  async run(ctx) {
    if (ctx.subcommand === 'migrate') {
      process.stderr.write(
        'pai-orbit: `migrate codex` is not supported — the Codex adapter has no legacy layout to migrate from.\n' +
          'Use `init codex` for a first install or `update codex` to overwrite existing files.\n',
      );
      process.exit(2);
    }

    const installer = path.join(ctx.repoRoot, INSTALLER);
    try {
      execFileSync(process.execPath, [installer, ctx.subcommand, 'codex'], {
        cwd: ctx.cwd,
        stdio: 'inherit',
      });
    } catch (err) {
      // The installer already printed its own diagnostics; mirror its exit code.
      process.exit(typeof err.status === 'number' ? err.status : 1);
    }
  },
};
