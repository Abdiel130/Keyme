import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { baseDomain, hostOf, type Entry } from '@keyme/models';
import { Api, type BreachedSite } from './api';
import { Brands } from './brands';
import { CryptoClient } from './crypto.client';
import { db } from './db';
import { checkPwned, passwordOf, sha1Hex } from './health';
import { VaultStore } from './vault.store';

interface BreachCache {
  v: number;
  checkedAt: string;
  /** id del elemento → veces filtrada y SHA-1 de la contraseña revisada. */
  results: Record<string, { c: number; h: string }>;
}

const CACHE_ID = 'breach-cache';
const SITES_KEY = 'hibpSites';
const SITES_TTL = 7 * 86_400_000;

/**
 * Resultado de la revisión de filtraciones, guardado en el dispositivo cifrado
 * con la llave del vault (dice qué contraseñas están expuestas). Un resultado
 * vale mientras la contraseña siga siendo la misma: al cambiarla desaparece.
 *
 * También guarda la lista pública de sitios con filtraciones de HIBP para
 * decir si el sitio de cada cuenta sufrió una (se busca aquí, sin enviar
 * dominios a nadie).
 */
@Injectable({ providedIn: 'root' })
export class Breaches {
  private api = inject(Api);
  private brands = inject(Brands);
  private crypto = inject(CryptoClient);
  private store = inject(VaultStore);

  private readonly results = signal<BreachCache['results']>({});
  readonly checkedAt = signal<Date | null>(null);
  readonly checking = signal(false);
  readonly progress = signal('');
  private readonly sites = signal<BreachedSite[]>([]);
  /** SHA-1 de la contraseña actual de cada elemento. */
  private readonly hashes = signal<ReadonlyMap<string, string>>(new Map());
  private loaded = false;

  /** id → veces que aparece en filtraciones (solo si la contraseña no ha cambiado). */
  readonly pwned = computed(() => {
    const out = new Map<string, number>();
    const hashes = this.hashes();
    for (const [id, r] of Object.entries(this.results())) if (hashes.get(id) === r.h) out.set(id, r.c);
    return out;
  });

  private readonly sitesByDomain = computed(() => {
    const m = new Map<string, BreachedSite[]>();
    for (const s of this.sites()) m.set(s.domain, [...(m.get(s.domain) ?? []), s]);
    return m;
  });

  constructor() {
    effect(() => {
      const unlocked = this.store.state() === 'unlocked';
      const entries = this.store.entries();
      untracked(() => {
        if (!unlocked) return this.reset();
        void this.load();
        void this.hashAll(entries);
      });
    });
  }

  /** Filtraciones conocidas del sitio de esta cuenta, de la más reciente a la más vieja. */
  sitesFor(e: Entry): BreachedSite[] {
    const domains = new Set<string>();
    if (e.kind === 'login') for (const u of e.urls) if (hostOf(u.value)) domains.add(baseDomain(hostOf(u.value)));
    const b = this.brands.forEntry(e);
    if (b?.domain) domains.add(baseDomain(b.domain));
    const map = this.sitesByDomain();
    return [...domains].flatMap((d) => map.get(d) ?? []).sort((a, b) => b.date.localeCompare(a.date));
  }

  async check(): Promise<number> {
    this.checking.set(true);
    try {
      void this.loadSites(false);
      const res = await checkPwned(
        this.store.entries(),
        async (prefixes) => (await this.api.breachRanges(prefixes)).ranges,
        (d, t) => this.progress.set(`${d}/${t}`),
      );
      const results: BreachCache['results'] = {};
      for (const [id, r] of res) results[id] = { c: r.count, h: r.hash };
      this.results.set(results);
      this.checkedAt.set(new Date());
      await this.hashAll(this.store.entries());
      await this.persist();
      return res.size;
    } finally {
      this.checking.set(false);
      this.progress.set('');
    }
  }

  /** Lista de sitios con filtraciones; se baja de nuestra API cada semana. */
  async loadSites(force: boolean): Promise<void> {
    const cached = await db.getMeta<{ at: number; sites: BreachedSite[] }>(SITES_KEY);
    if (cached && !this.sites().length) this.sites.set(cached.sites);
    if (cached && !force && Date.now() - cached.at < SITES_TTL) return;
    try {
      const { sites } = await this.api.breachedSites();
      this.sites.set(sites);
      await db.setMeta(SITES_KEY, { at: Date.now(), sites });
    } catch {
      // Sin conexión: se queda la lista guardada.
    }
  }

  private async hashAll(entries: Entry[]): Promise<void> {
    const prev = this.hashes();
    const next = new Map<string, string>();
    const seen = new Map<string, string>();
    for (const e of entries) {
      const p = passwordOf(e);
      if (!p) continue;
      next.set(e.id, seen.get(p) ?? (await sha1Hex(p)));
      seen.set(p, next.get(e.id)!);
    }
    if (next.size !== prev.size || [...next].some(([k, v]) => prev.get(k) !== v)) this.hashes.set(next);
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    void this.loadSites(false);
    const blob = await db.getMeta<string>(CACHE_ID);
    if (!blob) return;
    const [r] = await this.crypto.decryptMany([{ id: CACHE_ID, blob }]);
    const c = r?.payload as BreachCache | undefined;
    if (c?.v === 1) {
      this.results.set(c.results);
      this.checkedAt.set(new Date(c.checkedAt));
    }
  }

  private async persist(): Promise<void> {
    if (this.store.state() !== 'unlocked' || !this.checkedAt()) return;
    const c: BreachCache = { v: 1, checkedAt: this.checkedAt()!.toISOString(), results: this.results() };
    await db.setMeta(CACHE_ID, await this.crypto.encrypt(CACHE_ID, c));
  }

  private reset(): void {
    this.loaded = false;
    this.results.set({});
    this.checkedAt.set(null);
    this.hashes.set(new Map());
  }
}

/** Nombres en español de los datos que expone HIBP. */
const DATA_CLASSES: Record<string, string> = {
  'Email addresses': 'Correos', Passwords: 'Contraseñas', 'Password hints': 'Pistas de contraseña', Usernames: 'Usuarios',
  Names: 'Nombres', 'Phone numbers': 'Teléfonos', 'IP addresses': 'Direcciones IP', 'Dates of birth': 'Fechas de nacimiento',
  'Physical addresses': 'Domicilios', Genders: 'Género', 'Geographic locations': 'Ubicaciones', 'Credit cards': 'Tarjetas de crédito',
  'Partial credit card data': 'Datos parciales de tarjeta', 'Security questions and answers': 'Preguntas de seguridad',
  'Job titles': 'Puestos', Employers: 'Empleadores', 'Social media profiles': 'Perfiles sociales', 'Private messages': 'Mensajes privados',
  'Purchases': 'Compras', 'Bank account numbers': 'Cuentas bancarias', 'Government issued IDs': 'Identificaciones oficiales',
  'Auth tokens': 'Tokens de sesión', 'Device information': 'Datos del dispositivo', 'Browser user agent details': 'Datos del navegador',
  'Spoken languages': 'Idiomas', 'Website activity': 'Actividad en el sitio', 'Avatars': 'Fotos de perfil', 'Credit status information': 'Historial crediticio',
  'Income levels': 'Ingresos', 'Marital statuses': 'Estado civil', 'Payment histories': 'Historial de pagos', 'Passport numbers': 'Pasaportes',
};

export function dataClassEs(c: string): string {
  return DATA_CLASSES[c] ?? c;
}
