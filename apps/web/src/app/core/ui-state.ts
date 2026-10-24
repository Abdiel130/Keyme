import { Injectable, computed, inject, signal } from '@angular/core';
import { KIND_LABELS, fuzzyScore, searchText, type Entry, type EntryKind } from '@keyme/models';
import { VaultStore } from './vault.store';

export type Filter =
  | { type: 'all' }
  | { type: 'fav' }
  | { type: 'kind'; kind: EntryKind }
  | { type: 'space'; id: string | null }
  | { type: 'tag'; tag: string }
  | { type: 'linked'; id: string };

export type Sort = 'recent' | 'az' | 'used';

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
  readonly paletteOpen = signal(false);
  readonly newMenuOpen = signal(false);
  readonly railOpen = signal(false);

  setSort(s: Sort): void {
    this.sort.set(s);
    try {
      localStorage.setItem('km.sort', JSON.stringify(s));
    } catch {
      /* almacenamiento bloqueado: solo se pierde la preferencia */
    }
  }

  readonly spaceById = computed(() => new Map(this.store.spaces().map((s) => [s.id, s])));

  readonly filterTitle = computed(() => {
    const f = this.filter();
    switch (f.type) {
      case 'all': return 'Todo el vault';
      case 'fav': return 'Favoritos';
      case 'kind': return { login: 'Logins', card: 'Tarjetas', document: 'Documentos', identity: 'Identidades', note: 'Notas seguras', wifi: 'Redes Wi-Fi' }[f.kind] ?? KIND_LABELS[f.kind];
      case 'space': return f.id ? this.spaceById().get(f.id)?.name ?? 'Espacio' : 'Sin espacio';
      case 'tag': return `#${f.tag}`;
      case 'linked': return 'Servicios vinculados';
    }
  });

  readonly filtered = computed<Entry[]>(() => {
    const f = this.filter();
    const spaces = this.spaceById();
    let list = this.store.entries();
    switch (f.type) {
      case 'fav': list = list.filter((e) => e.favorite); break;
      case 'kind': list = list.filter((e) => e.kind === f.kind); break;
      case 'space': list = list.filter((e) => (f.id ? e.spaceId === f.id : !e.spaceId || !spaces.has(e.spaceId))); break;
      case 'tag': list = list.filter((e) => e.tags.includes(f.tag)); break;
      case 'linked': list = list.filter((e) => e.kind === 'login' && e.signInWith === f.id); break;
    }
    const q = this.query().trim();
    if (q) {
      return list
        .map((e) => ({ e, s: fuzzyScore(q, searchText(e, spaces.get(e.spaceId ?? '')?.name)) + (e.favorite ? 2 : 0) }))
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

  readonly counts = computed(() => {
    const c = { all: 0, fav: 0, kinds: {} as Record<string, number>, spaces: {} as Record<string, number>, none: 0, tags: new Map<string, number>() };
    const spaces = this.spaceById();
    for (const e of this.store.entries()) {
      c.all++;
      if (e.favorite) c.fav++;
      c.kinds[e.kind] = (c.kinds[e.kind] ?? 0) + 1;
      if (e.spaceId && spaces.has(e.spaceId)) c.spaces[e.spaceId] = (c.spaces[e.spaceId] ?? 0) + 1;
      else c.none++;
      for (const t of e.tags) c.tags.set(t, (c.tags.get(t) ?? 0) + 1);
    }
    return c;
  });

  readonly topTags = computed(() => [...this.counts().tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
}
