import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { accountLabel, expiringSoon, subtitle, type Entry, type EntryKind } from '@keyme/models';
import { Clipboard } from '../../core/clipboard.service';
import { UiState, type Filter, type ServiceGroup, type Sort } from '../../core/ui-state';
import { VaultStore } from '../../core/vault.store';
import { Avatar } from '../../ui/avatar';
import { Icon } from '../../ui/icon';

interface Section {
  key: string;
  label: string;
  entries: Entry[];
}

/** Distancia (px) que hay que deslizar una fila para copiar. */
const SWIPE = 84;

@Component({
  selector: 'km-entry-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar, Icon, NgTemplateOutlet],
  templateUrl: './entry-list.html',
  styleUrl: './entry-list.scss',
})
export class EntryList {
  protected store = inject(VaultStore);
  protected ui = inject(UiState);
  private router = inject(Router);
  private clipboard = inject(Clipboard);

  private url = toSignal(
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map((e) => (e as NavigationEnd).urlAfterRedirects)),
    { initialValue: this.router.url },
  );
  protected readonly selected = computed(() => /^\/item\/([^/?]+)/.exec(this.url())?.[1] ?? null);
  /** Último elemento abierto: su ícono viaja de vuelta a la lista en móvil. */
  protected readonly lastOpened = signal<string | null>(null);
  protected readonly expiring = computed(() => expiringSoon(this.store.entries(), 30));
  protected readonly sortOpen = signal(false);
  protected readonly scrolled = signal(false);
  /** Fila con feedback de "copiado" (id:campo). */
  protected readonly flash = signal<string | null>(null);

  protected readonly sorts: { id: Sort; label: string; icon: string }[] = [
    { id: 'recent', label: 'Recientes', icon: 'clock' },
    { id: 'used', label: 'Más usados', icon: 'zap' },
    { id: 'az', label: 'A–Z', icon: 'hash' },
  ];
  protected readonly sortLabel = computed(() => this.sorts.find((s) => s.id === this.ui.sort())?.label ?? '');

  private readonly kinds: EntryKind[] = ['login', 'card', 'note', 'document', 'identity', 'wifi'];
  private readonly kindLabels: Record<EntryKind, string> = {
    login: 'Logins', card: 'Tarjetas', document: 'Documentos', identity: 'Identidades', note: 'Notas', wifi: 'Wi-Fi',
  };

  /** Chips de filtro: todo, favoritos, espacios, tipos y etiquetas. */
  protected readonly chips = computed(() => {
    const c = this.ui.counts();
    const out: { f: Filter; label: string; icon?: string; color?: string; n: number }[] = [
      { f: { type: 'all' }, label: 'Todo', n: c.all },
    ];
    if (c.fav) out.push({ f: { type: 'fav' }, label: 'Favoritos', icon: 'star', n: c.fav });
    for (const s of this.store.spaces()) if (c.spaces[s.id]) out.push({ f: { type: 'space', id: s.id }, label: s.name, color: s.color, n: c.spaces[s.id] });
    if (this.ui.people().length) {
      out.push({ f: { type: 'person', id: null }, label: 'Mías', icon: 'identity', n: c.mine });
      for (const p of this.ui.people()) if (c.people[p.id]) out.push({ f: { type: 'person', id: p.id }, label: p.name, icon: 'users', color: p.color, n: c.people[p.id] });
    }
    for (const k of this.kinds) if (c.kinds[k]) out.push({ f: { type: 'kind', kind: k }, label: this.kindLabels[k], icon: k, n: c.kinds[k] });
    for (const [t, n] of this.ui.topTags()) out.push({ f: { type: 'tag', tag: t }, label: `#${t}`, n });
    return out;
  });

  /** Accesos directos arriba de la lista: favoritos (o los más usados). */
  protected readonly quick = computed(() => {
    if (this.ui.filter().type !== 'all' || this.ui.query().trim()) return [];
    const favs = this.store.entries().filter((e) => e.favorite);
    const list = favs.length >= 3 ? favs : [...this.store.entries()].filter((e) => (e.usage?.count ?? 0) > 0);
    return list.sort((a, b) => (b.usage?.count ?? 0) - (a.usage?.count ?? 0)).slice(0, 10);
  });
  protected readonly quickLabel = computed(() => (this.store.entries().filter((e) => e.favorite).length >= 3 ? 'Favoritos' : 'Lo que más usas'));

  /** En orden A–Z la lista se parte por letra, como una agenda. */
  protected readonly sections = computed<Section[]>(() => {
    const list = this.ui.filtered();
    if (this.ui.sort() !== 'az' || this.ui.query().trim()) return [{ key: '', label: '', entries: list }];
    const out: Section[] = [];
    for (const e of list) {
      const ch = (e.title || '#').trim().charAt(0).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
      const key = /[A-ZÑ]/.test(ch) ? ch : '#';
      const last = out[out.length - 1];
      if (last?.key === key) last.entries.push(e);
      else out.push({ key, label: key, entries: [e] });
    }
    return out;
  });

  protected isActive(f: Filter): boolean {
    return JSON.stringify(f) === JSON.stringify(this.ui.filter());
  }

  protected pick(f: Filter, ev?: Event): void {
    this.ui.filter.set(f);
    (ev?.currentTarget as HTMLElement | undefined)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }

  // ----- Multicuenta: grupos por servicio y personas --------------------------

  /** Grupos abiertos (por llave de servicio). Solo en memoria. */
  private readonly opened = signal<ReadonlySet<string>>(new Set());

  /** Un grupo está abierto si lo abriste o si contiene el elemento seleccionado. */
  protected isOpen(g: ServiceGroup): boolean {
    return this.opened().has(g.key) || g.entries.some((e) => e.id === this.selected());
  }

  protected toggle(g: ServiceGroup): void {
    const next = new Set(this.opened());
    if (!next.delete(g.key)) next.add(g.key);
    this.opened.set(next);
  }

  /** Lo que se ve, en orden: para moverse con las flechas. */
  private readonly visible = computed<Entry[]>(() => {
    const groups = this.ui.groups();
    if (!groups) return this.ui.filtered();
    return groups.flatMap((g) => (g.entries.length === 1 || this.isOpen(g) ? g.entries : []));
  });

  /** Dentro de un grupo se muestra lo que distingue a cada cuenta. */
  protected groupSub(e: Entry): string {
    if (e.kind === 'login' && e.signInWith && !e.password) return this.sub(e);
    return accountLabel(e);
  }

  protected kindsOf(g: ServiceGroup): string {
    const n = g.entries.length;
    return g.entries.every((e) => e.kind === 'login') ? `${n} cuentas` : `${n} elementos`;
  }

  /** "de Abuelita" si en el grupo hay cuentas de otras personas. */
  protected ownersOf(g: ServiceGroup): string {
    const names = [...new Set(g.entries.map((e) => this.ownerName(e)).filter(Boolean))];
    return names.length ? `de ${names.join(', ')}` : '';
  }

  protected ownerName(e: Entry): string {
    return e.ownerId ? this.ui.personById().get(e.ownerId)?.name ?? '' : '';
  }

  protected ownerColor(e: Entry): string | null {
    return e.ownerId ? this.ui.personById().get(e.ownerId)?.color ?? null : null;
  }

  /** Subtítulo de la fila; un login vinculado muestra con qué cuenta se entra. */
  protected sub(e: Entry): string {
    if (e.kind === 'login' && e.signInWith && !e.password) {
      const p = this.store.get(e.signInWith);
      if (p && p.kind === 'login') return `con ${p.title}`;
    }
    return subtitle(e);
  }

  protected open(e: Entry): void {
    if (this.swiped) return;
    this.lastOpened.set(e.id);
    void this.router.navigate(['/item', e.id]);
  }

  protected secretOf(e: Entry): string {
    return e.kind === 'login' || e.kind === 'wifi' ? e.password : e.kind === 'card' ? e.number : e.kind === 'document' ? e.number : '';
  }

  protected userOf(e: Entry): string {
    return e.kind === 'login' ? e.username : e.kind === 'wifi' ? e.ssid : '';
  }

  /** Copia rápida sin abrir la ficha. */
  protected copy(ev: Event | null, e: Entry, what: 'secret' | 'user'): void {
    ev?.stopPropagation();
    const value = what === 'secret' ? this.secretOf(e) : this.userOf(e);
    if (!value) return;
    const label = what === 'user'
      ? e.kind === 'wifi' ? 'Red copiada' : 'Usuario copiado'
      : e.kind === 'card' || e.kind === 'document' ? 'Número copiado' : 'Contraseña copiada';
    void this.clipboard.copy(value, label, what === 'secret');
    if (what === 'secret') void this.store.markUsed(e);
    this.flash.set(`${e.id}:${what}`);
    setTimeout(() => this.flash() === `${e.id}:${what}` && this.flash.set(null), 1400);
    navigator.vibrate?.(12);
  }

  // ----- Deslizar para copiar (pantallas táctiles) -------------------------

  protected readonly drag = signal<{ id: string; dx: number } | null>(null);
  private start: { id: string; x: number; y: number; locked: boolean | null } | null = null;
  private swiped = false;

  protected down(ev: PointerEvent, e: Entry): void {
    if (ev.pointerType === 'mouse') return;
    this.start = { id: e.id, x: ev.clientX, y: ev.clientY, locked: null };
    this.swiped = false;
  }

  protected moveRow(ev: PointerEvent, e: Entry): void {
    const s = this.start;
    if (!s || s.id !== e.id) return;
    const dx = ev.clientX - s.x;
    const dy = ev.clientY - s.y;
    if (s.locked === null && Math.hypot(dx, dy) > 8) s.locked = Math.abs(dx) > Math.abs(dy) * 1.3;
    if (!s.locked) return;
    const canRight = !!this.secretOf(e);
    const canLeft = !!this.userOf(e);
    let x = (dx > 0 && !canRight) || (dx < 0 && !canLeft) ? dx * 0.15 : dx;
    if (Math.abs(x) > SWIPE) x = Math.sign(x) * (SWIPE + (Math.abs(x) - SWIPE) * 0.3);
    const crossed = Math.abs(this.drag()?.dx ?? 0) < SWIPE && Math.abs(x) >= SWIPE;
    if (crossed) navigator.vibrate?.(8);
    this.drag.set({ id: e.id, dx: x });
  }

  protected up(e: Entry): void {
    const d = this.drag();
    this.start = null;
    if (!d || d.id !== e.id) return;
    this.swiped = Math.abs(d.dx) > 8;
    if (d.dx >= SWIPE && this.secretOf(e)) this.copy(null, e, 'secret');
    else if (d.dx <= -SWIPE && this.userOf(e)) this.copy(null, e, 'user');
    this.drag.set(null);
    setTimeout(() => (this.swiped = false), 50);
  }

  protected dx(e: Entry): number {
    const d = this.drag();
    return d && d.id === e.id ? d.dx : 0;
  }

  protected readonly swipeAt = SWIPE;

  // ----- Teclado ------------------------------------------------------------

  protected onKey(ev: KeyboardEvent): void {
    const list = this.visible();
    if (!list.length) return;
    const idx = list.findIndex((e) => e.id === this.selected());
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const next = ev.key === 'ArrowDown' ? Math.min(list.length - 1, idx + 1) : Math.max(0, idx - 1);
      this.open(list[next]);
      queueMicrotask(() => document.querySelector(`[data-id="${list[next].id}"]`)?.scrollIntoView({ block: 'nearest' }));
    } else if (ev.key === 'Enter' && idx < 0) {
      this.open(list[0]);
    }
  }

  protected onScroll(ev: Event): void {
    this.scrolled.set((ev.target as HTMLElement).scrollTop > 8);
  }

  protected spaceColor(e: Entry): string | null {
    return e.spaceId ? this.ui.spaceById().get(e.spaceId)?.color ?? null : null;
  }

  protected spaceName(e: Entry): string {
    return e.spaceId ? this.ui.spaceById().get(e.spaceId)?.name ?? '' : '';
  }

  protected goImport(): void {
    void this.router.navigate(['/settings'], { fragment: 'import' });
  }

  protected setSort(s: Sort): void {
    this.ui.setSort(s);
    this.sortOpen.set(false);
  }
}
