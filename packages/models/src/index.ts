/**
 * Modelo de datos de Keyme. Todo esto vive DENTRO del JSON cifrado de cada
 * elemento: el servidor no ve ninguno de estos campos.
 */

export type EntryKind = 'login' | 'card' | 'document' | 'identity' | 'note' | 'wifi';
export type RecordKind = EntryKind | 'space' | 'settings';

/** Id fijo del registro de ajustes (uno por vault). */
export const SETTINGS_ID = '00000000-0000-7000-8000-000000000000';

export interface CustomField {
  id: string;
  label: string;
  value: string;
  secret: boolean;
}

export interface AttachmentRef {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Llave del adjunto (base64url). Va aquí dentro, cifrada con la Vault Key. */
  key: string;
}

export interface HistoryEntry {
  at: string;
  /** Contraseña anterior (logins y wifi). */
  password?: string;
  /** Copia completa de una versión perdedora en un conflicto de sync. */
  snapshot?: Omit<Entry, 'history'>;
  reason: 'edit' | 'conflict';
}

export interface UrlMatch {
  value: string;
  /** base: dominio registrable · host: host exacto · regex: expresión regular. */
  match: 'base' | 'host' | 'regex';
}

export interface RecoveryCode {
  code: string;
  used: boolean;
}

export interface GeneratorRule {
  length?: number;
  lower?: boolean;
  upper?: boolean;
  digits?: boolean;
  symbols?: boolean;
  /** Símbolos permitidos si el sitio solo acepta algunos. */
  symbolSet?: string;
  maxLength?: number;
}

interface EntryBase {
  id: string;
  kind: EntryKind;
  title: string;
  spaceId: string | null;
  tags: string[];
  favorite: boolean;
  notes: string;
  fields: CustomField[];
  attachments: AttachmentRef[];
  history: HistoryEntry[];
  createdAt: string;
  modifiedAt: string;
  /** Última rotación de la contraseña o secreto principal. */
  rotatedAt?: string;
  usage?: { count: number; lastUsedAt: string };
}

export interface LoginEntry extends EntryBase {
  kind: 'login';
  username: string;
  password: string;
  urls: UrlMatch[];
  androidPackages: string[];
  /** URI otpauth:// o secreto base32. */
  totp?: string;
  recoveryCodes: RecoveryCode[];
  /** "Inicia sesión con…": id del login proveedor (p. ej. la cuenta de Google). */
  signInWith?: string | null;
  generatorRule?: GeneratorRule;
}

export type CardNetwork = 'visa' | 'mastercard' | 'amex' | 'discover' | 'carnet' | 'other';

export interface CardEntry extends EntryBase {
  kind: 'card';
  holder: string;
  number: string;
  expiry: string; // MM/AA
  cvv: string;
  dynamicCvv: boolean;
  pin: string;
  bank: string;
  network: CardNetwork;
  /** Paquete Android de la app del banco, p. ej. com.bbva.bbvacontigo */
  bankAppPackage: string;
  /** Deep link opcional a la pantalla del CVV dinámico. */
  bankAppUrl: string;
  /** Tono de la tarjeta en la vista (0-360). */
  hue?: number;
}

export type DocumentType = 'ine' | 'curp' | 'rfc' | 'nss' | 'pasaporte' | 'licencia' | 'otro';

export interface DocumentEntry extends EntryBase {
  kind: 'document';
  docType: DocumentType;
  number: string;
  fullName: string;
  issuedAt: string;
  expiresAt: string;
}

export interface IdentityEntry extends EntryBase {
  kind: 'identity';
  fullName: string;
  email: string;
  phone: string;
  birthDate: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface NoteEntry extends EntryBase {
  kind: 'note';
}

export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';

export interface WifiEntry extends EntryBase {
  kind: 'wifi';
  ssid: string;
  password: string;
  security: WifiSecurity;
  hidden: boolean;
}

export type Entry = LoginEntry | CardEntry | DocumentEntry | IdentityEntry | NoteEntry | WifiEntry;

export interface Space {
  id: string;
  kind: 'space';
  name: string;
  color: string;
  icon: string;
  order: number;
  modifiedAt: string;
}

export interface SiteRule {
  domain: string;
  rule: GeneratorRule;
}

export interface Settings {
  id: typeof SETTINGS_ID;
  kind: 'settings';
  autoLockMinutes: number;
  lockOnHide: boolean;
  clipboardSeconds: number;
  theme: 'dark' | 'light' | 'system';
  generator: GeneratorRule & { mode: 'random' | 'passphrase'; words: number; separator: string };
  siteRules: SiteRule[];
  modifiedAt: string;
}

export type VaultRecord = Entry | Space | Settings;

export const DEFAULT_SETTINGS: Omit<Settings, 'modifiedAt'> = {
  id: SETTINGS_ID,
  kind: 'settings',
  autoLockMinutes: 5,
  lockOnHide: false,
  clipboardSeconds: 45,
  theme: 'dark',
  generator: { mode: 'random', length: 20, lower: true, upper: true, digits: true, symbols: true, words: 5, separator: '-' },
  siteRules: [],
};

export const DEFAULT_SPACES: Pick<Space, 'name' | 'color' | 'icon'>[] = [
  { name: 'Personal', color: '#e0a458', icon: 'home' },
  { name: 'Escuela', color: '#7fb7a4', icon: 'school' },
  { name: 'Trabajo', color: '#8fa3e6', icon: 'briefcase' },
];

export const SPACE_COLORS = ['#e0a458', '#7fb7a4', '#8fa3e6', '#d98a8a', '#b79ce0', '#c9c26b', '#6fb3d2', '#d9a0c4'];

export const KIND_LABELS: Record<EntryKind, string> = {
  login: 'Login',
  card: 'Tarjeta',
  document: 'Documento',
  identity: 'Identidad',
  note: 'Nota segura',
  wifi: 'Wi-Fi',
};

export const DOC_LABELS: Record<DocumentType, string> = {
  ine: 'INE',
  curp: 'CURP',
  rfc: 'RFC',
  nss: 'NSS',
  pasaporte: 'Pasaporte',
  licencia: 'Licencia de conducir',
  otro: 'Otro',
};

// ---------------------------------------------------------------------------
// Fábricas
// ---------------------------------------------------------------------------

export function uuidv7(): string {
  const ts = Date.now();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[0] = (ts / 2 ** 40) & 0xff;
  bytes[1] = (ts / 2 ** 32) & 0xff;
  bytes[2] = (ts >>> 24) & 0xff;
  bytes[3] = (ts >>> 16) & 0xff;
  bytes[4] = (ts >>> 8) & 0xff;
  bytes[5] = ts & 0xff;
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function newEntry<K extends EntryKind>(kind: K, spaceId: string | null, now = new Date().toISOString()): Extract<Entry, { kind: K }> {
  const base: EntryBase = {
    id: uuidv7(),
    kind,
    title: '',
    spaceId,
    tags: [],
    favorite: false,
    notes: '',
    fields: [],
    attachments: [],
    history: [],
    createdAt: now,
    modifiedAt: now,
  };
  const extra: Record<EntryKind, object> = {
    login: { username: '', password: '', urls: [], androidPackages: [], recoveryCodes: [], signInWith: null },
    card: { holder: '', number: '', expiry: '', cvv: '', dynamicCvv: false, pin: '', bank: '', network: 'other', bankAppPackage: '', bankAppUrl: '' },
    document: { docType: 'ine', number: '', fullName: '', issuedAt: '', expiresAt: '' },
    identity: { fullName: '', email: '', phone: '', birthDate: '', street: '', city: '', state: '', zip: '', country: 'México' },
    note: {},
    wifi: { ssid: '', password: '', security: 'WPA', hidden: false },
  };
  return { ...base, ...extra[kind] } as Extract<Entry, { kind: K }>;
}

/** Rellena campos faltantes (registros de versiones viejas o importados). */
export function normalizeEntry(raw: Partial<Entry> & { kind: EntryKind; id: string }): Entry {
  const fresh = newEntry(raw.kind, raw.spaceId ?? null, raw.createdAt);
  return { ...fresh, ...raw, id: raw.id } as Entry;
}

export function isEntry(r: VaultRecord): r is Entry {
  return r.kind !== 'space' && r.kind !== 'settings';
}

/** Secreto principal (para salud, historial y copiar rápido). */
export function primarySecret(e: Entry): string {
  switch (e.kind) {
    case 'login':
    case 'wifi':
      return e.password;
    case 'card':
      return e.number;
    case 'document':
      return e.number;
    default:
      return '';
  }
}

export function subtitle(e: Entry): string {
  switch (e.kind) {
    case 'login':
      return e.username || hostOf(e.urls[0]?.value ?? '') || '';
    case 'card':
      return [e.bank, maskCard(e.number)].filter(Boolean).join(' · ');
    case 'document':
      return [DOC_LABELS[e.docType], e.number && mask(e.number, 4)].filter(Boolean).join(' · ');
    case 'identity':
      return e.email || e.phone || e.fullName;
    case 'note':
      return e.notes.split('\n')[0].slice(0, 60);
    case 'wifi':
      return e.ssid;
  }
}

// ---------------------------------------------------------------------------
// Tarjetas
// ---------------------------------------------------------------------------

export function digitsOnly(s: string): string {
  return s.replace(/\D+/g, '');
}

export function detectNetwork(number: string): CardNetwork {
  const n = digitsOnly(number);
  if (/^4/.test(n)) return 'visa';
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(n)) return 'mastercard';
  if (/^3[47]/.test(n)) return 'amex';
  if (/^(6011|65|64[4-9])/.test(n)) return 'discover';
  if (/^(5062|5064|6363|6046|5065|5066)/.test(n)) return 'carnet';
  return 'other';
}

export function luhnValid(number: string): boolean {
  const n = digitsOnly(number);
  if (n.length < 12) return false;
  let sum = 0;
  for (let i = 0; i < n.length; i++) {
    let d = +n[n.length - 1 - i];
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** 4-4-4-4 (o 4-6-5 para Amex). */
export function formatCard(number: string): string {
  const n = digitsOnly(number);
  if (/^3[47]/.test(n)) return [n.slice(0, 4), n.slice(4, 10), n.slice(10)].filter(Boolean).join(' ');
  return n.replace(/(.{4})/g, '$1 ').trim();
}

export function maskCard(number: string): string {
  const n = digitsOnly(number);
  return n ? `•••• ${n.slice(-4)}` : '';
}

export function mask(s: string, visible = 0): string {
  if (!s) return '';
  return '•'.repeat(Math.max(4, s.length - visible)).slice(0, 12) + (visible ? s.slice(-visible) : '');
}

/** Vencimiento MM/AA → último día del mes. */
export function cardExpiryDate(expiry: string): Date | null {
  const m = /^(\d{1,2})\s*\/\s*(\d{2,4})$/.exec(expiry.trim());
  if (!m) return null;
  const month = +m[1];
  let year = +m[2];
  if (year < 100) year += 2000;
  if (month < 1 || month > 12) return null;
  return new Date(year, month, 0, 23, 59, 59);
}

// ---------------------------------------------------------------------------
// Vencimientos
// ---------------------------------------------------------------------------

export interface Expiring {
  entry: Entry;
  date: Date;
  days: number;
}

/** Documentos y tarjetas que vencen en los próximos `withinDays` días (o ya vencidos). */
export function expiringSoon(entries: Entry[], withinDays = 30, now = new Date()): Expiring[] {
  const out: Expiring[] = [];
  for (const e of entries) {
    let date: Date | null = null;
    if (e.kind === 'document' && e.expiresAt) date = new Date(e.expiresAt + 'T23:59:59');
    if (e.kind === 'card' && e.expiry) date = cardExpiryDate(e.expiry);
    if (!date || isNaN(+date)) continue;
    const days = Math.ceil((+date - +now) / 86_400_000);
    if (days <= withinDays) out.push({ entry: e, date, days });
  }
  return out.sort((a, b) => a.days - b.days);
}

// ---------------------------------------------------------------------------
// Dominios
// ---------------------------------------------------------------------------

// Sufijos de dos niveles más comunes (subconjunto de la Public Suffix List).
const MULTI_SUFFIXES = new Set([
  'com.mx', 'gob.mx', 'org.mx', 'edu.mx', 'net.mx', 'unam.mx',
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.ar', 'com.br', 'com.co', 'com.au', 'co.jp', 'com.es', 'gob.es',
  'github.io', 'vercel.app', 'netlify.app', 'web.app', 'firebaseapp.com', 'pages.dev', 'herokuapp.com',
]);

export function hostOf(url: string): string {
  const raw = url.trim();
  if (!raw) return '';
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function baseDomain(host: string): string {
  const parts = host.toLowerCase().split('.').filter(Boolean);
  if (parts.length <= 2 || /^\d+(\.\d+){3}$/.test(host)) return host;
  const last2 = parts.slice(-2).join('.');
  return MULTI_SUFFIXES.has(last2) ? parts.slice(-3).join('.') : last2;
}

/**
 * ¿Este login aplica a esta URL? Solo coincidencia exacta de dominio (nunca
 * "parecido") para proteger contra phishing.
 */
export function matchesUrl(entry: LoginEntry, url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return entry.urls.some((m) => {
    if (m.match === 'regex') {
      try {
        return new RegExp(m.value).test(url);
      } catch {
        return false;
      }
    }
    const target = hostOf(m.value);
    if (!target) return false;
    return m.match === 'host' ? target === host : baseDomain(target) === baseDomain(host);
  });
}

/** Favicon público por dominio (solo se pide el dominio, nunca datos del vault). */
export function iconDomain(e: Entry): string | null {
  if (e.kind !== 'login' || !e.urls.length) return null;
  const h = hostOf(e.urls[0].value);
  return h ? baseDomain(h) : null;
}

// ---------------------------------------------------------------------------
// Wi-Fi
// ---------------------------------------------------------------------------

export function wifiQrPayload(w: Pick<WifiEntry, 'ssid' | 'password' | 'security' | 'hidden'>): string {
  const esc = (s: string) => s.replace(/([\\;,:"])/g, '\\$1');
  return `WIFI:T:${w.security};S:${esc(w.ssid)};${w.security === 'nopass' ? '' : `P:${esc(w.password)};`}${w.hidden ? 'H:true;' : ''};`;
}

// ---------------------------------------------------------------------------
// Búsqueda difusa (subsecuencia con bonus por inicio de palabra)
// ---------------------------------------------------------------------------

export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function fuzzyScore(query: string, text: string): number {
  const q = fold(query).trim();
  const t = fold(text);
  if (!q) return 1;
  const idx = t.indexOf(q);
  if (idx >= 0) return 100 - idx + (idx === 0 || /\W/.test(t[idx - 1]) ? 50 : 0);
  let score = 0;
  let ti = 0;
  let streak = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return 0;
    streak = found === ti ? streak + 1 : 0;
    score += 1 + streak * 2 + (found === 0 || /\W/.test(t[found - 1]) ? 3 : 0);
    ti = found + 1;
  }
  return score;
}

export function searchText(e: Entry, spaceName = ''): string {
  const parts: string[] = [e.title, e.tags.join(' '), spaceName, KIND_LABELS[e.kind]];
  if (e.kind === 'login') parts.push(e.username, ...e.urls.map((u) => u.value), ...e.androidPackages);
  if (e.kind === 'card') parts.push(e.bank, e.holder, digitsOnly(e.number).slice(-4));
  if (e.kind === 'document') parts.push(DOC_LABELS[e.docType], e.fullName);
  if (e.kind === 'identity') parts.push(e.fullName, e.email, e.phone);
  if (e.kind === 'wifi') parts.push(e.ssid);
  return parts.filter(Boolean).join(' ');
}
