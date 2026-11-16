import { ApplicationRef, ChangeDetectionStrategy, Component, DestroyRef, computed, inject, linkedSignal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { KIND_LABELS, type EntryKind } from '@keyme/models';
import { AppUpdates } from '../../core/app-updates';
import { morph } from '../../core/motion';
import { UiState } from '../../core/ui-state';
import { VaultStore } from '../../core/vault.store';
import { Icon } from '../../ui/icon';
import { InstallButton } from '../../ui/install-button';
import { Sheet } from '../../ui/sheet';
import { EntryList } from './entry-list';

interface Tab {
  path: string;
  icon: string;
  label: string;
}

@Component({
  selector: 'km-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, Icon, EntryList, InstallButton, Sheet],
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
  private appRef = inject(ApplicationRef);

  constructor() {
    // Al llegar a la pantalla nueva se cierra la hoja "Nuevo" dentro de la
    // misma transición, así la hoja se convierte en el editor sin parpadeo.
    const sub = this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      document.documentElement.classList.remove('vt-sheet-src');
      this.ui.newMenuOpen.set(false);
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  private url = toSignal(
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map((e) => (e as NavigationEnd).urlAfterRedirects)),
    { initialValue: this.router.url },
  );
  /** Páginas que ocupan todo el ancho (sin la lista). */
  protected readonly full = computed(() => /^\/(wallet|generator|health|settings)/.test(this.url()));
  /** En móvil: ¿se ve el panel derecho en vez de la lista? */
  protected readonly detail = computed(() => this.url() !== '/' && !this.url().startsWith('/?') && !this.url().startsWith('/#'));
  /** Pestaña activa: la bóveda incluye la lista, las fichas y el editor. */
  protected readonly active = computed(() => {
    const m = /^\/(wallet|generator|health|settings)/.exec(this.url());
    return m ? `/${m[1]}` : '/';
  });

  protected readonly tabs: Tab[] = [
    { path: '/', icon: 'layers', label: 'Bóveda' },
    { path: '/wallet', icon: 'card', label: 'Cartera' },
    { path: '/generator', icon: 'dice', label: 'Generar' },
    { path: '/health', icon: 'shield', label: 'Salud' },
  ];
  /** Posición del indicador: índice en el riel y columna en la barra móvil. */
  protected readonly railIndex = computed(() => this.tabs.findIndex((t) => t.path === this.active()));
  protected readonly mobileCol = computed(() => {
    const i = this.mobileTabs.findIndex((t) => t.path === this.active());
    return i < 0 ? -1 : i >= 2 ? i + 1 : i;
  });
  /** Hacia dónde viaja el indicador: el borde que va adelante se estira primero. */
  protected readonly tabDir = linkedSignal<number, 'next' | 'prev'>({
    source: this.mobileCol,
    computation: (col, prev) => (prev && col < prev.source ? 'prev' : 'next'),
  });

  protected readonly mobileTabs: Tab[] = [
    { path: '/', icon: 'layers', label: 'Bóveda' },
    { path: '/wallet', icon: 'card', label: 'Cartera' },
    { path: '/health', icon: 'shield', label: 'Salud' },
    { path: '/settings', icon: 'sliders', label: 'Ajustes' },
  ];

  protected readonly newKinds: { kind: EntryKind; label: string; hint: string; color: string }[] = [
    { kind: 'login', label: KIND_LABELS.login, hint: 'Cuenta de un sitio o app', color: '#eeaa5c' },
    { kind: 'card', label: KIND_LABELS.card, hint: 'Crédito o débito', color: '#8fa3e6' },
    { kind: 'note', label: KIND_LABELS.note, hint: 'Texto cifrado', color: '#c9c26b' },
    { kind: 'document', label: KIND_LABELS.document, hint: 'INE, pasaporte, CURP…', color: '#7fb7a4' },
    { kind: 'identity', label: KIND_LABELS.identity, hint: 'Datos para formularios', color: '#d9a0c4' },
    { kind: 'wifi', label: KIND_LABELS.wifi, hint: 'Con QR para compartir', color: '#6fb3d2' },
  ];

  protected readonly syncState = computed(() => (!this.store.online() ? 'offline' : this.store.syncState()));
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

  /** Volver a la bóveda limpia el filtro solo si ya estabas en ella. */
  protected home(): void {
    if (this.active() === '/' && !this.detail()) {
      this.ui.filter.set({ type: 'all' });
      this.ui.query.set('');
      this.ui.archiveOpen.set(false);
    }
  }

  /** Abre la hoja "Nuevo" creciendo desde el botón que la abrió. */
  protected openNew(ev: Event): void {
    const btn = ev.currentTarget as HTMLElement;
    btn.style.viewTransitionName = 'km-fab';
    morph(this.appRef, () => {
      btn.style.viewTransitionName = '';
      this.ui.newMenuOpen.set(true);
    }, 'vt-fab');
  }

  /** La hoja se expande hasta convertirse en el editor (ver vt-sheet en styles.scss). */
  protected newEntry(kind: EntryKind): void {
    document.documentElement.classList.add('vt-sheet-src');
    void this.router.navigate(['/new', kind]).finally(() => {
      document.documentElement.classList.remove('vt-sheet-src');
      this.ui.newMenuOpen.set(false);
    });
  }

  protected onKey(e: KeyboardEvent): void {
    const mod = e.ctrlKey || e.metaKey;
    const typing = e.target instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable);
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
    }
  }
}
