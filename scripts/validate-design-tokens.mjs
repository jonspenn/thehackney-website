#!/usr/bin/env node
/**
 * Validates that DESIGN.md and src/styles/global.css agree on design tokens.
 *
 * Why: DESIGN.md is the agent-readable mirror of the live CSS tokens. If they
 * drift (e.g. CSS gets a new colour that DESIGN.md doesn't know about), any
 * design agent reading DESIGN.md will generate UI that doesn't match the live
 * site. CI runs this on every push to main and fails the deploy if drift
 * exists.
 *
 * Checks:
 *   1. Every hex colour declared in :root of global.css appears at least once
 *      in DESIGN.md (so any new colour added to CSS forces a DESIGN.md update).
 *   2. No banned hex colour (listed in DESIGN.md's `colors.banned` block)
 *      appears anywhere in global.css.
 *
 * Run locally:    node scripts/validate-design-tokens.mjs
 * Exit codes:     0 = aligned, 1 = drift detected
 *
 * Updated 2026-04-26 - first version.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const cssPath = path.join(repoRoot, "src/styles/global.css");
const designPath = path.join(repoRoot, "DESIGN.md");

function read(p) {
  if (!fs.existsSync(p)) {
    console.error(`x Required file not found: ${p}`);
    process.exit(1);
  }
  return fs.readFileSync(p, "utf8");
}

const css = read(cssPath);
const design = read(designPath);

// --- 1. Extract every --token: value; from the first :root { ... } block ---
const rootMatch = css.match(/:root\s*\{([\s\S]*?)\n\}/);
if (!rootMatch) {
  console.error(`x Could not find a :root { ... } block in ${cssPath}`);
  process.exit(1);
}
const rootBody = rootMatch[1];

const tokenRe = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
const cssTokens = {};
let m;
while ((m = tokenRe.exec(rootBody)) !== null) {
  cssTokens[m[1]] = m[2].trim();
}

// --- 2. Resolve every var() reference (one level deep is enough here) ---
function resolve(value, depth = 0) {
  if (depth > 5) return value;
  const varRef = value.match(/^var\(--([a-z0-9-]+)\)$/i);
  if (varRef && cssTokens[varRef[1]]) {
    return resolve(cssTokens[varRef[1]], depth + 1);
  }
  return value;
}

const resolvedTokens = {};
for (const [name, value] of Object.entries(cssTokens)) {
  resolvedTokens[name] = resolve(value);
}

// --- 3. Pull every hex value out of the resolved CSS tokens ---
const hexRe = /#[0-9a-fA-F]{3,8}\b/g;
const cssHexes = new Set();
for (const value of Object.values(resolvedTokens)) {
  const matches = value.match(hexRe) || [];
  for (const hex of matches) cssHexes.add(hex.toLowerCase());
}

// --- 4. Pull every hex value mentioned anywhere in DESIGN.md ---
const designHexes = new Set();
{
  const matches = design.match(hexRe) || [];
  for (const hex of matches) designHexes.add(hex.toLowerCase());
}

// --- 5. Pull the banned palette from DESIGN.md by scanning lines ---
// Find the line that starts a `banned:` key inside the YAML front matter,
// then read leading "- ..." list items until the indent drops back.
const yamlMatch = design.match(/^---\n([\s\S]*?)\n---/);
if (!yamlMatch) {
  console.error("x Could not find YAML front matter in DESIGN.md");
  process.exit(1);
}
const yaml = yamlMatch[1];
const yamlLines = yaml.split("\n");

const bannedHexes = new Set();
let inBannedBlock = false;
let bannedIndent = -1;
for (const rawLine of yamlLines) {
  if (!inBannedBlock) {
    // Match exactly "<some indent>banned:" (not "banned-fonts:")
    const startMatch = rawLine.match(/^(\s+)banned:\s*$/);
    if (startMatch) {
      inBannedBlock = true;
      bannedIndent = startMatch[1].length;
      continue;
    }
    continue;
  }
  // Inside the block. End when we see a line at <= bannedIndent (a sibling
  // or parent key) that isn't blank or a comment.
  if (rawLine.trim() === "" || rawLine.trim().startsWith("#")) continue;
  const lineIndent = rawLine.match(/^(\s*)/)[1].length;
  if (lineIndent <= bannedIndent) {
    inBannedBlock = false;
    continue;
  }
  // Line is indented more than `banned:`; expect "- #hex"
  const itemMatch = rawLine.match(/^\s+-\s+"?(#[0-9a-fA-F]{3,8})"?/);
  if (itemMatch) bannedHexes.add(itemMatch[1].toLowerCase());
}

// --- 6. Assertions ---
const errors = [];

const missingFromDesign = [...cssHexes].filter((hex) => !designHexes.has(hex));
if (missingFromDesign.length) {
  errors.push(
    `Hex colour(s) declared in global.css :root but not present anywhere in DESIGN.md:\n    ${missingFromDesign.join(", ")}\n  Fix: add them to DESIGN.md (front matter under colors:) or remove from global.css.`
  );
}

const cssLower = css.toLowerCase();
const bannedInCss = [...bannedHexes].filter((hex) => cssLower.includes(hex));
if (bannedInCss.length) {
  errors.push(
    `Banned colour(s) found in global.css:\n    ${bannedInCss.join(", ")}\n  Fix: remove them from global.css (see DESIGN.md colors.banned for context).`
  );
}

// --- 7. Output ---
if (errors.length) {
  console.error("x Design token drift detected:");
  for (const err of errors) console.error("  - " + err);
  console.error(
    "\nIf you intentionally changed tokens, update both global.css and DESIGN.md in the same commit."
  );
  process.exit(1);
}

console.log(
  `OK Design tokens aligned (${Object.keys(cssTokens).length} CSS tokens, ${cssHexes.size} unique hex colours, ${bannedHexes.size} banned colours checked)`
);
process.exit(0);
