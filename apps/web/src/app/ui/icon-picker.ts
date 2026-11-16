import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal, type OnInit } from '@angular/core';
import type { Entry, IconStyle } from '@keyme/models';
import { Icons } from '../core/icons';
import { Avatar } from './avatar';

export type IconChoice = 'auto' | IconStyle;

export function iconStyleLabel(v: IconStyle | undefined): string {
  return v === 'library' ? 'Librería' : v === 'site' ? 'Oficial' : v === 'letter' ? 'Simple' : 'Automático';
}

/**
 * Selector del ícono de una cuenta: muestra cómo se vería con cada opción.
 * Las que no existen para esa marca salen deshabilitadas. El ícono oficial se
 * pide al servidor al abrir, aunque la cuenta use el de la librería.
 */
@Component({
  selector: 'km-icon-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar],
  template: `
    <h2>Ícono de “{{ entry().title || 'Sin título' }}”</h2>
    <p class="muted small">Elige cómo se ve esta cuenta en la lista. Automático usa la librería, luego el ícono oficial y al final el monograma.</p>
    <div class="grid">
      @for (o of options(); track o.value) {
        <button class="opt" [class.on]="(entry().iconStyle ?? 'auto') === o.value" [disabled]="!o.available" (click)="picked.emit(o.value)">
          <km-avatar [entry]="entry()" [size]="64" [variant]="o.value" />
          <b>{{ o.label }}</b>
          <span class="faint tiny">{{ o.note }}</span>
        </button>
      }
    </div>
  `,
  styles: `
    :host { display: block; padding: 6px 4px 4px; }
    h2 { margin: 0 0 4px; font-size: 20px; }
    p { margin: 0 0 16px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    @media (min-width: 560px) { .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
    .opt {
      display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 8px 12px; border-radius: 18px; cursor: pointer;
      background: var(--surface); border: 1.5px solid var(--line); color: var(--text); font: 600 14px var(--font-ui); text-align: center;
      --avatar-cut: var(--surface);
      transition: transform .25s var(--spring), border-color .2s, background .2s;
    }
    .opt b { margin-top: 2px; }
    @media (hover: hover) { .opt:hover:not(:disabled) { border-color: var(--line-strong); } }
    .opt:active:not(:disabled) { transform: scale(.95); transition-duration: .08s; }
    .opt.on { border-color: var(--accent); background: color-mix(in oklab, var(--accent) 10%, var(--surface)); }
    .opt:disabled { cursor: default; opacity: .45; }
  `,
})
export class IconPicker implements OnInit {
  private icons = inject(Icons);
  readonly entry = input.required<Entry>();
  readonly picked = output<IconChoice>();

  /** Estado del ícono oficial mientras el servidor lo busca. */
  private readonly site = signal<'loading' | 'ok' | 'none'>('loading');

  protected readonly options = computed(() => {
    const lib = this.icons.hasLibrary(this.entry());
    const site = this.site();
    return [
      { value: 'auto' as const, label: 'Automático', note: 'El mejor disponible', available: true },
      { value: 'library' as const, label: 'Librería', note: lib ? 'Logo de simple-icons' : 'No hay logo para esta marca', available: lib },
      {
        value: 'site' as const, label: 'Oficial',
        note: site === 'loading' ? 'Buscando en el sitio…' : site === 'ok' ? 'Ícono del sitio' : 'El sitio no tiene uno usable',
        available: site === 'ok',
      },
      { value: 'letter' as const, label: 'Simple', note: 'Inicial con el color de la marca', available: true },
    ];
  });

  ngOnInit(): void {
    const e = this.entry();
    if (this.icons.faviconFor(e)) return this.site.set('ok');
    this.icons.ensureSite(e).then(
      (ok) => this.site.set(ok ? 'ok' : 'none'),
      () => this.site.set('none'),
    );
  }
}
