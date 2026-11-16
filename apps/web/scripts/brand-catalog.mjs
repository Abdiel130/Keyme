#!/usr/bin/env node
// Builds the full simple-icons catalog (CC0) into public/brands/, served by
// our own server and not precached by the service worker:
//
//   public/brands/index.json      [{ s: slug, t: title, h: hex, d?: domain, a?: aliases }]
//   public/brands/icons/<slug>.svg
//
// The app downloads the index once and fetches only the logos that match
// entries in the vault, so the bundle stays small and no third party learns
// which sites live in the vault.
//
// Runs before every `ng build` (see package.json). Output is not committed.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pkgDir = join(dirname(require.resolve('simple-icons/icons/github.svg')), '..');
const data = JSON.parse(readFileSync(join(pkgDir, 'data/simple-icons.json'), 'utf8'));
const out = join(dirname(fileURLToPath(import.meta.url)), '../public/brands');

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const compact = (s) => fold(s).replace(/[^a-z0-9]/g, '');

/** Hosts where brands keep their assets: never the brand's own site. */
const ASSET_HOSTS = /(^|\.)(github\.com|githubusercontent\.com|gitlab\.com|figma\.com|wikipedia\.org|wikimedia\.org|google\.com|dropbox\.com|behance\.net|dribbble\.com|twitter\.com|x\.com|apple\.com|play\.google\.com|npmjs\.com|youtube\.com|facebook\.com|medium\.com|imgur\.com|linkedin\.com|bitbucket\.org|codeberg\.org|sourceforge\.net|archive\.org)$/;

/** The source URL's domain, only when it clearly belongs to the brand. */
function domainOf(icon) {
  let host;
  try {
    host = new URL(icon.source).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return undefined;
  }
  if (ASSET_HOSTS.test(host)) return undefined;
  const parts = host.split('.');
  const label = parts.length > 2 && parts.at(-2).length <= 3 ? parts.at(-3) : parts.at(-2);
  const key = compact(label ?? '');
  const t = compact(icon.title);
  if (key.length < 2 || !(t.includes(key) || key.includes(t) || icon.slug.includes(key))) return undefined;
  // Subdominios de marketing ("brand.empresa.com") quedan como el dominio base.
  const keep = parts.length > 2 && parts.at(-2).length <= 3 ? 3 : 2;
  return parts.slice(-keep).join('.');
}

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'icons'), { recursive: true });

const index = data.map((icon) => {
  const e = { s: icon.slug, t: icon.title, h: icon.hex };
  const d = domainOf(icon);
  if (d) e.d = d;
  const aliases = [...(icon.aliases?.aka ?? []), ...Object.values(icon.aliases?.loc ?? {})];
  if (aliases.length) e.a = aliases;
  copyFileSync(join(pkgDir, 'icons', `${icon.slug}.svg`), join(out, 'icons', `${icon.slug}.svg`));
  return e;
});

writeFileSync(join(out, 'index.json'), JSON.stringify(index));
console.log(`${index.length} logos (${index.filter((e) => e.d).length} with domain) -> ${out}`);
