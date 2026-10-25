import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { KIND_LABELS, type EntryKind } from '@keyme/models';
import { AppUpdates } from '../../core/app-updates';
import { UiState, type Filter } from '../../core/ui-state';
import { VaultStore } from '../../core/vault.store';
import { Icon } from '../../ui/icon';
import { InstallButton } from '../../ui/install-button';
import { EntryList } from './entry-list';

@Component({
  selector: 'km-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, EntryList, InstallButton],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  host: {
    '(document:keydown)': 'onKey($event)',
  },
})
export class Shell {
  protected store = inject(VaultStore);
  protected ui = inject(UiState);
  protected updates = inject(AppUpdates);
  private router = inject(Router);

  private url = toSignal(
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map((e) => (e as NavigationEnd).urlAfterRedirects)),
    { initialValue: this.router.url },
  );
  /** Páginas que ocupan todo el ancho (sin la lista). */
  protected readonly full = computed(() => /^\/(wallet|generator|health|settings)/.test(this.url()));
  /** En móvil: ¿se ve el panel derecho en vez de la lista? */
  protected readonly detail = computed(() => this.url() !== '/' && !this.url().startsWith('/?'));

  protected readonly kinds: EntryKind[] = ['login', 'card', 'document', 'identity', 'note', 'wifi'];
  protected readonly kindLabels: Record<EntryKind, string> = {
    login: 'Logins', card: 'Tarjetas', document: 'Documentos', identity: 'Identidades', note: 'Notas', wifi: 'Wi-Fi',
  };
  protected readonly newKinds = this.kinds.map((k) => ({ kind: k, label: KIND_LABELS[k] }));
  protected readonly syncLabel = computed(() => {
    const s = this.store.syncState();
    const p = this.store.pending();
    if (s === 'syncing') return 'Sincronizando…';
    if (s === 'offline' || !this.store.online()) return p ? `Sin conexión · ${p} pendiente${p > 1 ? 's' : ''}` : 'Sin conexión';
    if (s === 'error') return 'Error al sincronizar';
    if (p) return `${p} cambio${p > 1 ? 's' : ''} por subir`;
    const t = this.store.lastSyncAt();
    return t ? `Sincronizado ${t.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}` : 'Listo';
  });
  protected readonly menuFor = signal<string | null>(null);

  protected isActive(f: Filter): boolean {
    return JSON.stringify(f) === JSON.stringify(this.ui.filter()) && !this.full();
  }

  protected pick(f: Filter): void {
    this.ui.filter.set(f);
    this.ui.query.set('');
    this.ui.railOpen.set(false);
    if (this.full() || this.detail()) void this.router.navigate(['/']);
  }

  protected newEntry(kind: EntryKind): void {
    this.ui.newMenuOpen.set(false);
    this.ui.railOpen.set(false);
    void this.router.navigate(['/new', kind]);
  }

  protected onKey(e: KeyboardEvent): void {
    const mod = e.ctrlKey || e.metaKey;
    const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.ui.paletteOpen.set(true);
    } else if (mod && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      void this.store.lock();
    } else if (!typing && !mod && e.key === 'n') {
      e.preventDefault();
      this.ui.newMenuOpen.set(true);
    } else if (!typing && !mod && e.key === '/') {
      e.preventDefault();
      document.querySelector<HTMLInputElement>('#km-search')?.focus();
    } else if (e.key === 'Escape') {
      this.ui.newMenuOpen.set(false);
      this.ui.railOpen.set(false);
    }
  }
}
