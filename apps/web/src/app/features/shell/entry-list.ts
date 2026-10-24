import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { expiringSoon, subtitle, type Entry } from '@keyme/models';
import { Clipboard } from '../../core/clipboard.service';
import { UiState, type Sort } from '../../core/ui-state';
import { VaultStore } from '../../core/vault.store';
import { Avatar } from '../../ui/avatar';
import { Icon } from '../../ui/icon';

@Component({
  selector: 'km-entry-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar, Icon],
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
  protected readonly expiring = computed(() => expiringSoon(this.store.entries(), 30));
  protected readonly sorts: { id: Sort; label: string }[] = [
    { id: 'recent', label: 'Recientes' },
    { id: 'used', label: 'Más usados' },
    { id: 'az', label: 'A–Z' },
  ];
  /** Subtítulo de la fila; un login vinculado muestra con qué cuenta se entra. */
  protected sub(e: Entry): string {
    if (e.kind === 'login' && e.signInWith && !e.password) {
      const p = this.store.get(e.signInWith);
      if (p && p.kind === 'login') return `con ${p.title}`;
    }
    return subtitle(e);
  }

  protected open(e: Entry): void {
    void this.router.navigate(['/item', e.id]);
  }

  /** Copia rápida del dato más útil sin abrir la ficha. */
  protected quickCopy(ev: Event, e: Entry): void {
    ev.stopPropagation();
    const value = e.kind === 'login' || e.kind === 'wifi' ? e.password : e.kind === 'card' ? e.number : e.kind === 'document' ? e.number : '';
    if (!value) return;
    void this.clipboard.copy(value, e.kind === 'card' ? 'Número copiado' : e.kind === 'document' ? 'Número copiado' : 'Contraseña copiada');
    void this.store.markUsed(e);
  }

  protected onKey(ev: KeyboardEvent): void {
    const list = this.ui.filtered();
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

  protected spaceColor(e: Entry): string | null {
    return e.spaceId ? this.ui.spaceById().get(e.spaceId)?.color ?? null : null;
  }

  protected spaceName(e: Entry): string {
    return e.spaceId ? this.ui.spaceById().get(e.spaceId)?.name ?? '' : '';
  }
}
