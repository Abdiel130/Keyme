import { Injectable, computed, signal } from '@angular/core';
import { baseDomain, fold, hostOf, type Entry } from '@keyme/models';

export interface Brand {
  key: string;
  title: string;
  /** Color oficial sin '#'. */
  hex: string;
  /** Trazo SVG 24×24; vacío si solo conocemos el color. */
  path: string;
  /** Dominio principal (para llenar la URL al elegir la marca). */
  domain: string;
}

type Data = typeof import('../ui/brands.data');

/** Marcas que se ofrecen primero al crear un login. */
const POPULAR = [
  'google', 'microsoft', 'apple', 'netflix', 'spotify', 'amazon', 'facebook', 'instagram', 'whatsapp', 'x', 'tiktok', 'github',
  'mercadolibre', 'mercadopago', 'paypal', 'bbva', 'santander', 'nubank', 'banorte', 'banamex', 'disney', 'primevideo', 'hbo',
  'steam', 'playstation', 'discord', 'uber', 'didi', 'rappi', 'openai', 'claude', 'dropbox', 'notion', 'linkedin', 'telcel', 'cfe', 'sat',
];

/** Bancos para la tarjeta (los que tienen app o color conocido). */
const BANKS = ['bbva', 'santander', 'banorte', 'banamex', 'hsbc', 'nubank', 'mercadopago', 'scotiabank', 'inbursa', 'banregio', 'bancoazteca', 'stori', 'klar', 'hey', 'americanexpress', 'revolut', 'liverpool', 'oxxo'];

/**
 * Logos de marcas empaquetados con la app (ver scripts/brand-icons.mjs). Se
 * cargan aparte para no pesar en el arranque; mientras tanto se ven monogramas.
 */
@Injectable({ providedIn: 'root' })
export class Brands {
  private readonly data = signal<Data | null>(null);
  private readonly domainOf = computed(() => {
    const d = this.data();
    const out = new Map<string, string>();
    if (d) for (const [dom, key] of Object.entries(d.DOMAINS)) if (!out.has(key)) out.set(key, dom);
    return out;
  });

  constructor() {
    void import('../ui/brands.data').then((m) => this.data.set(m));
  }

  readonly ready = computed(() => !!this.data());

  get(key: string): Brand | null {
    const d = this.data();
    const b = d?.BRANDS[key];
    return b ? { key, title: b.t, hex: b.h, path: b.p, domain: this.domainOf().get(key) ?? '' } : null;
  }

  forHost(url: string): Brand | null {
    const d = this.data();
    const h = hostOf(url);
    if (!d || !h) return null;
    const key = d.DOMAINS[h] ?? d.DOMAINS[h.replace(/^www\./, '')] ?? d.DOMAINS[baseDomain(h)];
    return key ? this.get(key) : null;
  }

  forName(name: string): Brand | null {
    const d = this.data();
    if (!d || !name) return null;
    const n = fold(name);
    if (d.NAMES[n]) return this.get(d.NAMES[n]);
    // "Google · Escuela", "Netflix (familia)", "BBVA Azul" → primera parte.
    const head = n.split(/\s+[·|(–—-]\s*|\s*\(/)[0].trim();
    if (d.NAMES[head]) return this.get(d.NAMES[head]);
    const first = head.split(/\s+/)[0];
    return first.length > 1 && d.NAMES[first] ? this.get(d.NAMES[first]) : null;
  }

  forEntry(e: Entry): Brand | null {
    if (!this.data()) return null;
    switch (e.kind) {
      case 'login':
        for (const u of e.urls) {
          const b = this.forHost(u.value);
          if (b) return b;
        }
        return this.forName(e.title);
      case 'card':
        return this.forName(e.bank) ?? this.forName(e.title);
      case 'note':
        return this.forName(e.title);
      default:
        return null;
    }
  }

  /** Para el selector del editor: marcas que coinciden con lo escrito. */
  search(q: string, limit = 12): Brand[] {
    const d = this.data();
    if (!d) return [];
    const n = fold(q.trim());
    if (!n) return POPULAR.map((k) => this.get(k)).filter((b): b is Brand => !!b && !!b.domain).slice(0, limit);
    const seen = new Set<string>();
    const hits: { b: Brand; s: number }[] = [];
    for (const [name, key] of Object.entries(d.NAMES)) {
      if (seen.has(key)) continue;
      const i = name.indexOf(n);
      if (i < 0) continue;
      const b = this.get(key);
      if (!b?.domain) continue;
      seen.add(key);
      hits.push({ b, s: (i === 0 ? 0 : 10) + name.length - n.length + (POPULAR.includes(key) ? -3 : 0) });
    }
    return hits.sort((a, b) => a.s - b.s).slice(0, limit).map((x) => x.b);
  }

  banks(): Brand[] {
    return BANKS.map((k) => this.get(k)).filter((b): b is Brand => !!b);
  }
}

/** ¿Texto blanco o negro sobre este color? (luminancia relativa) */
export function inkFor(hex: string): '#fff' | '#111' {
  const n = parseInt(hex, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return l > 0.42 ? '#111' : '#fff';
}

/** Tono (0-360) de un color hex, para teñir tarjetas con el color del banco. */
export function hueOf(hex: string): number {
  const n = parseInt(hex, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (!d) return 30;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round((h * 60 + 360) % 360);
}
