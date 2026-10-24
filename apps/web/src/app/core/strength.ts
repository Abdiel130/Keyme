import { signal } from '@angular/core';
import type { ZxcvbnFactory } from '@zxcvbn-ts/core';

/**
 * zxcvbn con diccionarios en español pesa ~1.5 MB: se carga bajo demanda.
 * Mientras llega, `strength()` usa una estimación simple y, al quedar listo,
 * la señal hace que los `computed` que la usan se recalculen.
 */
const ready = signal(false);
let factory: ZxcvbnFactory | null = null;
let loading: Promise<void> | null = null;

export function ensureStrength(): Promise<void> {
  loading ??= (async () => {
    const [{ ZxcvbnFactory }, common, es] = await Promise.all([
      import('@zxcvbn-ts/core'),
      import('@zxcvbn-ts/language-common'),
      import('@zxcvbn-ts/language-es-es'),
    ]);
    factory = new ZxcvbnFactory({
      translations: es.translations,
      graphs: common.adjacencyGraphs,
      dictionary: { ...common.dictionary, ...es.dictionary },
    });
    ready.set(true);
  })();
  return loading;
}

export interface Strength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  warning: string;
  suggestions: string[];
  crackTime: string;
}

const LABELS = ['Muy débil', 'Débil', 'Regular', 'Buena', 'Excelente'];

function rough(password: string): Strength['score'] {
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-z0-9]/i].filter((r) => r.test(password)).length;
  const bits = password.length * Math.log2([0, 26, 52, 62, 94][classes] || 26);
  return bits < 28 ? 0 : bits < 36 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
}

export function strength(password: string, userInputs: string[] = []): Strength {
  const loaded = ready();
  if (!password) return { score: 0, label: '—', warning: '', suggestions: [], crackTime: '' };
  if (!loaded || !factory) {
    void ensureStrength();
    const score = rough(password);
    return { score, label: LABELS[score], warning: '', suggestions: [], crackTime: '' };
  }
  const r = factory.check(password.slice(0, 100), userInputs.filter(Boolean));
  return {
    score: r.score,
    label: LABELS[r.score],
    warning: r.feedback.warning ?? '',
    suggestions: r.feedback.suggestions,
    crackTime: String(r.crackTimes.offlineSlowHashingXPerSecond.display ?? ''),
  };
}
