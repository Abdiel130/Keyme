import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { hostOf, subtitle, type Entry } from '@keyme/models';
import { Breaches, dataClassEs } from '../../core/breaches';
import { OLD_AFTER_DAYS, analyze, passwordOf } from '../../core/health';
import { strength } from '../../core/strength';
import { Toasts } from '../../core/toasts';
import { UiState } from '../../core/ui-state';
import { VaultStore } from '../../core/vault.store';
import { Avatar } from '../../ui/avatar';
import { Icon } from '../../ui/icon';
import { SecretRow } from '../../ui/secret-row';
import { StrengthMeter } from '../../ui/strength-meter';
import { healthNav, hibpError } from './health-page';

/**
 * Detalle de un elemento con problemas desde Salud: qué contraseña es, por
 * qué es un riesgo, en qué filtraciones públicas aparece su sitio y el botón
 * para cambiarla. "Volver" regresa a Salud en la misma pestaña.
 */
@Component({
  selector: 'km-health-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Avatar, Icon, SecretRow, StrengthMeter],
  template: `
    <div class="page">
      <div class="bar">
        <button class="btn ghost sm" (click)="back()"><km-icon name="back" [size]="18" /> Salud</button>
      </div>

      @if (entry(); as e) {
        <header class="head">
          <km-avatar [entry]="e" [size]="56" [ring]="ui.spaceById().get(e.spaceId ?? '')?.color ?? null" />
          <div class="grow">
            <p class="eyebrow">Diagnóstico</p>
            <h1>{{ e.title || 'Sin título' }}</h1>
            <p class="muted">{{ subtitle(e) }}@if (site(); as s) { · {{ s }}}</p>
          </div>
        </header>

        <div class="panel rows">
          @if (password(); as p) { <km-secret-row label="Contraseña" [value]="p" [secret]="true" icon="key" /> }
          @if (e.kind === 'login' && e.username) { <km-secret-row label="Usuario" [value]="e.username" icon="users" /> }
        </div>

        <div class="actions">
          <a class="btn primary" [routerLink]="['/item', e.id, 'edit']" [queryParams]="{ from: 'health', htab: tab() || null }"><km-icon name="edit" [size]="16" /> Cambiar contraseña</a>
          <a class="btn" [routerLink]="['/item', e.id]"><km-icon name="external" [size]="16" /> Ver elemento</a>
        </div>

        @if (issue()?.pwned; as n) {
          <section class="card panel danger">
            <h2><km-icon name="alert" [size]="20" /> Aparece en filtraciones</h2>
            <p class="big">Esta contraseña apareció <b>{{ fmt(n) }}</b> {{ n === 1 ? 'vez' : 'veces' }} en filtraciones de datos conocidas.</p>
            <p>
              Está en las listas de contraseñas filtradas que los atacantes prueban en cualquier sitio. No significa que esta cuenta
              haya sido hackeada, pero cualquiera que pruebe esa lista podría entrar. Cámbiala por una contraseña nueva y única.
            </p>
            <p class="faint tiny">
              Fuente: Have I Been Pwned (Pwned Passwords).@if (breaches.checkedAt(); as at) { Revisado el {{ when(at) }}.}
              El conteo es de la contraseña, no de tu cuenta: HIBP no dice en qué filtración apareció.
            </p>
          </section>
        } @else if (!breaches.checkedAt() && password()) {
          <section class="card panel">
            <h2><km-icon name="shield" [size]="20" /> Filtraciones</h2>
            <p>Aún no revisas si esta contraseña aparece en filtraciones.</p>
            <button class="btn sm" (click)="check()" [disabled]="breaches.checking()">
              @if (breaches.checking()) { <span class="spinner"></span> {{ breaches.progress() }} } @else { Revisar ahora }
            </button>
          </section>
        }

        @if (issue()?.weak !== undefined) {
          <section class="card panel warn">
            <h2><km-icon name="alert" [size]="20" /> Contraseña débil</h2>
            <km-strength [value]="password() ?? ''" [inputs]="hints()" />
            @if (feedback()?.suggestions?.length && feedback()!.suggestions.length > 1) {
              @for (sg of feedback()!.suggestions.slice(1); track sg) { <p class="faint small">· {{ sg }}</p> }
            }
          </section>
        }

        @if (twins().length) {
          <section class="card panel warn">
            <h2><km-icon name="copy" [size]="20" /> Repetida en {{ twins().length + 1 }} elementos</h2>
            <p>Si se filtra en un sitio, sirve para entrar a todos estos. Usa una distinta en cada uno.</p>
            <div class="twins">
              @for (t of twins(); track t.id) {
                <a class="twin" [routerLink]="['/health', t.id]" [queryParams]="{ tab: tab() || null }" replaceUrl>
                  <km-avatar [entry]="t" [size]="28" />
                  <span class="grow"><b>{{ t.title }}</b><span class="faint tiny">{{ subtitle(t) }}</span></span>
                  <km-icon name="chevron" [size]="14" />
                </a>
              }
            </div>
          </section>
        }

        @if (issue()?.ageDays; as d) {
          <section class="card panel">
            <h2><km-icon name="clock" [size]="20" /> Sin cambiar en {{ (d / 365).toFixed(1) }} años</h2>
            <p>Recomendamos cambiarla al menos cada {{ oldYears }} año, sobre todo si es una cuenta importante.</p>
          </section>
        }

        @if (sites().length) {
          <section class="card panel">
            <h2><km-icon name="shield" [size]="20" /> Filtraciones de {{ sites()[0].name }}</h2>
            <p class="faint small">Filtraciones públicas registradas en Have I Been Pwned para este sitio.</p>
            @for (b of sites(); track b.name + b.date) {
              <article class="breach">
                <div class="bh">
                  <b>{{ b.name }}</b>
                  <span class="faint small">{{ date(b.date) }} · {{ fmt(b.count) }} cuentas</span>
                </div>
                @if (afterChange(b.date)) {
                  <p class="chip danger">Pasó después de tu último cambio de contraseña: cámbiala</p>
                } @else {
                  <p class="chip">Tu contraseña es posterior a esta filtración</p>
                }
                <div class="classes">
                  @for (c of b.classes; track c) { <span class="chip" [class.danger]="c === 'Passwords'">{{ dataClass(c) }}</span> }
                </div>
                @if (b.description) { <p class="desc faint small">{{ b.description }}</p> }
                <p class="faint tiny">
                  @if (b.verified) { Verificada } @else { Sin verificar }
                  @if (b.stealer) { · De malware que roba contraseñas }
                  @if (b.spam) { · Lista de spam }
                  · Agregada a HIBP el {{ date(b.added) }}
                </p>
              </article>
            }
          </section>
        }

        @if (!issue() && !sites().length) {
          <div class="empty"><km-icon name="check" [size]="30" /><h2>Todo en orden</h2><p>Este elemento no tiene problemas.</p></div>
        }
      } @else {
        <div class="empty"><km-icon name="x" [size]="30" /><h2>No encontrado</h2><p>El elemento ya no existe.</p></div>
      }
    </div>
  `,
  styles: `
    .bar { margin-bottom: 14px; }
    .head { display: flex; align-items: center; gap: 16px; margin-bottom: 18px; h1 { margin: 2px 0; } p { margin: 0; } }
    .grow { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .rows { padding: 4px 8px; margin-bottom: 14px; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 22px; }
    .card { padding: 18px 20px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 8px; }
    .card h2 { display: flex; align-items: center; gap: 8px; font-size: 18px; margin: 0 0 4px; }
    .card p { margin: 0; }
    .card.danger { border-color: color-mix(in srgb, var(--danger) 45%, transparent); h2 { color: var(--danger); } }
    .card.warn h2 { color: var(--warn); }
    .big { font-size: 16px; b { color: var(--danger); font-size: 20px; } }
    .twins { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
    .twin { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; color: var(--text); }
    .twin:hover { background: var(--surface-2); }
    .breach { border-top: 1px solid var(--line); padding-top: 12px; margin-top: 6px; display: flex; flex-direction: column; gap: 8px; }
    .bh { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; align-items: baseline; }
    .breach .chip { align-self: flex-start; white-space: normal; height: auto; min-height: 28px; padding: 4px 11px; }
    .classes { display: flex; gap: 6px; flex-wrap: wrap; }
    .desc { line-height: 1.5; }
  `,
})
export class HealthDetail {
  protected store = inject(VaultStore);
  protected ui = inject(UiState);
  protected breaches = inject(Breaches);
  private toasts = inject(Toasts);
  private location = inject(Location);
  private router = inject(Router);
  protected readonly subtitle = subtitle;

  /**
   * Si se llegó desde la lista, se vuelve con el historial (igual que el
   * "atrás" del sistema) y la lista recupera su posición. Si se abrió directo
   * (enlace, recarga), se navega a Salud.
   */
  protected back(): void {
    if (healthNav.fromList) this.location.back();
    else void this.router.navigate(['/health'], { queryParams: { tab: this.tab() || null } });
  }
  protected readonly oldYears = Math.round(OLD_AFTER_DAYS / 365);

  /** Ruta /health/:id */
  readonly id = input.required<string>();
  /** ?tab=pwned: pestaña de Salud a la que vuelve. */
  readonly tab = input<string>();

  protected readonly entry = computed<Entry | null>(() => this.store.entries().find((e) => e.id === this.id()) ?? null);
  protected readonly password = computed(() => {
    const e = this.entry();
    return e ? passwordOf(e) : null;
  });
  protected readonly issue = computed(() => {
    const e = this.entry();
    return e ? analyze(this.store.entries(), this.store.spaces(), this.breaches.pwned()).issues.get(e.id) ?? null : null;
  });
  protected readonly hints = computed(() => {
    const e = this.entry();
    return e ? (e.kind === 'login' ? [e.username, e.title] : [e.title]) : [];
  });
  protected readonly feedback = computed(() => {
    const p = this.password();
    return p ? strength(p, this.hints()) : null;
  });
  protected readonly twins = computed(() => {
    const e = this.entry();
    const p = this.password();
    return e && p ? this.store.entries().filter((o) => o.id !== e.id && passwordOf(o) === p) : [];
  });
  protected readonly site = computed(() => {
    const e = this.entry();
    return e?.kind === 'login' && e.urls[0] ? hostOf(e.urls[0].value) : '';
  });
  protected readonly sites = computed(() => {
    const e = this.entry();
    return e ? this.breaches.sitesFor(e) : [];
  });

  /** ¿La filtración del sitio es posterior al último cambio de esta contraseña? */
  protected afterChange(date: string): boolean {
    const e = this.entry();
    if (!e) return false;
    return date > (e.rotatedAt ?? e.createdAt).slice(0, 10);
  }

  protected async check(): Promise<void> {
    try {
      await this.breaches.check();
    } catch (err) {
      this.toasts.show(hibpError(err), 'error');
    }
  }

  protected dataClass(c: string): string {
    return dataClassEs(c);
  }

  protected fmt(n: number): string {
    return n.toLocaleString('es-MX');
  }

  protected date(d: string): string {
    const t = new Date(d.length === 10 ? `${d}T12:00:00` : d);
    return isNaN(+t) ? d : t.toLocaleDateString('es-MX', { dateStyle: 'medium' });
  }

  protected when(d: Date): string {
    return d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  }
}
