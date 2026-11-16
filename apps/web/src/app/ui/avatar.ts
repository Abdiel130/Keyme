import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { iconDomain, type Entry, type IconStyle } from '@keyme/models';
import { Brands, inkFor, type Brand } from '../core/brands';
import { Icons } from '../core/icons';
import { Icon } from './icon';

/**
 * Ícono del elemento, al estilo de un ícono de app. En orden:
 * 1. Logo empaquetado con la app (simple-icons curado: GitHub, Docker, EA…).
 * 2. Logo del catálogo completo de simple-icons, buscado por coincidencia.
 * 3. Ícono oficial del sitio, que descarga nuestro servidor (core/icons.ts),
 *    para lo que ningún catálogo tiene (BBVA, Disney+, Banamex…).
 * 4. Monograma con el color de la marca o un color estable.
 * Cada cuenta puede fijar uno a mano (`Entry.iconStyle`); si el elegido no
 * está disponible se usa el orden automático.
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
    '[class.dark-brand]': 'darkBrand() && !favicon()',
    '[class.fav]': '!!favicon()',
    '[class.touch]': 'fill()',
    '[class.small]': '!!favicon()?.small && !fill()',
  },
  template: `
    @if (favicon(); as f) {
      <img [src]="f.src" alt="" draggable="false" (error)="broken.set(f.src)" (load)="inspect($event, f.src)" />
    } @else if (mode() === 'library' && brand()?.path; as p) {
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
    :host(.fav) { background: #fff; }
    :host(.fav) img { width: 66%; height: 66%; object-fit: contain; user-select: none; }
    /* Raster chico (32-64 px): más pequeño se ve nítido en lugar de borroso. */
    :host(.fav.small) img { width: 54%; height: 54%; }
    /* apple-touch-icon: ya es un cuadrado con su fondo, ocupa todo el ícono. */
    :host(.fav.touch) img { width: 100%; height: 100%; object-fit: cover; border-radius: inherit; }
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
  private icons = inject(Icons);
  readonly entry = input.required<Entry>();
  /** Color del espacio (punto en la esquina). */
  readonly ring = input<string | null>(null);
  readonly size = input(44);
  /** Cuántas cuentas hay en el grupo (se muestra si > 1). */
  readonly badge = input(0);
  /** Forzar una marca (vista previa del editor). undefined = detectarla. */
  readonly brandOverride = input<Brand | null | undefined>(undefined);
  /** Forzar un estilo (vista previa del selector de ícono). null = el de la cuenta. */
  readonly variant = input<IconStyle | 'auto' | null>(null);

  /** Marca conocida por la app (puede venir sin logo: solo nombre y color). */
  private readonly known = computed(() => {
    const o = this.brandOverride();
    return o !== undefined ? o : this.brands.forEntry(this.entry());
  });
  /** Ícono que el navegador no pudo dibujar o salió diminuto: se cae al siguiente. */
  protected readonly broken = signal('');
  /** Logo de la librería: empaquetado o, si no, del catálogo completo. */
  private readonly library = computed(() => {
    const k = this.known();
    if (k?.path) return k;
    return this.brandOverride() !== undefined ? null : this.icons.logoFor(this.entry());
  });
  private readonly site = computed(() => {
    const f = this.icons.faviconFor(this.entry(), this.brandOverride());
    return f && f.src !== this.broken() ? f : null;
  });
  /** Lo que se dibuja: el estilo elegido si existe, si no el orden automático. */
  protected readonly mode = computed<IconStyle>(() => {
    const want = this.variant() ?? this.entry().iconStyle ?? 'auto';
    if (want === 'letter') return 'letter';
    if (want === 'site' && this.site()) return 'site';
    if (want === 'library' && this.library()) return 'library';
    return this.library() ? 'library' : this.site() ? 'site' : 'letter';
  });
  protected readonly favicon = computed(() => (this.mode() === 'site' ? this.site() : null));
  protected readonly brand = computed(() => this.library() ?? this.known());
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

  /** Íconos con fondo propio (esquinas opacas) que ya se revisaron: ocupan todo el cuadro. */
  protected readonly opaque = signal('');
  protected readonly fill = computed(() => {
    const f = this.favicon();
    return !!f && (f.touch || this.opaque() === f.src);
  });

  /**
   * Revisa la imagen ya cargada: si sale diminuta se descarta, y si es un
   * cuadrado con fondo propio (como el ícono de una app) se dibuja a sangre en
   * lugar de ponerle un marco blanco alrededor.
   */
  protected inspect(ev: Event, src: string): void {
    const img = ev.target as HTMLImageElement;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w && w < 24) return this.broken.set(src);
    if (!w || w < 96 || Math.abs(w - h) > 2) return;
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 16;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, 16, 16);
      const px = ctx.getImageData(0, 0, 16, 16).data;
      const alpha = (x: number, y: number) => px[(y * 16 + x) * 4 + 3];
      // Esquinas y bordes: si todos son opacos, el ícono trae su propio fondo.
      const edge = [[0, 0], [15, 0], [0, 15], [15, 15], [8, 0], [0, 8], [15, 8], [8, 15]];
      if (edge.every(([x, y]) => alpha(x, y) > 240)) this.opaque.set(src);
    } catch {
      // Lienzo no disponible: se queda con marco.
    }
  }

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
  const m = (words.length > 1 && words[1][0] && /[a-z0-9]/i.test(words[1][0]) && words[0].length < 4 ? words[0][0] + words[1][0] : t.slice(0, 1)).toUpperCase();
  // "Disney+", "Paramount+": el "+" es parte de la marca.
  return m.length === 1 && /\w\+$/.test(t) ? m + '+' : m;
}
