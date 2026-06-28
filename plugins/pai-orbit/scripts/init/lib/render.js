'use strict';
// Minimal template rendering — `{{KEY}}` placeholder substitution and
// recursive directory copy with overwrite control.

const fs = require('node:fs');
const path = require('node:path');

function renderPlaceholders(text, vars) {
  return text.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) return vars[key];
    return match;
  });
}

function renderTemplateFile(srcPath, destPath, vars) {
  const raw = fs.readFileSync(srcPath, 'utf8');
  const rendered = renderPlaceholders(raw, vars);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, rendered, 'utf8');
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
  copyDir,
  copyFile,
  ensureLineInFile,
};
