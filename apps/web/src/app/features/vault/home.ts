import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { expiringSoon, subtitle, type Entry } from '@keyme/models';
import { UiState } from '../../core/ui-state';
import { VaultStore } from '../../core/vault.store';
import { Avatar } from '../../ui/avatar';
import { Icon } from '../../ui/icon';

@Component({
  selector: 'km-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Avatar, Icon],
  template: `
    <div class="page">
      <header class="hero">
        <p class="eyebrow">{{ today }}</p>
        <h1>{{ greeting }}</h1>
        <p class="muted">Tu vault tiene <b>{{ store.entries().length }}</b> elementos en <b>{{ store.spaces().length }}</b> espacios. Todo cifrado en este dispositivo.</p>
        <div class="tips">
          <span><span class="kbd">Ctrl K</span> buscar y copiar</span>
          <span><span class="kbd">N</span> nuevo</span>
          <span><span class="kbd">↑</span><span class="kbd">↓</span> navegar</span>
          <span><span class="kbd">Ctrl L</span> bloquear</span>
        </div>
      </header>

      <div class="spaces">
        @for (s of store.spaces(); track s.id) {
          <button class="space panel" [style.--c]="s.color" (click)="ui.filter.set({ type: 'space', id: s.id })">
            <span class="sw"><km-icon [name]="s.icon" [size]="18" /></span>
            <span class="name">{{ s.name }}</span>
            <span class="n">{{ ui.counts().spaces[s.id] || 0 }}</span>
          </button>
        }
      </div>

      @if (expiring().length) {
        <section>
          <h3><km-icon name="clock" [size]="16" /> Por vencer</h3>
          <div class="rows">
            @for (x of expiring(); track x.entry.id) {
              <a class="row panel" [routerLink]="['/item', x.entry.id]">
                <km-avatar [entry]="x.entry" [size]="34" />
                <span class="grow"><b>{{ x.entry.title }}</b><span class="faint small">{{ subtitle(x.entry) }}</span></span>
                <span class="chip" [class.danger]="x.days < 0" [class.warn]="x.days >= 0">{{ x.days < 0 ? 'Vencido' : x.days === 0 ? 'Hoy' : x.days + ' días' }}</span>
              </a>
            }
          </div>
        </section>
      }

      <section>
        <h3><km-icon name="zap" [size]="16" /> Lo que más usas</h3>
        @if (top().length) {
          <div class="tiles">
            @for (e of top(); track e.id) {
              <a class="tile panel" [routerLink]="['/item', e.id]">
                <km-avatar [entry]="e" [size]="40" [ring]="color(e)" />
                <b>{{ e.title || 'Sin título' }}</b>
                <span class="faint small">{{ subtitle(e) }}</span>
              </a>
            }
          </div>
        } @else {
          <p class="faint">Aquí aparecerán tus elementos más usados.</p>
        }
      </section>

      <div class="actions">
        <a class="action panel" routerLink="/salud"><km-icon name="shield" [size]="22" /><b>Revisar la salud del vault</b><span class="faint small">Repetidas, débiles y filtradas</span></a>
        <a class="action panel" routerLink="/tarjetas"><km-icon name="card" [size]="22" /><b>Cartera</b><span class="faint small">Tus tarjetas a un toque</span></a>
        <a class="action panel" routerLink="/ajustes" fragment="importar"><km-icon name="upload" [size]="22" /><b>Importar</b><span class="faint small">SafeInCloud, Bitwarden, Chrome</span></a>
      </div>
    </div>
  `,
  styles: `
    .hero { margin-bottom: 26px; h1 { font-size: 36px; margin: 6px 0 8px; } b { color: var(--text); } }
    .tips { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 16px; font-size: 12.5px; color: var(--text-3); span { display: inline-flex; gap: 4px; align-items: center; } }
    .spaces { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; margin-bottom: 30px; }
    .space { display: flex; align-items: center; gap: 12px; padding: 14px; cursor: pointer; color: var(--text); font: 500 15px var(--font-ui); text-align: left; border-color: color-mix(in oklab, var(--c) 25%, var(--line)); background: linear-gradient(150deg, color-mix(in oklab, var(--c) 10%, var(--surface)), var(--surface)); transition: transform .15s var(--ease); }
    .space:hover { transform: translateY(-2px); }
    .sw { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: color-mix(in oklab, var(--c) 22%, transparent); color: var(--c); }
    .name { flex: 1; }
    .n { font-family: var(--font-display); font-size: 22px; color: var(--c); }
    section { margin-bottom: 28px; }
    h3 { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: var(--text-2); km-icon { color: var(--accent); } }
    .rows { display: flex; flex-direction: column; gap: 8px; }
    .row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; color: var(--text); }
    .grow { flex: 1; display: flex; flex-direction: column; }
    .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
    .tile { display: flex; flex-direction: column; gap: 8px; padding: 14px; color: var(--text); min-width: 0; transition: transform .15s var(--ease), border-color .15s; }
    .tile:hover { transform: translateY(-2px); border-color: var(--line-strong); }
    .tile b, .tile span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    .action { display: flex; flex-direction: column; gap: 6px; padding: 16px; color: var(--text); km-icon { color: var(--accent); margin-bottom: 4px; } }
    .action:hover { border-color: var(--line-strong); }
  `,
})
export class Home {
  protected store = inject(VaultStore);
  protected ui = inject(UiState);
  protected readonly subtitle = subtitle;
  protected readonly today = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  protected readonly greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  })();
  protected readonly expiring = computed(() => expiringSoon(this.store.entries(), 30).slice(0, 5));
  protected readonly top = computed(() =>
    [...this.store.entries()]
      .sort((a, b) => (b.usage?.count ?? 0) - (a.usage?.count ?? 0) || Number(b.favorite) - Number(a.favorite) || b.modifiedAt.localeCompare(a.modifiedAt))
      .slice(0, 8),
  );

  protected color(e: Entry): string | null {
    return e.spaceId ? this.ui.spaceById().get(e.spaceId)?.color ?? null : null;
  }
}
