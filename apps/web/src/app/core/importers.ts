/**
 * Importadores. Todo corre en el navegador: el archivo en claro nunca sale
 * de este dispositivo; solo viajan los blobs ya cifrados.
 */
import {
  detectNetwork,
  digitsOnly,
  newEntry,
  uuidv7,
  type CardEntry,
  type CustomField,
  type Entry,
  type IdentityEntry,
  type LoginEntry,
  type NoteEntry,
  type WifiEntry,
} from '@keyme/models';

export type ImportFormat = 'safeincloud' | 'bitwarden' | 'chrome' | 'keyme';

export interface ImportResult {
  entries: Entry[];
  skipped: number;
  warnings: string[];
}

export function detectFormat(name: string, text: string): ImportFormat | null {
  const t = text.trimStart();
  if (name.endsWith('.keyme') || t.startsWith('{"format":"keyme-export"') || /"format"\s*:\s*"keyme-export"/.test(t.slice(0, 200))) return 'keyme';
  if (t.startsWith('<?xml') || t.startsWith('<database')) return 'safeincloud';
  if (t.startsWith('{')) return 'bitwarden';
  if (/^name,url,username,password/i.test(t) || name.endsWith('.csv')) return 'chrome';
  return null;
}

const field = (label: string, value: string, secret = false): CustomField => ({ id: uuidv7(), label, value, secret });

function url(v: string) {
  return { value: v.trim(), match: 'base' as const };
}

// ---------------------------------------------------------------------------
// SafeInCloud (XML)
// ---------------------------------------------------------------------------

export function importSafeInCloud(xml: string, spaceId: string | null): ImportResult {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('El XML no es válido');
  const labels = new Map<string, string>();
  doc.querySelectorAll('database > label').forEach((l) => labels.set(l.getAttribute('id') ?? '', l.getAttribute('name') ?? ''));

  const entries: Entry[] = [];
  let skipped = 0;
  doc.querySelectorAll('database > card').forEach((card) => {
    if (card.getAttribute('template') === 'true' || card.getAttribute('deleted') === 'true') {
      skipped++;
      return;
    }
    const title = card.getAttribute('title') ?? 'Sin título';
    const symbol = (card.getAttribute('symbol') ?? '').toLowerCase();
    const fields = [...card.querySelectorAll(':scope > field')].map((f) => ({
      name: f.getAttribute('name') ?? '',
      type: (f.getAttribute('type') ?? 'text').toLowerCase(),
      value: f.textContent ?? '',
    })).filter((f) => f.value.trim());
    const notes = card.querySelector(':scope > notes')?.textContent ?? '';
    const tags = [...card.querySelectorAll(':scope > label_id')].map((l) => labels.get(l.textContent ?? '')).filter((x): x is string => !!x);
    const star = card.getAttribute('star') === 'true';
    const take = (pred: (f: { name: string; type: string }) => boolean) => {
      const i = fields.findIndex(pred);
      return i >= 0 ? fields.splice(i, 1)[0].value : '';
    };
    const named = (...names: string[]) => (f: { name: string }) => names.some((n) => f.name.toLowerCase().includes(n));

    let e: Entry;
    const looksCard = symbol.includes('card') || symbol === 'visa' || symbol === 'mastercard' || fields.some((f) => f.type === 'expiry');
    const looksWifi = symbol.includes('wifi') || symbol.includes('router');
    if (looksCard) {
      const c = newEntry('card', spaceId) as CardEntry;
      c.number = digitsOnly(take((f) => f.type === 'number' || named('número', 'number', 'numero')(f)));
      c.expiry = take((f) => f.type === 'expiry' || named('vence', 'expir', 'caduc')(f));
      c.cvv = take(named('cvv', 'cvc', 'código', 'codigo'));
      c.pin = take((f) => f.type === 'pin' || named('pin', 'nip')(f));
      c.holder = take(named('titular', 'owner', 'nombre', 'name'));
      c.bank = take(named('banco', 'bank'));
      c.network = detectNetwork(c.number);
      e = c;
    } else if (looksWifi) {
      const w = newEntry('wifi', spaceId) as WifiEntry;
      w.ssid = take(named('ssid', 'red', 'network', 'nombre')) || title;
      w.password = take((f) => f.type === 'password');
      e = w;
    } else if (fields.some((f) => f.type === 'login' || f.type === 'password' || f.type === 'website' || f.type === 'email')) {
      const l = newEntry('login', spaceId) as LoginEntry;
      l.username = take((f) => f.type === 'login') || take((f) => f.type === 'email');
      l.password = take((f) => f.type === 'password');
      const sites: string[] = [];
      let site: string;
      while ((site = take((f) => f.type === 'website'))) sites.push(site);
      l.urls = sites.map(url);
      l.totp = take((f) => f.type === 'one_time_password') || undefined;
      e = l;
    } else {
      e = newEntry('note', spaceId) as NoteEntry;
    }

    e.title = title;
    e.notes = notes;
    e.tags = tags;
    e.favorite = star;
    e.fields = fields.map((f) => field(f.name || f.type, f.value, ['password', 'pin', 'secret', 'one_time_password'].includes(f.type)));
    entries.push(e);
  });
  return { entries, skipped, warnings: [] };
}

// ---------------------------------------------------------------------------
// Bitwarden (JSON sin cifrar)
// ---------------------------------------------------------------------------

interface BwItem {
  type: number;
  name?: string;
  notes?: string | null;
  favorite?: boolean;
  folderId?: string | null;
  login?: { username?: string | null; password?: string | null; totp?: string | null; uris?: { uri?: string | null }[] | null };
  card?: { cardholderName?: string | null; brand?: string | null; number?: string | null; expMonth?: string | null; expYear?: string | null; code?: string | null };
  identity?: Record<string, string | null>;
  fields?: { name?: string | null; value?: string | null; type?: number }[] | null;
}

export function importBitwarden(text: string, spaceId: string | null): ImportResult {
  const data = JSON.parse(text) as { encrypted?: boolean; folders?: { id: string; name: string }[]; items?: BwItem[] };
  if (data.encrypted) throw new Error('Esa exportación de Bitwarden está cifrada. Exporta en formato JSON sin cifrar.');
  const folders = new Map((data.folders ?? []).map((f) => [f.id, f.name]));
  const entries: Entry[] = [];
  let skipped = 0;

  for (const it of data.items ?? []) {
    let e: Entry;
    if (it.type === 1) {
      const l = newEntry('login', spaceId) as LoginEntry;
      l.username = it.login?.username ?? '';
      l.password = it.login?.password ?? '';
      l.totp = it.login?.totp ?? undefined;
      l.urls = (it.login?.uris ?? []).map((u) => u.uri ?? '').filter(Boolean).map((u) => {
        if (u.startsWith('androidapp://')) {
          l.androidPackages.push(u.slice('androidapp://'.length));
          return null;
        }
        return url(u);
      }).filter((u): u is ReturnType<typeof url> => !!u);
      e = l;
    } else if (it.type === 3) {
      const c = newEntry('card', spaceId) as CardEntry;
      c.holder = it.card?.cardholderName ?? '';
      c.number = digitsOnly(it.card?.number ?? '');
      const m = it.card?.expMonth ?? '';
      const y = it.card?.expYear ?? '';
      c.expiry = m && y ? `${m.padStart(2, '0')}/${y.slice(-2)}` : '';
      c.cvv = it.card?.code ?? '';
      c.network = detectNetwork(c.number);
      e = c;
    } else if (it.type === 4) {
      const i = newEntry('identity', spaceId) as IdentityEntry;
      const id = it.identity ?? {};
      i.fullName = [id['firstName'], id['middleName'], id['lastName']].filter(Boolean).join(' ');
      i.email = id['email'] ?? '';
      i.phone = id['phone'] ?? '';
      i.street = [id['address1'], id['address2'], id['address3']].filter(Boolean).join(', ');
      i.city = id['city'] ?? '';
      i.state = id['state'] ?? '';
      i.zip = id['postalCode'] ?? '';
      i.country = id['country'] ?? '';
      e = i;
    } else if (it.type === 2) {
      e = newEntry('note', spaceId) as NoteEntry;
    } else {
      skipped++;
      continue;
    }
    e.title = it.name ?? 'Sin título';
    e.notes = it.notes ?? '';
    e.favorite = !!it.favorite;
    const folder = it.folderId ? folders.get(it.folderId) : undefined;
    e.tags = folder ? [folder] : [];
    e.fields = (it.fields ?? []).filter((f) => f.value).map((f) => field(f.name ?? 'Campo', f.value ?? '', f.type === 1));
    entries.push(e);
  }
  return { entries, skipped, warnings: [] };
}

// ---------------------------------------------------------------------------
// Chrome / Edge (CSV: name,url,username,password,note)
// ---------------------------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export function importChromeCsv(text: string, spaceId: string | null): ImportResult {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ''));
  if (!header) return { entries: [], skipped: 0, warnings: ['Archivo vacío'] };
  const col = (n: string) => header.findIndex((h) => h.trim().toLowerCase() === n);
  const [iName, iUrl, iUser, iPass, iNote] = ['name', 'url', 'username', 'password', 'note'].map(col);
  if (iPass < 0) throw new Error('El CSV no tiene columna "password"');

  const entries: Entry[] = [];
  let skipped = 0;
  for (const r of rows) {
    const password = r[iPass] ?? '';
    const site = iUrl >= 0 ? r[iUrl] ?? '' : '';
    if (!password && !site) {
      skipped++;
      continue;
    }
    const l = newEntry('login', spaceId) as LoginEntry;
    l.title = (iName >= 0 && r[iName]) || site.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] || 'Sin título';
    l.username = iUser >= 0 ? r[iUser] ?? '' : '';
    l.password = password;
    if (site.startsWith('android://')) {
      const pkg = /@([\w.]+)\/?$/.exec(site)?.[1];
      if (pkg) l.androidPackages = [pkg];
    } else if (site) l.urls = [url(site)];
    l.notes = iNote >= 0 ? r[iNote] ?? '' : '';
    entries.push(l);
  }
  return { entries, skipped, warnings: [] };
}

/** Elementos que ya existen (mismo título + usuario + contraseña) para no duplicar. */
export function dedupeKey(e: Entry): string {
  const u = e.kind === 'login' ? `${e.username}|${e.password}` : e.kind === 'card' ? e.number : e.kind === 'wifi' ? `${e.ssid}|${e.password}` : e.notes.slice(0, 50);
  return `${e.kind}|${e.title.trim().toLowerCase()}|${u}`;
}
