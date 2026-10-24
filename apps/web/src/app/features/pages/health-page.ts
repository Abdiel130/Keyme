import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { subtitle } from '@keyme/models';
import { analyze, checkPwned, type HealthIssue } from '../../core/health';
import { Toasts } from '../../core/toasts';
import { UiState } from '../../core/ui-state';
import { VaultStore } from '../../core/vault.store';
import { Avatar } from '../../ui/avatar';
import { Icon } from '../../ui/icon';

type Tab = 'all' | 'pwned' | 'weak' | 'reused' | 'old';

@Component({
  selector: 'km-health',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Avatar, Icon],
  template: `
    <div class="page">
      <div class="page-head">
        <div><p class="eyebrow">Diagnóstico</p><h1>Salud del vault</h1><p class="muted">Se analiza en tu dispositivo. Nada sale de aquí, salvo 5 caracteres de un hash si revisas filtraciones.</p></div>
      </div>

      <div class="top">
        <div class="score panel" [attr.data-g]="grade()">
          <svg viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" class="bg" />
            <circle cx="60" cy="60" r="52" class="fg" [attr.stroke-dashoffset]="326.7 * (1 - report().score / 100)" />
          </svg>
          <div class="num"><b>{{ report().score }}</b><span>de 100</span></div>
        </div>
        <div class="stats">
          <button class="stat panel" [class.on]="tab() === 'pwned'" (click)="tab.set('pwned')"><b class="danger">{{ pwnedChecked() ? report().pwned : '?' }}</b><span>Filtradas</span></button>
          <button class="stat panel" [class.on]="tab() === 'weak'" (click)="tab.set('weak')"><b class="warn">{{ report().weak }}</b><span>Débiles</span></button>
          <button class="stat panel" [class.on]="tab() === 'reused'" (click)="tab.set('reused')"><b class="warn">{{ report().reused }}</b><span>Repetidas</span></button>
          <button class="stat panel" [class.on]="tab() === 'old'" (click)="tab.set('old')"><b>{{ report().old }}</b><span>Más de 1 año</span></button>
        </div>
      </div>

      <div class="hibp panel">
        <km-icon name="shield" [size]="22" />
        <div class="grow">
          <b>Revisar filtraciones con Have I Been Pwned</b>
          <p class="faint small">k-anonymity: se envían solo los primeros 5 caracteres del SHA-1 de cada contraseña; la comparación se hace aquí. Requiere internet.</p>
        </div>
        <button class="btn" [class.primary]="!pwnedChecked()" (click)="runHibp()" [disabled]="checking()">
          @if (checking()) { <span class="spinner"></span> {{ progress() }} } @else { {{ pwnedChecked() ? 'Revisar otra vez' : 'Revisar ahora' }} }
        </button>
      </div>

      @if (report().bySpace.length > 1) {
        <h3>Por espacio</h3>
        <div class="spaces">
          @for (s of report().bySpace; track s.space?.id ?? 'none') {
            <div class="sp panel" [style.--c]="s.space?.color ?? 'var(--text-3)'">
              <span class="name">{{ s.space?.name ?? 'Sin espacio' }}</span>
              <div class="bar"><i [style.width.%]="s.score"></i></div>
              <span class="faint tiny">{{ s.score }} · {{ s.issues }} de {{ s.total }} con problemas</span>
            </div>
          }
        </div>
      }

      <h3 class="list-h">
        <span>{{ titles[tab()] }}</span>
        @if (tab() !== 'all') { <button class="btn sm ghost" (click)="tab.set('all')">Ver todo</button> }
      </h3>
      <div class="issues">
        @for (i of list(); track i.entry.id) {
          <a class="issue panel" [routerLink]="['/item', i.entry.id, 'editar']">
            <km-avatar [entry]="i.entry" [size]="34" [ring]="ui.spaceById().get(i.entry.spaceId ?? '')?.color ?? null" />
            <span class="grow"><b>{{ i.entry.title }}</b><span class="faint small">{{ subtitle(i.entry) }}</span></span>
            <span class="tags">
              @if (i.pwned) { <span class="chip danger">Filtrada {{ fmt(i.pwned) }} veces</span> }
              @if (i.weak !== undefined) { <span class="chip warn">Débil</span> }
              @if (i.reusedWith) { <span class="chip warn">Repetida ×{{ i.reusedWith + 1 }}</span> }
              @if (i.ageDays) { <span class="chip">{{ (i.ageDays / 365).toFixed(1) }} años</span> }
            </span>
            <span class="fix">Cambiar <km-icon name="chevron" [size]="14" /></span>
          </a>
        } @empty {
          <div class="empty"><km-icon name="check" [size]="30" /><h2>Todo en orden</h2><p>No hay problemas en esta categoría.</p></div>
        }
      </div>
    </div>
  `,
  styles: `
    .top { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
    .score { position: relative; width: 170px; height: 170px; display: grid; place-items: center; flex: none; }
    .score svg { position: absolute; inset: 14px; transform: rotate(-90deg); }
    .score circle { fill: none; stroke-width: 9; }
    .score .bg { stroke: var(--surface-3); }
    .score .fg { stroke: var(--ok); stroke-linecap: round; stroke-dasharray: 326.7; transition: stroke-dashoffset .8s var(--ease); }
    .score[data-g='mid'] .fg { stroke: var(--warn); }
    .score[data-g='low'] .fg { stroke: var(--danger); }
    .num { display: flex; flex-direction: column; align-items: center; b { font: 600 42px var(--font-display); line-height: 1; } span { font-size: 12px; color: var(--text-3); } }
    .stats { flex: 1; display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; min-width: 260px; }
    .stat { display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 16px; cursor: pointer; text-align: left; color: var(--text-2); font: 13px var(--font-ui); }
    .stat b { font: 600 32px var(--font-display); color: var(--text); }
    .stat b.danger { color: var(--danger); } .stat b.warn { color: var(--warn); }
    .stat.on { border-color: var(--accent); }
    .hibp { display: flex; align-items: center; gap: 16px; padding: 16px 18px; margin-bottom: 26px; flex-wrap: wrap; km-icon { color: var(--accent); } p { margin: 2px 0 0; } }
    .grow { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    h3 { margin: 0 0 12px; color: var(--text-2); }
    .list-h { display: flex; align-items: center; justify-content: space-between; margin-top: 26px; }
    .spaces { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    .sp { padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
    .name { font-weight: 600; color: var(--c); }
    .bar { height: 6px; border-radius: 6px; background: var(--surface-3); overflow: hidden; i { display: block; height: 100%; background: var(--c); border-radius: 6px; } }
    .issues { display: flex; flex-direction: column; gap: 8px; }
    .issue { display: flex; align-items: center; gap: 12px; padding: 10px 14px; color: var(--text); flex-wrap: wrap; }
    .issue:hover { border-color: var(--line-strong); }
    .tags { display: flex; gap: 6px; flex-wrap: wrap; }
    .fix { display: flex; align-items: center; gap: 4px; font-size: 13px; color: var(--accent); }
  `,
})
export class HealthPage {
  private store = inject(VaultStore);
  protected ui = inject(UiState);
  private toasts = inject(Toasts);
  protected readonly subtitle = subtitle;
  protected readonly tab = signal<Tab>('all');
  protected readonly pwned = signal<Map<string, number>>(new Map());
  protected readonly pwnedChecked = signal(false);
  protected readonly checking = signal(false);
  protected readonly progress = signal('');
  protected readonly titles: Record<Tab, string> = {
    all: 'Elementos por mejorar', pwned: 'Aparecen en filtraciones', weak: 'Contraseñas débiles', reused: 'Contraseñas repetidas', old: 'Sin cambiar en más de un año',
  };

  protected readonly report = computed(() => analyze(this.store.entries(), this.store.spaces(), this.pwned()));
  protected readonly grade = computed(() => (this.report().score >= 80 ? 'high' : this.report().score >= 50 ? 'mid' : 'low'));
  protected readonly list = computed<HealthIssue[]>(() => {
    const all = [...this.report().issues.values()];
    const t = this.tab();
    const f = all.filter((i) => t === 'all' || (t === 'pwned' ? i.pwned : t === 'weak' ? i.weak !== undefined : t === 'reused' ? i.reusedWith : i.ageDays));
    const rank = (i: HealthIssue) => (i.pwned ? 8 : 0) + (i.weak !== undefined ? 4 - i.weak : 0) + (i.reusedWith ? 2 : 0) + (i.ageDays ? 1 : 0);
    return f.sort((a, b) => rank(b) - rank(a));
  });

  protected async runHibp(): Promise<void> {
    this.checking.set(true);
    try {
      const res = await checkPwned(this.store.entries(), (d, t) => this.progress.set(`${d}/${t}`));
      this.pwned.set(res);
      this.pwnedChecked.set(true);
      this.toasts.show(res.size ? `${res.size} contraseña(s) aparecen en filtraciones` : 'Ninguna contraseña aparece en filtraciones', res.size ? 'error' : 'ok');
      if (res.size) this.tab.set('pwned');
    } catch {
      this.toasts.show('No se pudo consultar Have I Been Pwned (¿sin internet?)', 'error');
    } finally {
      this.checking.set(false);
      this.progress.set('');
    }
  }

  protected fmt(n: number): string {
    return n.toLocaleString('es-MX');
  }
}
