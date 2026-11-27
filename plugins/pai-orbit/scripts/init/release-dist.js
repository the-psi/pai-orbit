'use strict';
// Resolve which dist directory an installer copies from.
//
// Tries the GitHub Release asset first (counted per agent by GitHub), and falls
// back to the dist/ bundled in the npx tarball when the download fails —
// offline, firewall, or no release for this version yet. The install never
// fails because of the download; it only goes uncounted.

const path = require('node:path');
const { execFileSync } = require('node:child_process');

const FETCHER = path.join(__dirname, 'fetch-release.js');

function resolveDist(agent, bundledDir) {
  try {
    const dir = execFileSync(process.execPath, [FETCHER, agent], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (dir) {
      process.stdout.write(`pai-orbit: using release files (pai-orbit-${agent}.tar.gz)\n`);
      return dir;
    }
  } catch (err) {
    const reason = String((err.stderr || err.message || '')).trim().split('\n')[0];
    process.stdout.write(`pai-orbit: using bundled files (release download unavailable: ${reason})\n`);
  }
  return bundledDir;
}

module.exports = { resolveDist };
