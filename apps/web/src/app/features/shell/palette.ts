import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { fuzzyScore, searchText, subtitle, type Entry, type EntryKind } from '@keyme/models';
import { Clipboard } from '../../core/clipboard.service';
import { UiState } from '../../core/ui-state';
import { VaultStore } from '../../core/vault.store';
import { Avatar } from '../../ui/avatar';
import { Icon } from '../../ui/icon';

interface Action {
  id: string;
  label: string;
  icon: string;
  run: () => void;
}

/** Buscar y copiar sin abrir la ficha: Enter abre, Ctrl+C copia la contraseña, Ctrl+U el usuario. */
@Component({
  selector: 'km-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar, Icon],
  template: `
    @if (ui.paletteOpen()) {
      <div class="backdrop" (click)="close()">
        <div class="pal" (click)="$event.stopPropagation()" role="dialog" aria-label="Buscar">
          <div class="in">
            <km-icon name="search" [size]="18" />
            <input #q [value]="query()" (input)="query.set($any($event.target).value); index.set(0)" (keydown)="key($event)"
                   placeholder="Busca un elemento o una acción…" autocomplete="off" spellcheck="false" />
            <span class="kbd">Esc</span>
          </div>
          <div class="res">
            @for (e of results(); track e.id; let i = $index) {
              <div class="r" [class.on]="i === index()" (mouseenter)="index.set(i)" (click)="open(e)">
                <km-avatar [entry]="e" [size]="32" [ring]="ui.spaceById().get(e.spaceId ?? '')?.color ?? null" />
                <span class="t"><b>{{ e.title || 'Sin título' }}</b><span class="faint small">{{ sub(e) }}</span></span>
                @if (i === index()) {
                  <span class="hints">
                    @if (hasSecret(e)) { <span><span class="kbd">Ctrl C</span> {{ e.kind === 'card' ? 'número' : 'contraseña' }}</span> }
                    @if (e.kind === 'login' && e.username) { <span><span class="kbd">Ctrl U</span> usuario</span> }
                    <span><span class="kbd">↵</span> abrir</span>
                  </span>
                }
              </div>
            }
            @for (a of actions(); track a.id; let j = $index) {
              <div class="r act" [class.on]="results().length + j === index()" (mouseenter)="index.set(results().length + j)" (click)="a.run(); close()">
                <span class="ai"><km-icon [name]="a.icon" [size]="16" /></span><span class="t"><b>{{ a.label }}</b></span>
              </div>
            }
            @if (!results().length && !actions().length) { <p class="faint none">Sin resultados</p> }
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .backdrop { padding-top: 12vh; }
    .pal { width: min(640px, 100%); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 18px; box-shadow: var(--shadow-lg); overflow: hidden; animation: pop .16s var(--ease); }
    .in { display: flex; align-items: center; gap: 12px; padding: 0 16px; height: 58px; border-bottom: 1px solid var(--line); color: var(--text-3); }
    .in input { flex: 1; background: none; border: 0; outline: 0; color: var(--text); font: 17px var(--font-ui); box-shadow: none !important; }
    .res { max-height: 52vh; overflow: auto; padding: 6px; }
    .r { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 11px; cursor: pointer; }
    .r.on { background: var(--surface-2); }
    .t { flex: 1; min-width: 0; display: flex; flex-direction: column; b { font-weight: 560; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } }
    .hints { display: flex; gap: 10px; font-size: 11.5px; color: var(--text-3); white-space: nowrap; > span { display: flex; gap: 4px; align-items: center; } }
    .ai { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); }
    .none { padding: 16px; margin: 0; }
    @media (max-width: 640px) { .hints { display: none; } }
  `,
})
export class Palette {
  protected ui = inject(UiState);
  private store = inject(VaultStore);
  private router = inject(Router);
  private clipboard = inject(Clipboard);
  private input = viewChild<ElementRef<HTMLInputElement>>('q');

  protected readonly query = signal('');
  protected readonly index = signal(0);
  protected readonly sub = subtitle;

  protected readonly results = computed(() => {
    const q = this.query().trim();
    const spaces = this.ui.spaceById();
    const list = this.store.entries();
    if (!q) return [...list].sort((a, b) => (b.usage?.lastUsedAt ?? b.modifiedAt).localeCompare(a.usage?.lastUsedAt ?? a.modifiedAt)).slice(0, 8);
    return list
      .map((e) => ({ e, s: fuzzyScore(q, searchText(e, spaces.get(e.spaceId ?? '')?.name)) + Math.min(e.usage?.count ?? 0, 10) * 0.3 }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map((x) => x.e);
  });

  private readonly allActions: Action[] = [
    ...(['login', 'card', 'note', 'document', 'identity', 'wifi'] as EntryKind[]).map((k) => ({
      id: `new-${k}`, icon: 'plus', label: `Nuevo: ${{ login: 'login', card: 'tarjeta', note: 'nota segura', document: 'documento', identity: 'identidad', wifi: 'red Wi-Fi' }[k]}`,
      run: () => void this.router.navigate(['/nuevo', k]),
    })),
    { id: 'gen', icon: 'dice', label: 'Generar contraseña', run: () => void this.router.navigate(['/generador']) },
    { id: 'wallet', icon: 'card', label: 'Abrir cartera', run: () => void this.router.navigate(['/tarjetas']) },
    { id: 'health', icon: 'shield', label: 'Salud del vault', run: () => void this.router.navigate(['/salud']) },
    { id: 'import', icon: 'upload', label: 'Importar desde SafeInCloud / Bitwarden / Chrome', run: () => void this.router.navigate(['/ajustes'], { fragment: 'importar' }) },
    { id: 'settings', icon: 'sliders', label: 'Ajustes', run: () => void this.router.navigate(['/ajustes']) },
    { id: 'sync', icon: 'sync', label: 'Sincronizar ahora', run: () => void this.store.sync() },
    { id: 'lock', icon: 'lock', label: 'Bloquear vault', run: () => void this.store.lock() },
  ];

  protected readonly actions = computed(() => {
    const q = this.query().trim();
    if (!q) return this.allActions.slice(0, 3);
    return this.allActions.filter((a) => fuzzyScore(q, a.label) > 3).slice(0, 5);
  });

  constructor() {
    effect(() => {
      if (this.ui.paletteOpen()) {
        this.query.set('');
        this.index.set(0);
        setTimeout(() => this.input()?.nativeElement.focus());
      }
    });
  }

  protected hasSecret(e: Entry): boolean {
    return ((e.kind === 'login' || e.kind === 'wifi') && !!e.password) || (e.kind === 'card' && !!e.number);
  }

  protected close(): void {
    this.ui.paletteOpen.set(false);
  }

  protected open(e: Entry): void {
    void this.router.navigate(['/item', e.id]);
    this.close();
  }

  protected key(ev: KeyboardEvent): void {
    const total = this.results().length + this.actions().length;
    const i = this.index();
    const current = this.results()[i];
    const mod = ev.ctrlKey || ev.metaKey;
    if (ev.key === 'Escape') this.close();
    else if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      this.index.set(Math.min(total - 1, i + 1));
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      this.index.set(Math.max(0, i - 1));
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      if (current) this.open(current);
      else this.actions()[i - this.results().length]?.run(), this.close();
    } else if (mod && ev.key.toLowerCase() === 'c' && current && !window.getSelection()?.toString()) {
      ev.preventDefault();
      const v = current.kind === 'card' ? current.number : current.kind === 'login' || current.kind === 'wifi' ? current.password : '';
      if (v) {
        void this.clipboard.copy(v, current.kind === 'card' ? 'Número copiado' : 'Contraseña copiada');
        void this.store.markUsed(current);
        this.close();
      }
    } else if (mod && ev.key.toLowerCase() === 'u' && current?.kind === 'login') {
      ev.preventDefault();
      void this.clipboard.copy(current.username, 'Usuario copiado', false);
      this.close();
    }
  }
}
