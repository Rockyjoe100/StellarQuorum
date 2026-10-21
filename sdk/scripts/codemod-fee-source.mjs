#!/usr/bin/env node
// Issue #276: mechanical update for the 0.2.0 change that made the fee-paying
// account the first argument of buildFinalize() and buildExecute().
//
// Single-argument calls such as `client.buildFinalize(7n)` become
// `client.buildFinalize(FEE_SOURCE, 7n)`. FEE_SOURCE is a placeholder: define it,
// or replace it at each call site, with the account that pays the fee.
//
// Usage (see sdk/MIGRATIONS.md):
//   node sdk/scripts/codemod-fee-source.mjs <file-or-dir>...          dry run
//   node sdk/scripts/codemod-fee-source.mjs --write <file-or-dir>...  apply
//
// Calls that already pass two arguments are left alone. Argument detection is
// textual, so review the diff before committing.

import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const METHODS = ['buildFinalize', 'buildExecute'];
const PLACEHOLDER = 'FEE_SOURCE';
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', '.git']);

/** Calls `visit(char, index)` for every character outside string literals. */
function scanCode(source, from, visit) {
  let quote = null;
  for (let i = from; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (visit(ch, i) === false) return;
  }
}

/** Index of the `)` closing the argument list that starts at `start`, or -1. */
function closingParen(source, start) {
  let depth = 0;
  let close = -1;
  scanCode(source, start, (ch, i) => {
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      if (depth === 0) {
        close = i;
        return false;
      }
      depth -= 1;
    }
    return true;
  });
  return close;
}

/** Number of top-level arguments in the text between a call's parentheses. */
function argumentCount(text) {
  if (text.trim() === '') return 0;
  let depth = 0;
  let commas = 0;
  scanCode(text, 0, ch => {
    if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth -= 1;
    else if (ch === ',' && depth === 0) commas += 1;
    return true;
  });
  // A trailing comma (`f(a,)`) does not start another argument.
  const trailingComma = text.trimEnd().endsWith(',');
  return commas + 1 - (trailingComma ? 1 : 0);
}

/** Positions (in `source`) where the placeholder must be inserted. */
export function findCallSites(source) {
  const pattern = new RegExp(`\\.(${METHODS.join('|')})\\(`, 'g');
  const sites = [];
  for (const match of source.matchAll(pattern)) {
    const argsStart = match.index + match[0].length;
    const argsEnd = closingParen(source, argsStart);
    if (argsEnd !== -1 && argumentCount(source.slice(argsStart, argsEnd)) === 1) {
      sites.push(argsStart);
    }
  }
  return sites;
}

/** The source with the placeholder inserted at each single-argument call site. */
export function rewrite(source) {
  let result = source;
  for (const position of findCallSites(source).reverse()) {
    result = `${result.slice(0, position)}${PLACEHOLDER}, ${result.slice(position)}`;
  }
  return result;
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

async function collectFiles(target) {
  const info = await stat(target);
  if (info.isFile()) return SOURCE_EXTENSIONS.has(path.extname(target)) ? [target] : [];
  const files = [];
  for (const entry of await readdir(target, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) continue;
    files.push(...(await collectFiles(path.join(target, entry.name))));
  }
  return files;
}

async function main(argv) {
  const write = argv.includes('--write');
  const targets = argv.filter(arg => arg !== '--write');
  if (targets.length === 0) {
    console.error('usage: codemod-fee-source.mjs [--write] <file-or-dir>...');
    process.exitCode = 1;
    return;
  }

  let changedFiles = 0;
  let changedCalls = 0;
  for (const target of targets) {
    for (const file of await collectFiles(target)) {
      const source = await readFile(file, 'utf8');
      const sites = findCallSites(source);
      if (sites.length === 0) continue;
      for (const site of sites) {
        console.log(`${file}:${lineOf(source, site)}`);
      }
      changedFiles += 1;
      changedCalls += sites.length;
      if (write) await writeFile(file, rewrite(source));
    }
  }

  const verb = write ? 'updated' : 'would update (dry run; pass --write to apply)';
  console.log(`${verb}: ${changedCalls} call site(s) in ${changedFiles} file(s)`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
