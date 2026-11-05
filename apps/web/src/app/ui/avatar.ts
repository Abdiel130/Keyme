import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { iconDomain, type Entry } from '@keyme/models';
import { Brands, inkFor, type Brand } from '../core/brands';
import { Icon } from './icon';

/**
 * Ícono del elemento, al estilo de un ícono de app: el logo de la marca si la
 * conocemos (empaquetado con la app: no se piden favicons a terceros, eso le
 * diría a alguien qué sitios tienes) y si no, un monograma con color estable.
 * El espacio se marca con un punto en la esquina; `badge` cuenta cuentas
 * agrupadas del mismo servicio.
 */
@Component({
  selector: 'km-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: {
    '[style.--h]': 'hue()',
    '[style.--s.px]': 'size()',
    '[style.--bh]': 'brand() ? "#" + brand()!.hex : null',
    '[style.--ink]': 'ink()',
    '[class.brand]': '!!brand()',
    '[class.dark-brand]': 'darkBrand()',
  },
  template: `
    @if (brand()?.path; as p) {
      <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="p" /></svg>
    } @else if (letters(); as l) {
      <span class="l">{{ l }}</span>
    } @else {
      <km-icon [name]="entry().kind" [size]="size() * 0.46" />
    }
    @if (ring(); as r) { <i class="space" [style.background]="r"></i> }
    @if (badge() > 1) { <b class="badge">{{ badge() }}</b> }
  `,
  styles: `
    :host {
      position: relative; width: var(--s); height: var(--s); flex: none;
      border-radius: calc(var(--s) * 0.28);
      display: grid; place-items: center;
      background: linear-gradient(150deg, hsl(var(--h) 36% 32%), hsl(calc(var(--h) + 25) 40% 20%));
      color: hsl(var(--h) 70% 87%);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.1), inset 0 0 0 1px rgba(255,255,255,.04), 0 4px 12px -6px rgba(0,0,0,.5);
      font-family: var(--font-display); font-weight: 620;
      font-size: calc(var(--s) * 0.42); letter-spacing: -0.02em; line-height: 1;
      user-select: none;
    }
    :host(.brand) {
      background: linear-gradient(160deg, rgba(255,255,255,.2), transparent 55%), var(--bh);
      color: var(--ink);
      font-family: var(--font-ui); font-weight: 750; font-size: calc(var(--s) * 0.36);
    }
    :host(.dark-brand) { box-shadow: inset 0 0 0 1px rgba(255,255,255,.16), inset 0 1px 0 rgba(255,255,255,.12), 0 4px 12px -6px rgba(0,0,0,.5); }
    svg { width: 54%; height: 54%; fill: currentColor; }
    .space {
      position: absolute; right: -3px; bottom: -3px; width: max(10px, calc(var(--s) * 0.26)); height: max(10px, calc(var(--s) * 0.26));
      border-radius: 50%; border: 2.5px solid var(--avatar-cut, var(--bg));
    }
    .badge {
      position: absolute; top: -6px; right: -7px; min-width: 21px; height: 21px; padding: 0 5px; border-radius: 11px;
      display: grid; place-items: center; background: var(--text); color: var(--bg);
      font: 750 11.5px/1 var(--font-ui); border: 2px solid var(--avatar-cut, var(--bg));
    }
  `,
})
export class Avatar {
  private brands = inject(Brands);
  readonly entry = input.required<Entry>();
  /** Color del espacio (punto en la esquina). */
  readonly ring = input<string | null>(null);
  readonly size = input(44);
  /** Cuántas cuentas hay en el grupo (se muestra si > 1). */
  readonly badge = input(0);
  /** Forzar una marca (vista previa del editor). undefined = detectarla. */
  readonly brandOverride = input<Brand | null | undefined>(undefined);

  protected readonly brand = computed(() => {
    const o = this.brandOverride();
    return o !== undefined ? o : this.brands.forEntry(this.entry());
  });
  protected readonly ink = computed(() => (this.brand() ? inkFor(this.brand()!.hex) : null));
  /** Logos casi negros (GitHub, X, Apple) necesitan un borde sobre fondo oscuro. */
  protected readonly darkBrand = computed(() => !!this.brand() && parseInt(this.brand()!.hex, 16) < 0x333333);

  protected readonly letters = computed(() => {
    const e = this.entry();
    const b = this.brand();
    if (b) return monogram(b.title);
    if (e.kind !== 'login' && e.kind !== 'note') return '';
    return monogram(e.title || iconDomain(e) || '');
  });

  protected readonly hue = computed(() => {
    const e = this.entry();
    const seed = iconDomain(e) ?? e.title ?? e.kind;
    let h = 0;
    for (const ch of seed.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  });
}

export function monogram(t: string): string {
  t = t.trim();
  if (!t) return '';
  const words = t.split(/[\s·._-]+/).filter(Boolean);
  return (words.length > 1 && words[1][0] && /[a-z0-9]/i.test(words[1][0]) && words[0].length < 4 ? words[0][0] + words[1][0] : t.slice(0, 1)).toUpperCase();
}
