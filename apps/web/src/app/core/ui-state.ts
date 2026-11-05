import { Injectable, computed, inject, signal } from '@angular/core';
import { KIND_LABELS, fuzzyScore, isEntry, searchText, serviceKey, serviceName, type Entry, type EntryKind } from '@keyme/models';
import { VaultStore } from './vault.store';

export type Filter =
  | { type: 'all' }
  | { type: 'fav' }
  | { type: 'kind'; kind: EntryKind }
  | { type: 'space'; id: string | null }
  | { type: 'tag'; tag: string }
  | { type: 'person'; id: string | null }
  | { type: 'linked'; id: string };

/** Varias cuentas del mismo servicio (Google ×3, BBVA: tarjeta + banca). */
export interface ServiceGroup {
  key: string;
  name: string;
  entries: Entry[];
}

export type Sort = 'recent' | 'az' | 'used';

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* almacenamiento bloqueado: solo se pierde la preferencia */
  }
}

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Estado de navegación del vault (filtro, búsqueda, orden). Nada sensible. */
@Injectable({ providedIn: 'root' })
export class UiState {
  private store = inject(VaultStore);

  readonly filter = signal<Filter>({ type: 'all' });
  readonly query = signal('');
  readonly sort = signal<Sort>(load('km.sort', 'recent'));
  /** En "Todo", agrupar las cuentas del mismo servicio. */
  readonly grouped = signal<boolean>(load('km.group', true));
  readonly paletteOpen = signal(false);
  readonly newMenuOpen = signal(false);
  readonly railOpen = signal(false);

  setSort(s: Sort): void {
    this.sort.set(s);
    save('km.sort', s);
  }

  setGrouped(on: boolean): void {
    this.grouped.set(on);
    save('km.group', on);
  }

  readonly spaceById = computed(() => new Map(this.store.spaces().map((s) => [s.id, s])));
  readonly people = computed(() => this.store.settings().people ?? []);
  readonly personById = computed(() => new Map(this.people().map((p) => [p.id, p])));

  readonly filterTitle = computed(() => {
    const f = this.filter();
    switch (f.type) {
      case 'all': return 'Todo el vault';
      case 'fav': return 'Favoritos';
      case 'kind': return { login: 'Logins', card: 'Tarjetas', document: 'Documentos', identity: 'Identidades', note: 'Notas seguras', wifi: 'Redes Wi-Fi' }[f.kind] ?? KIND_LABELS[f.kind];
      case 'space': return f.id ? this.spaceById().get(f.id)?.name ?? 'Espacio' : 'Sin espacio';
      case 'tag': return `#${f.tag}`;
      case 'person': return f.id ? this.personById().get(f.id)?.name ?? 'Persona' : 'Mías';
      case 'linked': return 'Servicios vinculados';
    }
  });

  readonly filtered = computed<Entry[]>(() => {
    const f = this.filter();
    const spaces = this.spaceById();
    const people = this.personById();
    let list = this.store.entries();
    switch (f.type) {
      case 'fav': list = list.filter((e) => e.favorite); break;
      case 'kind': list = list.filter((e) => e.kind === f.kind); break;
      case 'space': list = list.filter((e) => (f.id ? e.spaceId === f.id : !e.spaceId || !spaces.has(e.spaceId))); break;
      case 'tag': list = list.filter((e) => e.tags.includes(f.tag)); break;
      case 'person': list = list.filter((e) => (f.id ? e.ownerId === f.id : !e.ownerId || !people.has(e.ownerId))); break;
      case 'linked': list = list.filter((e) => e.kind === 'login' && e.signInWith === f.id); break;
    }
    const q = this.query().trim();
    if (q) {
      return list
        .map((e) => ({ e, s: fuzzyScore(q, searchText(e, spaces.get(e.spaceId ?? '')?.name, people.get(e.ownerId ?? '')?.name)) + (e.favorite ? 2 : 0) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.e);
    }
    const sort = this.sort();
    return [...list].sort((a, b) =>
      sort === 'az' ? a.title.localeCompare(b.title, 'es', { sensitivity: 'base' })
        : sort === 'used' ? (b.usage?.count ?? 0) - (a.usage?.count ?? 0) || b.modifiedAt.localeCompare(a.modifiedAt)
        : b.modifiedAt.localeCompare(a.modifiedAt),
    );
  });

  /**
   * Lista de "Todo" agrupada por servicio, en el orden de `filtered()` (cada
   * grupo aparece donde está su primer elemento). null = lista plana.
   */
  readonly groups = computed<ServiceGroup[] | null>(() => {
    if (this.filter().type !== 'all' || this.query().trim() || !this.grouped()) return null;
    const records = this.store.records();
    const get = (id: string) => {
      const r = records.get(id);
      return r && isEntry(r) ? r : undefined;
    };
    const byKey = new Map<string, Entry[]>();
    for (const e of this.filtered()) {
      const k = serviceKey(e, get);
      byKey.set(k, [...(byKey.get(k) ?? []), e]);
    }
    return [...byKey.entries()].map(([key, entries]) => ({ key, name: serviceName(entries), entries }));
  });

  readonly counts = computed(() => {
    const c = { all: 0, fav: 0, kinds: {} as Record<string, number>, spaces: {} as Record<string, number>, none: 0, tags: new Map<string, number>(), people: {} as Record<string, number>, mine: 0 };
    const spaces = this.spaceById();
    const people = this.personById();
    for (const e of this.store.entries()) {
      c.all++;
      if (e.favorite) c.fav++;
      c.kinds[e.kind] = (c.kinds[e.kind] ?? 0) + 1;
      if (e.spaceId && spaces.has(e.spaceId)) c.spaces[e.spaceId] = (c.spaces[e.spaceId] ?? 0) + 1;
      else c.none++;
      for (const t of e.tags) c.tags.set(t, (c.tags.get(t) ?? 0) + 1);
      if (e.ownerId && people.has(e.ownerId)) c.people[e.ownerId] = (c.people[e.ownerId] ?? 0) + 1;
      else c.mine++;
    }
    return c;
  });

  readonly topTags = computed(() => [...this.counts().tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
}
