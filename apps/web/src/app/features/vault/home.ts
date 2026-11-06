import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { expiringSoon, subtitle, type CardEntry, type Entry } from '@keyme/models';
import { Clipboard } from '../../core/clipboard.service';
import { UiState } from '../../core/ui-state';
import { VaultStore } from '../../core/vault.store';
import { Avatar } from '../../ui/avatar';
import { CardVisual } from '../../ui/card-visual';
import { Icon } from '../../ui/icon';

/** Panel derecho cuando no hay nada abierto: lo de todos los días, a un toque. */
@Component({
  selector: 'km-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Avatar, CardVisual, Icon],
  template: `
    <div class="page">
      <header class="hero">
        <p class="eyebrow">{{ today }}</p>
        <h1>{{ greeting }}</h1>
        <p class="muted">{{ store.entries().length }} elementos cifrados en este dispositivo.</p>
        <button class="search" (click)="ui.paletteOpen.set(true)">
          <km-icon name="search" [size]="20" /> <span>Busca y copia lo que sea…</span> <span class="kbd">Ctrl K</span>
        </button>
      </header>

      @if (expiring().length) {
        <section>
          <h3><km-icon name="clock" [size]="18" /> Por vencer</h3>
          <div class="rows stagger">
            @for (x of expiring(); track x.entry.id; let i = $index) {
              <a class="row" [style.--i]="i" [routerLink]="['/item', x.entry.id]">
                <km-avatar [entry]="x.entry" [size]="40" />
                <span class="grow"><b>{{ x.entry.title }}</b><span class="faint small">{{ subtitle(x.entry) }}</span></span>
                <span class="chip" [class.danger]="x.days < 0" [class.warn]="x.days >= 0">{{ x.days < 0 ? 'Vencido' : x.days === 0 ? 'Hoy' : x.days + ' días' }}</span>
              </a>
            }
          </div>
        </section>
      }

      <section>
        <h3><km-icon name="zap" [size]="18" /> Copia rápida</h3>
        @if (top().length) {
          <div class="tiles stagger">
            @for (e of top(); track e.id; let i = $index) {
              <div class="tile" [style.--i]="i">
                <a class="tile-main" [routerLink]="['/item', e.id]">
                  <km-avatar [entry]="e" [size]="46" [ring]="color(e)" />
                  <span class="tt"><b>{{ e.title || 'Sin título' }}</b><span class="faint small">{{ subtitle(e) }}</span></span>
                </a>
                @if (secret(e)) {
                  <button class="tc" [class.done]="flash() === e.id" (click)="copy(e)" [attr.aria-label]="'Copiar de ' + e.title">
                    <km-icon [name]="flash() === e.id ? 'check' : e.kind === 'card' ? 'card' : 'key'" [size]="17" />
                    {{ flash() === e.id ? 'Copiado' : e.kind === 'card' || e.kind === 'document' ? 'Número' : 'Contraseña' }}
                  </button>
                }
              </div>
            }
          </div>
        } @else {
          <p class="faint">Aquí aparecerán tus elementos más usados.</p>
        }
      </section>

      <div class="duo">
        @if (card(); as c) {
          <a class="wallet-teaser" routerLink="/wallet">
            <div class="mini"><km-card-visual [card]="c" [interactive]="false" [compact]="true" /></div>
            <span><b>Cartera</b><span class="faint small">{{ cards() }} {{ cards() === 1 ? 'tarjeta' : 'tarjetas' }} a un toque</span></span>
            <km-icon name="chevron" />
          </a>
        }
        <a class="action" routerLink="/health"><span class="ai"><km-icon name="shield" [size]="22" /></span><span><b>Salud del vault</b><span class="faint small">Repetidas, débiles y filtradas</span></span><km-icon name="chevron" /></a>
        <a class="action" routerLink="/settings" fragment="import"><span class="ai"><km-icon name="upload" [size]="22" /></span><span><b>Importar</b><span class="faint small">SafeInCloud, Bitwarden, Chrome</span></span><km-icon name="chevron" /></a>
      </div>

      <div class="tips">
        <span><span class="kbd">Ctrl K</span> buscar y copiar</span>
        <span><span class="kbd">N</span> nuevo</span>
        <span><span class="kbd">/</span> filtrar</span>
        <span><span class="kbd">↑</span><span class="kbd">↓</span> navegar</span>
        <span><span class="kbd">Ctrl L</span> bloquear</span>
      </div>
    </div>
  `,
  styles: `
    .page { max-width: 880px; margin: 0 auto; }
    .hero { margin: 12px 0 34px; h1 { font-size: 44px; margin: 6px 0 6px; } p.muted { margin: 0 0 22px; font-size: 16px; } }
    .search {
      width: 100%; display: flex; align-items: center; gap: 12px; height: 60px; padding: 0 18px; border-radius: 20px; cursor: pointer;
      background: var(--surface); border: 1px solid var(--line); color: var(--text-3); font: 17px var(--font-ui); text-align: left; box-shadow: var(--shadow);
      transition: border-color .2s, transform .3s var(--spring);
      span:not(.kbd) { flex: 1; }
      @media (hover: hover) { &:hover { border-color: var(--line-strong); } }
      &:active { transform: scale(.99); }
    }
    section { margin-bottom: 34px; }
    h3 { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; color: var(--text-2); km-icon { color: var(--accent); } }
    .rows { display: flex; flex-direction: column; gap: 8px; }
    .row { display: flex; align-items: center; gap: 14px; padding: 12px 14px; color: var(--text); border-radius: 18px; background: var(--surface); border: 1px solid var(--line); }
    .grow { flex: 1; display: flex; flex-direction: column; }
    .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
    .tile {
      display: flex; flex-direction: column; gap: 12px; padding: 14px; border-radius: 22px; background: var(--surface); border: 1px solid var(--line);
      transition: border-color .2s, transform .3s var(--spring); min-width: 0;
      @media (hover: hover) { &:hover { border-color: var(--line-strong); transform: translateY(-2px); } }
    }
    .tile-main { display: flex; align-items: center; gap: 12px; color: var(--text); min-width: 0; }
    .tt { display: flex; flex-direction: column; min-width: 0; b, span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } b { font-weight: 650; } }
    .tc {
      display: flex; align-items: center; justify-content: center; gap: 8px; height: 40px; border-radius: 13px; border: 0; cursor: pointer;
      background: var(--accent-soft); color: var(--accent); font: 650 14px var(--font-ui); transition: background .2s, color .2s, transform .25s var(--spring);
      &:active { transform: scale(.95); } &.done { background: var(--ok-soft); color: var(--ok); }
    }
    .duo { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; margin-bottom: 30px; }
    .wallet-teaser, .action {
      display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 22px; color: var(--text); background: var(--surface); border: 1px solid var(--line);
      transition: border-color .2s, transform .3s var(--spring);
      > span:not(.ai) { flex: 1; display: flex; flex-direction: column; min-width: 0; } b { font-weight: 650; } > km-icon { color: var(--text-3); }
      @media (hover: hover) { &:hover { border-color: var(--line-strong); transform: translateY(-2px); } }
      &:active { transform: scale(.98); }
    }
    .wallet-teaser { grid-row: span 2; flex-direction: column; align-items: flex-start; > km-icon { display: none; } }
    .mini { width: 100%; max-width: 260px; pointer-events: none; }
    .ai { width: 46px; height: 46px; border-radius: 15px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); flex: none; }
    .tips { display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; color: var(--text-3); span { display: inline-flex; gap: 4px; align-items: center; } }
    @media (hover: none) { .tips { display: none; } }
  `,
})
export class Home {
  protected store = inject(VaultStore);
  protected ui = inject(UiState);
  private clipboard = inject(Clipboard);
  protected readonly subtitle = subtitle;
  protected readonly flash = signal<string | null>(null);
  protected readonly today = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  protected readonly greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  })();
  protected readonly expiring = computed(() => expiringSoon(this.store.shown(), 30).slice(0, 5));
  protected readonly top = computed(() =>
    [...this.store.shown()]
      .sort((a, b) => (b.usage?.count ?? 0) - (a.usage?.count ?? 0) || Number(b.favorite) - Number(a.favorite) || b.modifiedAt.localeCompare(a.modifiedAt))
      .slice(0, 6),
  );
  protected readonly card = computed(() => this.store.shown().find((e): e is CardEntry => e.kind === 'card' && e.favorite) ?? this.store.shown().find((e): e is CardEntry => e.kind === 'card') ?? null);
  protected readonly cards = computed(() => this.store.shown().filter((e) => e.kind === 'card').length);

  protected color(e: Entry): string | null {
    return e.spaceId ? this.ui.spaceById().get(e.spaceId)?.color ?? null : null;
  }

  protected secret(e: Entry): string {
    return e.kind === 'login' || e.kind === 'wifi' ? e.password : e.kind === 'card' || e.kind === 'document' ? e.number : '';
  }

  protected copy(e: Entry): void {
    const v = this.secret(e);
    if (!v) return;
    void this.clipboard.copy(v, e.kind === 'card' || e.kind === 'document' ? 'Número copiado' : 'Contraseña copiada');
    void this.store.markUsed(e);
    this.flash.set(e.id);
    setTimeout(() => this.flash() === e.id && this.flash.set(null), 1400);
  }
}
