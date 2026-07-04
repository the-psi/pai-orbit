'use strict';
// Step 1 discovery — scan the project before the interview.
//
// Mirrors `core/modes/setup.md` Step 1: infer languages, frameworks,
// deployment shape, existing pai-orbit state, and task-management platform
// from repo files. The interactive interview uses these as defaults.

const fs = require('node:fs');
const path = require('node:path');

function fileExists(cwd, rel) {
  return fs.existsSync(path.join(cwd, rel));
}

function readJsonSafely(cwd, rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd, rel), 'utf8'));
  } catch {
    return null;
  }
}

function detectLanguages(cwd) {
  const langs = new Set();
  if (fileExists(cwd, 'package.json') || fileExists(cwd, 'tsconfig.json')) langs.add('typescript');
  if (fileExists(cwd, 'pyproject.toml') || fileExists(cwd, 'requirements.txt') || fileExists(cwd, 'setup.py')) langs.add('python');
  if (fileExists(cwd, 'go.mod')) langs.add('go');
  if (fileExists(cwd, 'Cargo.toml')) langs.add('rust');
  if (fileExists(cwd, 'pom.xml') || fileExists(cwd, 'build.gradle')) langs.add('java');
  if (fileExists(cwd, 'Gemfile')) langs.add('ruby');
  if (fileExists(cwd, 'composer.json')) langs.add('php');
  if (fileExists(cwd, 'Package.swift')) langs.add('swift');
  if (fileExists(cwd, '*.csproj') || fileExists(cwd, '*.sln') || fs.readdirSync(cwd, { withFileTypes: true }).some((e) => e.name.endsWith('.csproj'))) {
    langs.add('csharp');
  }
  return Array.from(langs);
}

function detectFrameworks(cwd) {
  const frameworks = new Set();
  const pkg = readJsonSafely(cwd, 'package.json');
  if (pkg) {
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (deps.next) frameworks.add('nextjs');
    if (deps.express) frameworks.add('express');
    if (deps.react && !deps.next) frameworks.add('react');
    if (deps['@nestjs/core']) frameworks.add('nestjs');
    if (deps.vue) frameworks.add('vue');
    if (deps.vite) frameworks.add('vite');
    if (deps.fastify) frameworks.add('fastify');
  }
  const py = readTextSafely(cwd, 'pyproject.toml') || readTextSafely(cwd, 'requirements.txt') || '';
  if (/\bfastapi\b/i.test(py)) frameworks.add('fastapi');
  if (/\bdjango\b/i.test(py)) frameworks.add('django');
  if (/\bflask\b/i.test(py)) frameworks.add('flask');
  return Array.from(frameworks);
}

function readTextSafely(cwd, rel) {
  try {
    return fs.readFileSync(path.join(cwd, rel), 'utf8');
  } catch {
    return null;
  }
}

function detectDeployment(cwd) {
  const hits = [];
  if (fileExists(cwd, 'fly.toml')) hits.push('fly.io');
  if (fileExists(cwd, 'vercel.json')) hits.push('vercel');
  if (fileExists(cwd, 'app.yaml') || fileExists(cwd, 'cloudbuild.yaml')) hits.push('gcp');
  if (fileExists(cwd, 'Procfile')) hits.push('heroku');
  if (fileExists(cwd, 'railway.toml')) hits.push('railway');
  if (fileExists(cwd, 'netlify.toml')) hits.push('netlify');
  if (fileExists(cwd, 'docker-compose.yml') || fileExists(cwd, 'docker-compose.yaml')) hits.push('docker-compose');
  if (fileExists(cwd, 'Dockerfile')) hits.push('docker');
  return hits;
}

function detectServices(cwd) {
  // Look for directories that commonly represent services in a monorepo.
  const candidates = ['api', 'apis', 'backend', 'frontend', 'web', 'app', 'apps', 'services', 'server', 'client', 'mobile', 'worker'];
  const found = [];
  for (const c of candidates) {
    if (fileExists(cwd, c) && fs.statSync(path.join(cwd, c)).isDirectory()) {
      found.push(c);
    }
  }
  return found;
}

function detectTaskPlatform(cwd) {
  // Heuristic inference — user still confirms in Step 2 Q3.
  if (fileExists(cwd, '.gitlab-ci.yml') || fileExists(cwd, '.gitlab')) return 'gitlab';
  if (fileExists(cwd, '.github')) return 'github'; // could be Issues or Projects — user picks
  if (fileExists(cwd, 'linear.json')) return 'linear';
  if (fileExists(cwd, 'jira-config') || fileExists(cwd, '.jira')) return 'jira';
  return null;
}

function detectExistingPaiOrbit(cwd) {
  return {
    claude_config: fileExists(cwd, '.claude/pai-orbit-config.md'),
    claude_team: fileExists(cwd, '.claude/team.md'),
    copilot_config: fileExists(cwd, '.copilot/pai-orbit-config.md'),
    copilot_team: fileExists(cwd, '.copilot/team.md'),
    cursor_config: fileExists(cwd, '.cursor/pai-orbit-config.md'),
    claude_md: fileExists(cwd, 'CLAUDE.md'),
    old_github_pai_orbit: fileExists(cwd, '.github/pai-orbit'),
  };
}

function detectMonorepo(cwd, services) {
  // Simple heuristic: more than 1 top-level service dir + a workspace file or lerna/turbo/pnpm config.
  const workspaceHints = [
    'lerna.json',
    'turbo.json',
    'pnpm-workspace.yaml',
    'nx.json',
    'rush.json',
  ];
  const pkg = readJsonSafely(cwd, 'package.json');
  const hasWorkspaces = pkg && (pkg.workspaces || pkg.private === true);
  const hasWorkspaceFile = workspaceHints.some((f) => fileExists(cwd, f));
  return services.length > 1 || hasWorkspaces || hasWorkspaceFile;
}

function discover(cwd) {
  const languages = detectLanguages(cwd);
  const frameworks = detectFrameworks(cwd);
  const deployment_hints = detectDeployment(cwd);
  const services = detectServices(cwd);
  const task_platform_hint = detectTaskPlatform(cwd);
  const existing = detectExistingPaiOrbit(cwd);
  const looks_like_monorepo = detectMonorepo(cwd, services);
  const has_git = fileExists(cwd, '.git');

  return {
    languages,
    frameworks,
    deployment_hints,
    services,
    task_platform_hint,
    existing,
    looks_like_monorepo,
    has_git,
  };
}

function summarise(disc) {
  const lines = [];
  lines.push('Discovery (Step 1):');
  lines.push(`  languages:          ${disc.languages.length ? disc.languages.join(', ') : '(none inferred)'}`);
  lines.push(`  frameworks:         ${disc.frameworks.length ? disc.frameworks.join(', ') : '(none inferred)'}`);
  lines.push(`  deployment hints:   ${disc.deployment_hints.length ? disc.deployment_hints.join(', ') : '(none inferred)'}`);
  lines.push(`  services detected:  ${disc.services.length ? disc.services.join(', ') : '(none)'}`);
  lines.push(`  task platform hint: ${disc.task_platform_hint || '(unknown — will ask)'}`);
  lines.push(`  monorepo?           ${disc.looks_like_monorepo ? 'yes (or workspace file present)' : 'no (single service)'}`);
  lines.push(`  git initialised?    ${disc.has_git ? 'yes' : 'no'}`);
  if (Object.values(disc.existing).some(Boolean)) {
    const flags = Object.entries(disc.existing)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(', ');
    lines.push(`  existing pai-orbit: ${flags}`);
  }
  return lines.join('\n');
}

module.exports = { discover, summarise };
