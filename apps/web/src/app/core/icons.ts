import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { baseDomain, fold, hostOf, iconDomain, type Entry } from '@keyme/models';
import { Api } from './api';
import { Brands, type Brand } from './brands';
import { CryptoClient } from './crypto.client';
import { db } from './db';
import { VaultStore } from './vault.store';

/** Ícono del sitio descargado por nuestra API. `touch` = cuadrado a sangre (apple-touch-icon). */
export interface Favicon {
  src: string;
  touch: boolean;
  /** Raster chico (menos de 96 px): se dibuja más pequeño para que no se vea borroso. */
  small: boolean;
}

interface CachedFavicon {
  /** data URL; vacío = el sitio no tiene ícono descargable. */
  u: string;
  t: 0 | 1;
  /** Lado en px (0 = SVG). */
  s: number;
  at: number;
}

interface CatalogItem {
  s: string;
  t: string;
  h: string;
  d?: string;
  a?: string[];
}

interface IconCache {
  v?: number;
  favicons: Record<string, CachedFavicon>;
  /** Trazos del catálogo completo de simple-icons ya descargados. */
  logos: Record<string, string>;
}

const CACHE_ID = 'icon-cache';
const CATALOG_KEY = 'brandCatalog';
const DAY = 86_400_000;
/** Un sitio sin ícono se vuelve a intentar después de esto (o con el botón). */
const RETRY_MISS = 7 * DAY;
const CATALOG_TTL = 30 * DAY;
const BATCH = 6;
const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
/** Sube cuando cambian las reglas para elegir íconos: el caché viejo se descarta. */
const CACHE_VERSION = 4;

const compact = (s: string) => fold(s).replace(/[^a-z0-9]/g, '');

/**
 * Íconos para lo que no tiene logo empaquetado en la app (ese siempre gana):
 *
 * 1. Catálogo completo de simple-icons (~3,500 logos) servido por nuestro
 *    servidor: se busca por coincidencia de dominio o nombre y solo se bajan
 *    los logos usados.
 * 2. Ícono oficial del sitio, descargado por nuestro servidor (el navegador
 *    nunca habla con los sitios del vault), solo si ningún catálogo lo tiene
 *    (BBVA, Disney+, Banamex…). El servidor descarta los de 16 px.
 *
 * Lo descargado se guarda cifrado con la llave del vault (dice qué sitios
 * tienes) y se refresca al desbloquear y cada vez que vuelve la conexión con
 * el servidor. Sin conexión se usa lo guardado o el monograma.
 */
@Injectable({ providedIn: 'root' })
export class Icons {
  private api = inject(Api);
  private brands = inject(Brands);
  private crypto = inject(CryptoClient);
  private store = inject(VaultStore);

  private readonly cache = signal<IconCache>({ favicons: {}, logos: {} });
  private readonly catalog = signal<CatalogItem[] | null>(null);
  readonly busy = signal(false);

  private loaded = false;
  private running: Promise<RefreshResult> | null = null;

  private readonly catalogIndex = computed(() => {
    const items = this.catalog();
    const bySlug = new Map<string, CatalogItem>();
    const byName = new Map<string, CatalogItem>();
    const byDomain = new Map<string, CatalogItem>();
    for (const it of items ?? []) {
      bySlug.set(it.s, it);
      byName.set(compact(it.t), it);
      for (const a of it.a ?? []) if (!byName.has(compact(a))) byName.set(compact(a), it);
      if (it.d && !byDomain.has(it.d)) byDomain.set(it.d, it);
    }
    return { bySlug, byName, byDomain };
  });

  constructor() {
    // Al desbloquear: cargar lo guardado. Cada sync correcta = hay servidor: completar lo que falte.
    effect(() => {
      const unlocked = this.store.state() === 'unlocked';
      const synced = this.store.lastSyncAt();
      untracked(() => {
        if (!unlocked) return this.reset();
        void this.load().then(() => synced && this.refresh());
      });
    });
  }

  /** Favicon del elemento, si ya se descargó. */
  faviconFor(e: Entry, override?: Brand | null): Favicon | null {
    const d = this.domainFor(e, override);
    const f = d ? this.cache().favicons[d] : undefined;
    return f?.u ? { src: f.u, touch: !!f.t, small: f.s > 0 && f.s < 96 } : null;
  }

  /** Logo del catálogo completo (cuando la app no trae uno). */
  logoFor(e: Entry): Brand | null {
    const it = this.catalogMatch(e);
    const p = it ? this.cache().logos[it.s] : undefined;
    return it && p ? { key: it.s, title: it.t, hex: it.h, path: p, domain: it.d ?? '' } : null;
  }

  /** Dominio del que se pide el favicon. */
  domainFor(e: Entry, override?: Brand | null): string | null {
    const brand = override !== undefined ? override : this.brands.forEntry(e);
    if (e.kind === 'login') {
      // La URL guardada gana (accounts.google.com → google.com); sin URL, la de la marca.
      return iconDomain(e) ?? (brand?.domain || this.catalogMatch(e)?.d) ?? null;
    }
    if (e.kind === 'card' || e.kind === 'note') return brand?.domain || (e.kind === 'card' ? this.catalogMatch(e)?.d ?? null : null);
    return null;
  }

  /**
   * Coincidencia exacta en el catálogo completo. Conservador a propósito: un
   * logo equivocado se ve peor que el ícono oficial o el monograma.
   */
  private catalogMatch(e: Entry): CatalogItem | null {
    if (!this.catalog() || (e.kind !== 'login' && e.kind !== 'card')) return null;
    const { bySlug, byName, byDomain } = this.catalogIndex();
    const byKey = (k: string) => (k.length > 2 ? byName.get(k) ?? bySlug.get(k) : undefined);
    // Marca conocida sin logo (Banamex, BBVA…): solo vale su propio nombre.
    const known = this.brands.forEntry(e);
    if (known) return byKey(compact(known.title)) ?? bySlug.get(known.key) ?? null;
    if (e.kind === 'login' && e.urls.some((u) => hostOf(u.value))) {
      for (const u of e.urls) {
        const h = hostOf(u.value);
        if (!h || /^\d+(\.\d+){3}$/.test(h)) continue;
        const base = baseDomain(h);
        const hit = byDomain.get(base) ?? byKey(compact(base.split('.')[0]));
        if (hit) return hit;
      }
      return null; // Con URL manda el dominio; el título puede ser cualquier cosa.
    }
    // Sin URL (o tarjeta): el nombre completo o lo que va antes de "·", "(" o "-".
    const name = e.kind === 'card' ? e.bank || e.title : e.title;
    const n = fold(name ?? '').trim();
    if (!n) return null;
    const head = n.split(/\s+[·|(–—-]\s*|\s*\(/)[0].trim();
    return byKey(compact(n)) ?? byKey(compact(head)) ?? null;
  }

  /**
   * Descarga lo que falte. `force` reintenta también los sitios que antes no
   * tenían ícono y vuelve a bajar el catálogo.
   */
  refresh(force = false): Promise<RefreshResult> {
    if (this.running) return this.running;
    this.running = this.doRefresh(force).finally(() => {
      this.running = null;
      this.busy.set(false);
    });
    return this.running;
  }

  private async doRefresh(force: boolean): Promise<RefreshResult> {
    const result: RefreshResult = { favicons: 0, logos: 0, failed: 0 };
    if (this.store.state() !== 'unlocked') return result;
    this.busy.set(true);
    await this.load();
    await this.loadCatalog(force);

    const now = Date.now();
    // Lo que trae logo empaquetado no necesita nada más: ese logo siempre gana.
    const needy = this.store.entries().filter((e) => !this.brands.forEntry(e)?.path);

    // 1. Logos del catálogo completo de simple-icons.
    const slugs = new Set<string>();
    for (const e of needy) {
      const it = this.catalogMatch(e);
      if (it) slugs.add(it.s);
    }
    const logos: Record<string, string> = {};
    for (const s of slugs) {
      if (this.cache().logos[s]) continue;
      try {
        const res = await fetch(`/brands/icons/${encodeURIComponent(s)}.svg`, { cache: 'force-cache' });
        const p = res.ok ? /\bd="([^"]+)"/.exec(await res.text())?.[1] : null;
        if (p) logos[s] = p;
      } catch {
        result.failed++;
      }
    }
    result.logos = Object.keys(logos).length;
    this.patch({ logos });

    // 2. Ícono oficial del sitio: para lo que no está en ningún catálogo o
    //    para lo que se fijó a mano en "sitio". Con `force` se vuelven a bajar
    //    todos (corrige íconos viejos o malos).
    const wanted = new Set<string>();
    for (const e of this.store.entries()) {
      const auto = !e.iconStyle && !this.brands.forEntry(e)?.path && !this.logoFor(e);
      if (e.iconStyle !== 'site' && !auto) continue;
      const d = this.domainFor(e)?.toLowerCase();
      if (d && DOMAIN_RE.test(d)) wanted.add(d);
    }
    const list = [...wanted].filter((d) => {
      const c = this.cache().favicons[d];
      return force || !c || (!c.u && now - c.at > RETRY_MISS);
    });
    for (let i = 0; i < list.length; i += BATCH) {
      const chunk = list.slice(i, i + BATCH);
      let icons: Record<string, { mime: string; data: string; kind: string; size: number } | null>;
      try {
        icons = (await this.api.favicons(chunk)).icons;
      } catch {
        result.failed += list.length - i;
        break; // Sin servidor: se reintenta en la próxima sync.
      }
      const favicons: Record<string, CachedFavicon> = {};
      for (const d of chunk) {
        if (!(d in icons)) continue; // El servidor no alcanzó a revisarlo.
        const ic = icons[d];
        const before = this.cache().favicons[d]?.u;
        favicons[d] = ic
          ? { u: `data:${ic.mime};base64,${ic.data}`, t: ic.kind === 'touch' ? 1 : 0, s: ic.size, at: now }
          : { u: '', t: 0, s: 0, at: now };
        if (favicons[d].u && favicons[d].u !== before) result.favicons++;
      }
      this.patch({ favicons });
    }

    // 3. Fuera lo que ya no se usa (cuentas borradas o que ahora usan otro ícono).
    const c = this.cache();
    const keep = <T>(rec: Record<string, T>, ok: Set<string>) => Object.fromEntries(Object.entries(rec).filter(([k]) => ok.has(k)));
    const pruned = { favicons: keep(c.favicons, wanted), logos: keep(c.logos, slugs) };
    const changed = list.length || result.logos || Object.keys(pruned.favicons).length !== Object.keys(c.favicons).length || Object.keys(pruned.logos).length !== Object.keys(c.logos).length;
    this.cache.set(pruned);
    if (changed) await this.persist();
    return result;
  }

  /**
   * Para el selector de ícono: baja el ícono oficial de esta cuenta si aún no
   * está, aunque tenga logo de librería. false = el sitio no tiene uno usable.
   */
  async ensureSite(e: Entry): Promise<boolean> {
    if (this.faviconFor(e)) return true;
    const d = this.domainFor(e)?.toLowerCase();
    if (!d || !DOMAIN_RE.test(d) || this.store.state() !== 'unlocked') return false;
    const c = this.cache().favicons[d];
    if (c && !c.u && Date.now() - c.at < RETRY_MISS) return false;
    await this.load();
    const ic = (await this.api.favicons([d])).icons[d];
    if (ic === undefined) return false;
    const f: CachedFavicon = ic
      ? { u: `data:${ic.mime};base64,${ic.data}`, t: ic.kind === 'touch' ? 1 : 0, s: ic.size, at: Date.now() }
      : { u: '', t: 0, s: 0, at: Date.now() };
    this.patch({ favicons: { [d]: f } });
    await this.persist();
    return !!f.u;
  }

  /** Para el selector de ícono: ¿hay logo de librería para esta cuenta? */
  hasLibrary(e: Entry): boolean {
    return !!this.brands.forEntry(e)?.path || !!this.logoFor(e);
  }

  private patch(p: Partial<IconCache>): void {
    this.cache.update((c) => ({ favicons: { ...c.favicons, ...p.favicons }, logos: { ...c.logos, ...p.logos } }));
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const blob = await db.getMeta<string>(CACHE_ID);
    if (blob) {
      const [r] = await this.crypto.decryptMany([{ id: CACHE_ID, blob }]);
      // Tras rotar la Vault Key el caché viejo no abre: se descarta y se vuelve a bajar.
      const c = r?.payload as IconCache | undefined;
      if (c && c.v === CACHE_VERSION) this.patch(c);
    }
    const cat = await db.getMeta<{ at: number; items: CatalogItem[] }>(CATALOG_KEY);
    if (cat) this.catalog.set(cat.items);
  }

  private async loadCatalog(force: boolean): Promise<void> {
    const cat = await db.getMeta<{ at: number; items: CatalogItem[] }>(CATALOG_KEY);
    if (cat && !force && Date.now() - cat.at < CATALOG_TTL) return;
    try {
      const res = await fetch('/brands/index.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const items = (await res.json()) as CatalogItem[];
      this.catalog.set(items);
      await db.setMeta(CATALOG_KEY, { at: Date.now(), items });
    } catch {
      // Sin conexión: se queda el que había.
    }
  }

  private async persist(): Promise<void> {
    if (this.store.state() !== 'unlocked') return;
    await db.setMeta(CACHE_ID, await this.crypto.encrypt(CACHE_ID, { ...this.cache(), v: CACHE_VERSION }));
  }

  private reset(): void {
    this.loaded = false;
    this.cache.set({ favicons: {}, logos: {} });
  }
}

export interface RefreshResult {
  favicons: number;
  logos: number;
  failed: number;
}
