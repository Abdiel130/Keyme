#!/usr/bin/env node
// Builds src/app/ui/brands.data.ts from simple-icons (CC0).
//
// Brand logos ship inside the app on purpose: fetching favicons from a
// third party would tell that party which sites live in the vault, and the
// CSP only allows images from 'self', data: and blob:.
//
// Run: npm run brands -w @keyme/web
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as icons from 'simple-icons';

/**
 * slug in simple-icons -> domains that belong to it. The first domain is the
 * one the editor fills in when you pick the brand. Extra names help match
 * entries without a URL ("BBVA" on a card, "Disney+" as a title).
 */
const BRANDS = [
  ['google', ['google.com', 'accounts.google.com']],
  ['gmail', ['gmail.com', 'mail.google.com']],
  ['youtube', ['youtube.com']],
  ['googledrive', ['drive.google.com']],
  ['googlegemini', ['gemini.google.com'], ['gemini']],
  ['apple', ['apple.com', 'appleid.apple.com']],
  ['icloud', ['icloud.com']],
  ['github', ['github.com']],
  ['gitlab', ['gitlab.com']],
  ['bitbucket', ['bitbucket.org']],
  ['netflix', ['netflix.com']],
  ['spotify', ['spotify.com']],
  ['primevideo', ['primevideo.com'], ['prime video']],
  ['amazon', ['amazon.com.mx', 'amazon.com']],
  ['hbo', ['max.com', 'hbomax.com'], ['hbo max', 'max']],
  ['crunchyroll', ['crunchyroll.com']],
  ['twitch', ['twitch.tv']],
  ['facebook', ['facebook.com']],
  ['messenger', ['messenger.com']],
  ['instagram', ['instagram.com']],
  ['threads', ['threads.net']],
  ['whatsapp', ['whatsapp.com', 'web.whatsapp.com']],
  ['telegram', ['telegram.org', 'web.telegram.org']],
  ['signal', ['signal.org']],
  ['x', ['x.com', 'twitter.com'], ['twitter']],
  ['bluesky', ['bsky.app'], ['bluesky']],
  ['mastodon', ['mastodon.social']],
  ['tiktok', ['tiktok.com']],
  ['snapchat', ['snapchat.com']],
  ['pinterest', ['pinterest.com']],
  ['reddit', ['reddit.com']],
  ['discord', ['discord.com']],
  ['tumblr', ['tumblr.com']],
  ['medium', ['medium.com']],
  ['substack', ['substack.com']],
  ['quora', ['quora.com']],
  ['wikipedia', ['wikipedia.org']],
  ['steam', ['steampowered.com', 'store.steampowered.com', 'steamcommunity.com']],
  ['epicgames', ['epicgames.com'], ['epic games', 'epic']],
  ['playstation', ['playstation.com', 'sony.com'], ['psn']],
  ['nintendo', ['nintendo.com'], ['nintendo switch']],
  ['ea', ['ea.com'], ['electronic arts', 'origin']],
  ['ubisoft', ['ubisoft.com']],
  ['riotgames', ['riotgames.com'], ['riot', 'valorant', 'league of legends']],
  ['battledotnet', ['battle.net', 'blizzard.com'], ['blizzard']],
  ['roblox', ['roblox.com']],
  ['paypal', ['paypal.com']],
  ['mercadopago', ['mercadopago.com.mx', 'mercadopago.com'], ['mercado pago']],
  ['mercadolibre', ['mercadolibre.com.mx', 'mercadolibre.com'], ['mercado libre']],
  ['bbva', ['bbva.mx', 'bbva.com', 'bancomer.com'], ['bancomer']],
  ['santander', ['santander.com.mx', 'santander.com']],
  ['hsbc', ['hsbc.com.mx', 'hsbc.com']],
  ['nubank', ['nu.com.mx', 'nubank.com.br'], ['nu', 'nu mexico', 'nu méxico']],
  ['revolut', ['revolut.com']],
  ['wise', ['wise.com']],
  ['stripe', ['stripe.com']],
  ['visa', ['visa.com']],
  ['mastercard', ['mastercard.com']],
  ['americanexpress', ['americanexpress.com'], ['amex', 'american express']],
  ['binance', ['binance.com']],
  ['coinbase', ['coinbase.com']],
  ['bitso', ['bitso.com']],
  ['uber', ['uber.com']],
  ['ubereats', ['ubereats.com'], ['uber eats']],
  ['didi', ['didiglobal.com'], ['didi food']],
  ['rappi', ['rappi.com.mx', 'rappi.com']],
  ['airbnb', ['airbnb.com', 'airbnb.mx']],
  ['bookingdotcom', ['booking.com'], ['booking']],
  ['expedia', ['expedia.com', 'expedia.mx']],
  ['tripadvisor', ['tripadvisor.com']],
  ['starbucks', ['starbucks.com.mx', 'starbucks.com']],
  ['walmart', ['walmart.com.mx', 'walmart.com']],
  ['costco', ['costco.com.mx', 'costco.com']],
  ['ikea', ['ikea.com']],
  ['ebay', ['ebay.com']],
  ['etsy', ['etsy.com']],
  ['aliexpress', ['aliexpress.com']],
  ['shein', ['shein.com', 'shein.com.mx']],
  ['temu', ['temu.com']],
  ['shopify', ['shopify.com']],
  ['dropbox', ['dropbox.com']],
  ['mega', ['mega.nz', 'mega.io']],
  ['proton', ['proton.me', 'protonmail.com'], ['protonmail', 'proton mail']],
  ['notion', ['notion.so', 'notion.com']],
  ['obsidian', ['obsidian.md']],
  ['evernote', ['evernote.com']],
  ['todoist', ['todoist.com']],
  ['trello', ['trello.com']],
  ['jira', ['atlassian.net', 'atlassian.com'], ['atlassian']],
  ['slack', ['slack.com']],
  ['zoom', ['zoom.us', 'zoom.com']],
  ['figma', ['figma.com']],
  ['canva', ['canva.com']],
  ['miro', ['miro.com']],
  ['openai', ['openai.com', 'chatgpt.com', 'platform.openai.com'], ['chatgpt']],
  ['claude', ['claude.ai'], ['claude']],
  ['anthropic', ['anthropic.com', 'console.anthropic.com']],
  ['perplexity', ['perplexity.ai']],
  ['deepl', ['deepl.com']],
  ['grammarly', ['grammarly.com']],
  ['duolingo', ['duolingo.com']],
  ['coursera', ['coursera.org']],
  ['udemy', ['udemy.com']],
  ['khanacademy', ['khanacademy.org'], ['khan academy']],
  ['cloudflare', ['cloudflare.com', 'dash.cloudflare.com']],
  ['digitalocean', ['digitalocean.com']],
  ['vercel', ['vercel.com']],
  ['netlify', ['netlify.com']],
  ['heroku', ['heroku.com']],
  ['firebase', ['firebase.google.com']],
  ['supabase', ['supabase.com']],
  ['docker', ['docker.com', 'hub.docker.com']],
  ['npm', ['npmjs.com']],
  ['stackoverflow', ['stackoverflow.com'], ['stack overflow']],
  ['jetbrains', ['jetbrains.com']],
  ['postman', ['postman.com']],
  ['namecheap', ['namecheap.com']],
  ['godaddy', ['godaddy.com']],
  ['porkbun', ['porkbun.com']],
  ['hostinger', ['hostinger.com', 'hostinger.mx']],
  ['ovh', ['ovh.com', 'ovhcloud.com']],
  ['tailscale', ['tailscale.com']],
  ['bitwarden', ['bitwarden.com']],
  ['1password', ['1password.com']],
  ['samsung', ['samsung.com', 'account.samsung.com']],
  ['xiaomi', ['mi.com', 'xiaomi.com']],
  ['huawei', ['huawei.com']],
  ['motorola', ['motorola.com']],
  ['tplink', ['tp-link.com', 'tplinkcloud.com'], ['tp-link']],
  ['wordpress', ['wordpress.com']],
  ['patreon', ['patreon.com']],
  ['kofi', ['ko-fi.com']],
  ['soundcloud', ['soundcloud.com']],
  ['deezer', ['deezer.com']],
  ['tidal', ['tidal.com']],
  ['applemusic', ['music.apple.com'], ['apple music']],
  ['audible', ['audible.com', 'audible.com.mx']],
  ['goodreads', ['goodreads.com']],
  ['letterboxd', ['letterboxd.com']],
  ['strava', ['strava.com']],
  ['garmin', ['garmin.com', 'connect.garmin.com']],
  ['fitbit', ['fitbit.com']],
  ['duckduckgo', ['duckduckgo.com']],
  ['brave', ['brave.com']],
  ['mozilla', ['mozilla.org', 'accounts.firefox.com'], ['firefox']],
  ['opera', ['opera.com']],
  ['nvidia', ['nvidia.com']],
  ['amd', ['amd.com']],
  ['intel', ['intel.com']],
  ['dell', ['dell.com']],
  ['hp', ['hp.com']],
  ['lenovo', ['lenovo.com']],
  ['asus', ['asus.com']],
  ['logitech', ['logitech.com', 'logi.com']],
  ['razer', ['razer.com']],
  ['att', ['att.com.mx', 'att.com'], ['at&t']],
  ['telcel', ['telcel.com']],
  ['movistar', ['movistar.com.mx']],
  ['vimeo', ['vimeo.com']],
  ['plex', ['plex.tv']],
  ['jellyfin', ['jellyfin.org']],
  ['homeassistant', ['home-assistant.io', 'nabucasa.com'], ['home assistant']],
  ['synology', ['synology.com']],
  ['ring', ['ring.com']],
  ['tesla', ['tesla.com']],
  ['linktree', ['linktr.ee']],
  ['calendly', ['calendly.com']],
  ['mailchimp', ['mailchimp.com']],
  ['hubspot', ['hubspot.com']],
  ['salesforce', ['salesforce.com']],
  ['zoho', ['zoho.com']],
  ['wix', ['wix.com']],
  ['squarespace', ['squarespace.com']],
  ['behance', ['behance.net']],
  ['dribbble', ['dribbble.com']],
  ['unsplash', ['unsplash.com']],
  ['coursera', ['coursera.org']],
  ['platzi', ['platzi.com']],
  ['kaggle', ['kaggle.com']],
  ['huggingface', ['huggingface.co'], ['hugging face']],
  ['replit', ['replit.com']],
  ['codepen', ['codepen.io']],
  ['leetcode', ['leetcode.com']],
  ['hackerrank', ['hackerrank.com']],
];

/**
 * Brands simple-icons no longer carries (legal requests). Drawn here as plain
 * geometric marks or left as a colored monogram.
 */
const EXTRA = {
  microsoft: {
    t: 'Microsoft',
    h: '0078D4',
    p: 'M0 0h11.377v11.372H0zm12.623 0H24v11.372H12.623zM0 12.623h11.377V24H0zm12.623 0H24V24H12.623z',
    domains: ['microsoft.com', 'live.com', 'outlook.com', 'hotmail.com', 'office.com', 'xbox.com', 'skype.com', 'onedrive.live.com', 'login.live.com', 'azure.com'],
    names: ['outlook', 'hotmail', 'xbox', 'office', 'onedrive', 'azure', 'teams'],
  },
  linkedin: {
    t: 'LinkedIn',
    h: '0A66C2',
    p: 'M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z',
    domains: ['linkedin.com'],
    names: [],
  },
};

/** [color, name, domains, aliases] for brands without a logo: the monogram at least looks right. */
const COLORS = {
  banorte: ['EB0029', 'Banorte', ['banorte.com'], ['banorte']],
  banamex: ['00559F', 'Banamex', ['banamex.com', 'citibanamex.com'], ['citibanamex', 'banamex']],
  scotiabank: ['EC111A', 'Scotiabank', ['scotiabank.com.mx'], ['scotiabank']],
  inbursa: ['003B71', 'Inbursa', ['inbursa.com'], ['inbursa']],
  banregio: ['F47B20', 'Banregio', ['banregio.com'], ['banregio']],
  bancoazteca: ['00A859', 'Banco Azteca', ['bancoazteca.com.mx'], ['banco azteca']],
  stori: ['00B2A9', 'Stori', ['storicard.com'], ['stori']],
  klar: ['111111', 'Klar', ['klar.mx'], ['klar']],
  hey: ['000000', 'Hey Banco', ['heybanco.com'], ['hey banco']],
  cfe: ['008E5A', 'CFE', ['cfe.mx'], ['cfe']],
  sat: ['621132', 'SAT', ['sat.gob.mx'], ['sat']],
  imss: ['13322B', 'IMSS', ['imss.gob.mx'], ['imss']],
  infonavit: ['C8102E', 'Infonavit', ['infonavit.org.mx'], ['infonavit']],
  izzi: ['00B4E6', 'izzi', ['izzi.mx'], ['izzi']],
  totalplay: ['4C2A85', 'Totalplay', ['totalplay.com.mx'], ['totalplay']],
  disney: ['113CCF', 'Disney+', ['disneyplus.com'], ['disney+', 'disney plus', 'disney']],
  liverpool: ['E10098', 'Liverpool', ['liverpool.com.mx'], ['liverpool']],
  oxxo: ['E31837', 'OXXO', ['oxxo.com'], ['oxxo', 'spin by oxxo']],
};

/** Color for BRANDS entries that simple-icons dropped (shown as a monogram). */
const FALLBACK_HEX = {
  primevideo: ['00A8E1', 'Prime Video'], amazon: ['FF9900', 'Amazon'], nintendo: ['E60012', 'Nintendo'],
  mercadolibre: ['FFE600', 'Mercado Libre'], bbva: ['004481', 'BBVA'], santander: ['EC0000', 'Santander'],
  bitso: ['1E2329', 'Bitso'], didi: ['FC4C02', 'DiDi'], rappi: ['FF441F', 'Rappi'], walmart: ['0071CE', 'Walmart'],
  costco: ['E31837', 'Costco'], shein: ['000000', 'SHEIN'], temu: ['FB7701', 'Temu'], slack: ['4A154B', 'Slack'],
  canva: ['00C4CC', 'Canva'], openai: ['10A37F', 'OpenAI'], heroku: ['430098', 'Heroku'], logitech: ['00B8FC', 'Logitech'],
  att: ['00A8E0', 'AT&T'], telcel: ['1A3B8F', 'Telcel'], salesforce: ['00A1E0', 'Salesforce'], codepen: ['000000', 'CodePen'],
};

const bySlug = new Map(Object.values(icons).filter((i) => i && i.slug).map((i) => [i.slug, i]));
const out = { brands: {}, domains: {}, names: {} };
const missing = [];
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

for (const [slug, domains, names = []] of BRANDS) {
  const icon = bySlug.get(slug);
  const fb = FALLBACK_HEX[slug];
  if (!icon && !fb) {
    missing.push(slug);
    continue;
  }
  const b = icon ? { t: icon.title, h: icon.hex, p: icon.path } : { t: fb[1], h: fb[0], p: '' };
  out.brands[slug] = b;
  for (const d of domains) out.domains[d] ??= slug;
  for (const n of [b.t, ...names]) out.names[fold(n)] ??= slug;
}
for (const [slug, b] of Object.entries(EXTRA)) {
  out.brands[slug] = { t: b.t, h: b.h, p: b.p };
  for (const d of b.domains) out.domains[d] ??= slug;
  for (const n of [b.t, ...b.names]) out.names[fold(n)] ??= slug;
}
for (const [slug, [hex, title, domains, names]] of Object.entries(COLORS)) {
  out.brands[slug] ??= { t: title, h: hex, p: '' };
  for (const d of domains) out.domains[d] ??= slug;
  for (const n of names) out.names[fold(n)] ??= slug;
}

const file = join(dirname(fileURLToPath(import.meta.url)), '../src/app/ui/brands.data.ts');
writeFileSync(
  file,
  `// Generated by scripts/brand-icons.mjs from simple-icons (CC0). Do not edit.\n` +
    `// Brand names and logos belong to their owners.\n` +
    `/* eslint-disable */\n` +
    `export const BRANDS: Record<string, { t: string; h: string; p: string }> = ${JSON.stringify(out.brands)};\n` +
    `export const DOMAINS: Record<string, string> = ${JSON.stringify(out.domains)};\n` +
    `export const NAMES: Record<string, string> = ${JSON.stringify(out.names)};\n`,
);
console.log(`${Object.keys(out.brands).length} brands, ${Object.keys(out.domains).length} domains -> ${file}`);
if (missing.length) console.log(`Skipped (not in simple-icons, no fallback color): ${missing.join(', ')}`);
