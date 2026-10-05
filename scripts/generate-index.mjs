#!/usr/bin/env node
// Rebuilds index.json deterministically from plugins/<id>/<id>.otplugin + optional
// sidecar plugins/<id>/plugin.json. Use this instead of editing index.json by hand.
//
// Governance fields (license/author/categories/tags/homepage/minAppVersion/authorVerified/
// deprecated/revoked/securityNotice/requiresAi) are read from the sidecar `plugin.json`
// first, falling back to the existing index.json entry, then sensible defaults.
// `license` is REQUIRED — generation fails if neither source provides it.
// Usage: node scripts/generate-index.mjs [registryRoot]
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';

const ROOT = resolve(process.argv[2] ?? process.cwd());
const PLUGINS = join(ROOT, 'plugins');
const REPO = 'https://gitee.com/ontap-app/plugins';
const BRANCH = 'master';

const sha256File = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

/** semver → versionCode (major*1e6 + minor*1e3 + patch). */
function versionCodeOf(version) {
  const [a = '0', b = '0', c = '0'] = String(version).split('-')[0].split('.');
  const n = (x) => {
    const v = Number.parseInt(x, 10);
    return Number.isNaN(v) ? 0 : v;
  };
  return n(a) * 1_000_000 + n(b) * 1_000 + n(c);
}

const existing = new Map();
const indexPath = join(ROOT, 'index.json');
if (existsSync(indexPath)) {
  try {
    for (const e of JSON.parse(readFileSync(indexPath, 'utf8')).plugins ?? []) {
      if (e && e.id) existing.set(e.id, e);
    }
  } catch {
    // ignore unreadable existing index; generate fresh
  }
}

const dirs = existsSync(PLUGINS)
  ? readdirSync(PLUGINS)
      .filter((n) => !n.startsWith('.') && statSync(join(PLUGINS, n)).isDirectory())
      .sort()
  : [];

const plugins = [];
for (const id of dirs) {
  const dir = join(PLUGINS, id);
  const otpluginPath = join(dir, `${id}.otplugin`);
  if (!existsSync(otpluginPath)) {
    console.error(`skip ${id}: no ${id}.otplugin`);
    continue;
  }
  let manifest;
  try {
    const files = unzipSync(new Uint8Array(readFileSync(otpluginPath)));
    manifest = JSON.parse(strFromU8(files['manifest.json']));
  } catch (e) {
    console.error(`skip ${id}: cannot read manifest.json (${e.message})`);
    continue;
  }

  const prior = existing.get(id);
  const sidecarPath = join(dir, 'plugin.json');
  const sidecar = existsSync(sidecarPath)
    ? JSON.parse(readFileSync(sidecarPath, 'utf8'))
    : {};
  const pick = (key) => sidecar[key] ?? prior?.[key];
  const license = pick('license');
  if (typeof license !== 'string' || !license.trim()) {
    console.error(`skip ${id}: missing license (set plugins/${id}/plugin.json or keep it in index.json)`);
    continue;
  }

  const entry = {
    id,
    name: manifest.name ?? pick('name') ?? id,
    author: pick('author') ?? '',
    license,
    versionCode: versionCodeOf(manifest.version ?? '0.0.0'),
    version: manifest.version ?? '0.0.0',
    description: manifest.description ?? pick('description') ?? '',
    tags: sidecar.tags ?? prior?.tags ?? [],
    categories: sidecar.categories ?? prior?.categories ?? [],
    download: `plugins/${id}/${id}.otplugin`,
    sha256: sha256File(otpluginPath),
    homepage: pick('homepage') ?? `${REPO}/tree/${BRANCH}/plugins/${id}`,
    runtime: manifest.execution?.runtime ?? '',
    entry: manifest.execution?.entry ?? '',
    capabilities: manifest.capabilities ?? [],
    requiresAi: manifest.requires_ai ?? sidecar.requiresAi ?? false,
    deprecated: pick('deprecated') ?? false,
    revoked: pick('revoked') ?? false,
    authorVerified: pick('authorVerified') ?? false,
  };
  if (pick('minAppVersion')) entry.minAppVersion = pick('minAppVersion');
  if (pick('securityNotice')) entry.securityNotice = pick('securityNotice');
  plugins.push(entry);
}

const index = {
  schema: 1,
  updatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  plugins,
};

writeFileSync(join(ROOT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
console.log(`index.json written: ${plugins.length} plugin(s).`);
