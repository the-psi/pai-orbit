'use strict';
// Template rendering primitives — `{{KEY}}` substitution, block removal,
// directory copy, and `.gitignore` append.

const fs = require('node:fs');
const path = require('node:path');

function renderPlaceholders(text, vars) {
  return text.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) return vars[key];
    return match;
  });
}

// Remove a named block bracketed by `<!-- NAME -->` and `<!-- END NAME -->`
// comment markers. Used to strip inapplicable board-type sections from the
// pai-orbit-config template (e.g., delete the LINEAR block when board type
// is `gitlab`).
//
// The template also has "<!-- BLOCK NAME — keep this block if ..., delete
// otherwise -->" lines. We remove the entire span between the opening tag
// and `<!-- END NAME -->` (inclusive on both ends).
function removeBlock(text, blockName) {
  const escaped = blockName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match the opening marker line + everything up through the end marker.
  const pattern = new RegExp(
    `<!--\\s*${escaped}\\b[\\s\\S]*?<!--\\s*END ${escaped}\\s*-->\\s*(\\r?\\n)?`,
    'g',
  );
  return text.replace(pattern, '');
}

// Keep exactly one block from a set — removes all others.
function keepOnlyBlock(text, blockName, allBlocks) {
  let out = text;
  for (const other of allBlocks) {
    if (other !== blockName) {
      out = removeBlock(out, other);
    }
  }
  return out;
}

// Render a markdown table body. `rows` is an array of arrays; every element is
// a cell string. The template placeholder gets replaced with `| a | b | c |`
// lines separated by `\n`.
function renderTableRows(rows) {
  return rows.map((cols) => `| ${cols.join(' | ')} |`).join('\n');
}

function renderTemplateFile(srcPath, destPath, vars, options = {}) {
  const { removeBlocks = [], keepOneOf = null, keepBlock = null } = options;
  let raw = fs.readFileSync(srcPath, 'utf8');
  if (keepOneOf && keepBlock) {
    raw = keepOnlyBlock(raw, keepBlock, keepOneOf);
  }
  for (const b of removeBlocks) {
    raw = removeBlock(raw, b);
  }
  const rendered = renderPlaceholders(raw, vars);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, rendered, 'utf8');
}

function writeIfMissing(destPath, contents) {
  if (fs.existsSync(destPath)) return false;
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, contents, 'utf8');
  return true;
}

function writeAlways(destPath, contents) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, contents, 'utf8');
}

function copyDir(srcDir, destDir, options = {}) {
  const { overwrite = true, filter = null } = options;
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (filter && !filter(entry)) continue;
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, options);
    } else if (entry.isFile()) {
      if (!overwrite && fs.existsSync(destPath)) continue;
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyFile(srcPath, destPath, options = {}) {
  const { overwrite = true } = options;
  if (!overwrite && fs.existsSync(destPath)) return false;
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
  return true;
}

function ensureLineInFile(filePath, line) {
  let existing = '';
  if (fs.existsSync(filePath)) {
    existing = fs.readFileSync(filePath, 'utf8');
    const lines = existing.split(/\r?\n/);
    if (lines.some((l) => l.trim() === line.trim())) return false;
  }
  const sep = existing && !existing.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(filePath, `${sep}${line}\n`);
  return true;
}

module.exports = {
  renderPlaceholders,
  renderTemplateFile,
  removeBlock,
  keepOnlyBlock,
  renderTableRows,
  writeIfMissing,
  writeAlways,
  copyDir,
  copyFile,
  ensureLineInFile,
};
