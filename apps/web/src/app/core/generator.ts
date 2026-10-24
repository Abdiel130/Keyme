import type { GeneratorRule } from '@keyme/models';
import { WORDS_ES } from './wordlist.es';

const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?/~';

/** Entero uniforme en [0, max) con rechazo para evitar sesgo de módulo. */
export function randomIndex(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % max;
}

export function generatePassword(rule: GeneratorRule): string {
  const sets: string[] = [];
  if (rule.lower !== false) sets.push(LOWER);
  if (rule.upper !== false) sets.push(UPPER);
  if (rule.digits !== false) sets.push(DIGITS);
  if (rule.symbols !== false) sets.push(rule.symbolSet || SYMBOLS);
  if (!sets.length) sets.push(LOWER);
  let length = Math.max(4, Math.min(rule.length ?? 20, 128));
  if (rule.maxLength) length = Math.min(length, rule.maxLength);
  length = Math.max(length, sets.length);

  const all = sets.join('');
  // Al menos un carácter de cada grupo activo, luego relleno y mezcla.
  const chars = sets.map((s) => s[randomIndex(s.length)]);
  while (chars.length < length) chars.push(all[randomIndex(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export interface PassphraseOptions {
  words: number;
  separator: string;
  capitalize?: boolean;
  number?: boolean;
}

export function generatePassphrase(o: PassphraseOptions): string {
  const words = Array.from({ length: Math.max(3, Math.min(o.words, 12)) }, () => WORDS_ES[randomIndex(WORDS_ES.length)]);
  const out = o.capitalize ? words.map((w) => w[0].toUpperCase() + w.slice(1)) : words;
  if (o.number) out[randomIndex(out.length)] += String(randomIndex(10));
  return out.join(o.separator);
}

/** Entropía aproximada en bits (para mostrar). */
export function entropyBits(rule: GeneratorRule & { mode?: string; words?: number }): number {
  if (rule.mode === 'passphrase') return Math.round((rule.words ?? 5) * Math.log2(WORDS_ES.length));
  let pool = 0;
  if (rule.lower !== false) pool += LOWER.length;
  if (rule.upper !== false) pool += UPPER.length;
  if (rule.digits !== false) pool += DIGITS.length;
  if (rule.symbols !== false) pool += (rule.symbolSet || SYMBOLS).length;
  return Math.round((rule.length ?? 20) * Math.log2(Math.max(pool, 2)));
}
