import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { iconDomain, type Entry } from '@keyme/models';
import { Icon } from './icon';

/**
 * Monograma del elemento. No se piden favicons a terceros: eso le diría a
 * Google qué sitios tienes. El color sale del dominio (estable) y el espacio
 * se marca con un anillo.
 */
@Component({
  selector: 'km-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: { '[style.--h]': 'hue()', '[style.--ring]': 'ring() || "transparent"', '[style.--s.px]': 'size()', '[class.big]': 'size() > 48' },
  template: `
    @if (letters(); as l) {
      <span class="mono-l">{{ l }}</span>
    } @else {
      <km-icon [name]="entry().kind" [size]="size() * 0.46" />
    }
  `,
  styles: `
    :host {
      width: var(--s); height: var(--s); flex: none;
      border-radius: calc(var(--s) * 0.3);
      display: grid; place-items: center;
      background: linear-gradient(145deg, hsl(var(--h) 38% 30%), hsl(calc(var(--h) + 25) 42% 21%));
      color: hsl(var(--h) 70% 86%);
      box-shadow: 0 0 0 2px var(--bg), 0 0 0 3.5px var(--ring), inset 0 1px 0 rgba(255,255,255,.08);
      font-family: var(--font-display); font-weight: 600;
      font-size: calc(var(--s) * 0.42); letter-spacing: -0.02em;
      user-select: none;
    }
    :host(.big) { box-shadow: 0 0 0 3px var(--bg), 0 0 0 5px var(--ring), inset 0 1px 0 rgba(255,255,255,.08); }
  `,
})
export class Avatar {
  readonly entry = input.required<Entry>();
  readonly ring = input<string | null>(null);
  readonly size = input(38);

  protected readonly letters = computed(() => {
    const e = this.entry();
    if (e.kind !== 'login' && e.kind !== 'note') return '';
    const t = (e.title || iconDomain(e) || '').trim();
    if (!t) return '';
    const words = t.split(/[\s·._-]+/).filter(Boolean);
    return (words.length > 1 && words[1][0] && /[a-z0-9]/i.test(words[1][0]) && words[0].length < 4
      ? words[0][0] + words[1][0]
      : t.slice(0, 1)
    ).toUpperCase();
  });

  protected readonly hue = computed(() => {
    const e = this.entry();
    const seed = iconDomain(e) ?? e.title ?? e.kind;
    let h = 0;
    for (const ch of seed.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  });
}
