#!/usr/bin/env node
// Validates the OnTap Plugin registry (official curated).
//   - index.json <-> plugins/<id>/ must be 1:1 (no orphans / missing)
//   - index entry governance: license required, versionCode required integer,
//     revoked/deprecated booleans, securityNotice string
//   - recomputes each .otplugin sha256 and compares against index.json
//   - each .otplugin must contain a root manifest.json with matching id,
//     >=1 command, and a valid capability combo
//   - static dangerous-pattern scan on script members (.py/.js/.ts/.sh/...)
// Usage: node scripts/validate.mjs [registryRoot]
// Exit code: 0 = ok, 1 = validation errors, 2 = fatal (missing/unreadable index.json)
//
// NOTE: this repo is the *plugin* registry; it is intentionally the reverse of the
// Pack registry CI (which rejects script content). Here scripts are expected, so the
// content check is a dangerous-pattern scan + manifest validation instead of a ban.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';

const ROOT = resolve(process.argv[2] ?? process.cwd());
const INDEX = join(ROOT, 'index.json');
const PLUGINS = join(ROOT, 'plugins');
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SCRIPT_EXT = /\.(py|js|ts|mjs|cjs|sh|ps1|rb|go)$/i;
const GRANTABLE = new Set(['config', 'file.read', 'file.write', 'ai']);

// Same dangerous patterns the client surfaces as scan warnings.
const DANGEROUS = [
  'Clipboard::new',
  'send_copy',
  'send_paste',
  'SetWindowPos',
  'HWND',
  'SendInput',
  'keybd_event',
  'enigo',
];

const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const note = (m) => warnings.push(m);
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

if (!existsSync(INDEX)) {
  console.error(`FATAL: index.json not found at ${INDEX}`);
  process.exit(2);
}
let index;
try {
  index = JSON.parse(readFileSync(INDEX, 'utf8'));
} catch (e) {
  console.error(`FATAL: index.json is not valid JSON: ${e.message}`);
  process.exit(2);
}
if (index.schema !== 1) fail(`index.schema must be 1 (got ${JSON.stringify(index.schema)})`);
if (!Array.isArray(index.plugins)) fail('index.plugins must be an array');

const entries = new Map();
for (const p of index.plugins ?? []) {
  if (!p || typeof p !== 'object' || !p.id) {
    fail('index entry missing id');
    continue;
  }
  if (entries.has(p.id)) fail(`duplicate index id: ${p.id}`);
  entries.set(p.id, p);
  // Governance: license is mandatory (legal requirement).
  if (typeof p.license !== 'string' || !p.license.trim()) {
    fail(`[${p.id}] index entry missing license (required)`);
  }
  if (!Number.isInteger(p.versionCode) || p.versionCode < 0) {
    fail(`[${p.id}] index.versionCode must be an integer (got ${JSON.stringify(p.versionCode)})`);
  }
  if (p.deprecated !== undefined && typeof p.deprecated !== 'boolean') {
    fail(`[${p.id}] index.deprecated must be a boolean`);
  }
  if (p.revoked !== undefined && typeof p.revoked !== 'boolean') {
    fail(`[${p.id}] index.revoked must be a boolean`);
  }
  if (p.securityNotice !== undefined && typeof p.securityNotice !== 'string') {
    fail(`[${p.id}] index.securityNotice must be a string`);
  }
}

const dirIds = new Set(
  existsSync(PLUGINS)
    ? readdirSync(PLUGINS).filter((n) => !n.startsWith('.') && statSync(join(PLUGINS, n)).isDirectory())
    : [],
);

for (const id of dirIds) {
  if (!ID_RE.test(id)) fail(`[${id}] directory name violates id regex ^[a-z0-9]+(-[a-z0-9]+)*$`);
  const dir = join(PLUGINS, id);
  const otpluginPath = join(dir, `${id}.otplugin`);
  if (!existsSync(otpluginPath)) {
    fail(`[${id}] missing ${id}.otplugin (filename must equal <id>)`);
    continue;
  }

  let buf;
  try {
    buf = readFileSync(otpluginPath);
  } catch (e) {
    fail(`[${id}] cannot read .otplugin: ${e.message}`);
    continue;
  }
  const hash = sha256(buf);
  const entry = entries.get(id);
  if (!entry) {
    fail(`[${id}] exists in repo but is missing from index.json`);
  } else if (entry.sha256 !== hash) {
    fail(`[${id}] sha256 mismatch: index=${entry.sha256} actual=${hash}`);
  }
  let files;
  try {
    files = unzipSync(new Uint8Array(buf));
  } catch (e) {
    fail(`[${id}] .otplugin is not a readable zip: ${e.message}`);
    continue;
  }
  const names = Object.keys(files);
  // zip-slip / absolute paths / __pycache__
  for (const n of names) {
    if (n.startsWith('/') || n.includes('..') || /^[a-zA-Z]:/.test(n)) {
      fail(`[${id}] unsafe zip entry: ${n}`);
    }
    if (n.split('/').includes('__pycache__')) fail(`[${id}] zip contains __pycache__: ${n}`);
  }
  if (!names.includes('manifest.json')) {
    fail(`[${id}] .otplugin missing root manifest.json`);
    continue;
  }

  let manifest;
  try {
    manifest = JSON.parse(strFromU8(files['manifest.json']));
  } catch (e) {
    fail(`[${id}] manifest.json invalid JSON: ${e.message}`);
    continue;
  }
  if (manifest.id !== id) fail(`[${id}] manifest.id ('${manifest.id}') != directory name`);
  if (!Array.isArray(manifest.commands) || manifest.commands.length < 1) {
    fail(`[${id}] manifest.commands must have at least one command`);
  }
  for (const cap of manifest.capabilities ?? []) {
    if (!GRANTABLE.has(cap)) fail(`[${id}] unsupported capability: ${cap}`);
  }
  const caps = manifest.capabilities ?? [];
  if (caps.includes('ai') && caps.includes('file.read')) {
    fail(`[${id}] illegal capability combo: ai + file.read`);
  }
  if (entry && entry.version && manifest.version && entry.version !== manifest.version) {
    fail(`[${id}] index.version ('${entry.version}') != manifest.version ('${manifest.version}')`);
  }

  // Dangerous-pattern scan on script members (warning, not a hard failure — mirrors
  // the client-side static scan which surfaces warnings to the user).
  for (const n of names) {
    if (!SCRIPT_EXT.test(n)) continue;
    const text = strFromU8(files[n]);
    const hits = DANGEROUS.filter((p) => text.includes(p));
    if (hits.length) note(`[${id}] ${n} matches dangerous pattern(s): ${hits.join(', ')}`);
  }
}

for (const id of entries.keys()) {
  if (!dirIds.has(id)) fail(`[${id}] listed in index.json but no plugins/${id}/ directory exists`);
}

if (warnings.length) {
  console.warn('WARNINGS:');
  for (const w of warnings) console.warn(`  - ${w}`);
}
if (errors.length) {
  console.error(`\nVALIDATION FAILED (${errors.length} error(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`OK: ${entries.size} plugin(s) validated, ${warnings.length} warning(s).`);
