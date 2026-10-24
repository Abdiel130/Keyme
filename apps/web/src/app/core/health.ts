import type { Entry, Space } from '@keyme/models';
import { strength } from './strength';

export const OLD_AFTER_DAYS = 365;

async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export interface HealthIssue {
  entry: Entry;
  weak?: number; // score zxcvbn 0-4
  reusedWith?: number;
  ageDays?: number;
  pwned?: number;
}

export interface HealthReport {
  issues: Map<string, HealthIssue>;
  checked: number;
  weak: number;
  reused: number;
  old: number;
  pwned: number;
  /** 0-100 por espacio (clave '' = sin espacio). */
  bySpace: { space: Space | null; score: number; total: number; issues: number }[];
  score: number;
}

function passwordOf(e: Entry): string | null {
  return e.kind === 'login' || e.kind === 'wifi' ? e.password || null : null;
}

export function analyze(entries: Entry[], spaces: Space[], pwned: Map<string, number> = new Map(), now = Date.now()): HealthReport {
  const withPass = entries.filter((e) => passwordOf(e));
  const groups = new Map<string, Entry[]>();
  for (const e of withPass) {
    const p = passwordOf(e)!;
    groups.set(p, [...(groups.get(p) ?? []), e]);
  }

  const issues = new Map<string, HealthIssue>();
  const add = (e: Entry, patch: Partial<HealthIssue>) => issues.set(e.id, { ...(issues.get(e.id) ?? { entry: e }), ...patch });
  let weak = 0, reused = 0, old = 0, pw = 0;

  for (const e of withPass) {
    const p = passwordOf(e)!;
    const s = strength(p, e.kind === 'login' ? [e.username, e.title] : [e.title]).score;
    if (s <= 2) {
      weak++;
      add(e, { weak: s });
    }
    const g = groups.get(p)!;
    if (g.length > 1) {
      reused++;
      add(e, { reusedWith: g.length - 1 });
    }
    const since = e.rotatedAt ?? e.createdAt;
    const age = Math.floor((now - +new Date(since)) / 86_400_000);
    if (age > OLD_AFTER_DAYS) {
      old++;
      add(e, { ageDays: age });
    }
    const n = pwned.get(e.id);
    if (n) {
      pw++;
      add(e, { pwned: n });
    }
  }

  const scoreOf = (list: Entry[]) => {
    const relevant = list.filter((e) => passwordOf(e));
    if (!relevant.length) return 100;
    const penalty = relevant.reduce((acc, e) => {
      const i = issues.get(e.id);
      if (!i) return acc;
      return acc + (i.pwned ? 1 : 0) * 1 + (i.weak !== undefined ? 0.7 : 0) + (i.reusedWith ? 0.6 : 0) + (i.ageDays ? 0.2 : 0);
    }, 0);
    return Math.max(0, Math.round(100 - (penalty / relevant.length) * 100));
  };

  const bySpace = [...spaces, null].map((space) => {
    const list = withPass.filter((e) => (space ? e.spaceId === space.id : !spaces.some((s) => s.id === e.spaceId)));
    return { space, score: scoreOf(list), total: list.length, issues: list.filter((e) => issues.has(e.id)).length };
  }).filter((r) => r.total > 0);

  return { issues, checked: withPass.length, weak, reused, old, pwned: pw, bySpace, score: scoreOf(withPass) };
}

/**
 * Have I Been Pwned con k-anonymity: solo salen los primeros 5 caracteres
 * del SHA-1; la comparación del resto se hace aquí.
 */
export async function checkPwned(entries: Entry[], onProgress?: (done: number, total: number) => void): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const byHash = new Map<string, string[]>();
  for (const e of entries) {
    const p = passwordOf(e);
    if (!p) continue;
    const h = await sha1Hex(p);
    byHash.set(h, [...(byHash.get(h) ?? []), e.id]);
  }
  const prefixes = new Map<string, string[]>();
  for (const h of byHash.keys()) prefixes.set(h.slice(0, 5), [...(prefixes.get(h.slice(0, 5)) ?? []), h]);

  let done = 0;
  for (const [prefix, hashes] of prefixes) {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, { headers: { 'Add-Padding': 'true' }, referrerPolicy: 'no-referrer', cache: 'no-store' });
    if (!res.ok) throw new Error(`HIBP respondió ${res.status}`);
    const text = await res.text();
    const counts = new Map<string, number>();
    for (const line of text.split('\n')) {
      const [suffix, count] = line.trim().split(':');
      if (suffix) counts.set(prefix + suffix.toUpperCase(), parseInt(count, 10));
    }
    for (const h of hashes) {
      const c = counts.get(h);
      if (c) for (const id of byHash.get(h)!) out.set(id, c);
    }
    onProgress?.(++done, prefixes.size);
  }
  return out;
}
