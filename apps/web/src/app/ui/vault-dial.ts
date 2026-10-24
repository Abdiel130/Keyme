import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** El "dial" de la bóveda: gira mientras Argon2id deriva la llave. */
@Component({
  selector: 'km-dial',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.busy]': 'busy()', '[class.open]': 'open()', '[class.error]': 'error()' },
  template: `
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <radialGradient id="kmglow" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity=".35" />
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="96" fill="url(#kmglow)" />
      <g class="outer">
        <circle cx="100" cy="100" r="78" fill="none" stroke="var(--line-strong)" stroke-width="1.2" />
        @for (t of ticks; track t) {
          <line x1="100" y1="25" x2="100" [attr.y2]="t % 5 === 0 ? 35 : 30" [attr.transform]="'rotate(' + t * 6 + ' 100 100)'"
                stroke="var(--text-3)" [attr.stroke-width]="t % 5 === 0 ? 1.6 : 0.9" stroke-linecap="round" />
        }
      </g>
      <g class="inner">
        <circle cx="100" cy="100" r="52" fill="var(--surface)" stroke="var(--line-strong)" stroke-width="1.2" />
        <circle cx="100" cy="100" r="40" fill="none" stroke="var(--accent)" stroke-opacity=".5" stroke-width="1" stroke-dasharray="3 6" />
        <line x1="100" y1="58" x2="100" y2="70" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" />
      </g>
      <g class="core">
        <rect x="86" y="96" width="28" height="22" rx="5" fill="var(--accent)" />
        <path class="shackle" d="M91 96v-6a9 9 0 0 1 18 0v6" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" />
        <circle cx="100" cy="106" r="3" fill="var(--accent-ink)" />
      </g>
    </svg>
  `,
  styles: `
    :host { display: block; width: var(--dial, 180px); aspect-ratio: 1; }
    svg { width: 100%; height: 100%; overflow: visible; }
    .outer, .inner { transform-origin: 100px 100px; transition: transform 1.2s var(--ease); }
    :host(.busy) .outer { animation: spin 6s linear infinite reverse; }
    :host(.busy) .inner { animation: spin 1.6s cubic-bezier(.6,.1,.4,.9) infinite; }
    .shackle { transition: transform .4s var(--ease); transform-origin: 109px 96px; }
    :host(.open) .shackle { transform: translateY(-6px) rotate(25deg); }
    :host(.open) .inner { transform: rotate(200deg); }
    :host(.error) svg { animation: shake .4s; }
    @keyframes shake { 20%,60% { transform: translateX(-8px); } 40%,80% { transform: translateX(8px); } }
  `,
})
export class VaultDial {
  readonly busy = input(false);
  readonly open = input(false);
  readonly error = input(false);
  protected readonly ticks = Array.from({ length: 60 }, (_, i) => i);
}
