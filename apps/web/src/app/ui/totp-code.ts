import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { Clipboard } from '../core/clipboard.service';
import { parseTotp, totpNow } from '../core/totp';
import { Icon } from './icon';

@Component({
  selector: 'km-totp',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    @if (info(); as i) {
      <button class="totp" type="button" (click)="copy()" title="Copiar código">
        <span class="label">Código de verificación (2FA)</span>
        <span class="code mono">{{ now().code.slice(0, 3) }}<i></i>{{ now().code.slice(3) }}</span>
        <svg class="ring" viewBox="0 0 36 36" [class.low]="now().remaining <= 5">
          <circle cx="18" cy="18" r="15" />
          <circle cx="18" cy="18" r="15" class="arc" [attr.stroke-dashoffset]="94.25 * (1 - now().remaining / now().period)" />
          <text x="18" y="22.5">{{ now().remaining }}</text>
        </svg>
        <km-icon name="copy" [size]="16" class="cp" />
      </button>
    } @else {
      <p class="faint small">El secreto TOTP no es válido.</p>
    }
  `,
  styles: `
    .totp { width: 100%; display: grid; grid-template-columns: 1fr auto auto; grid-template-rows: auto auto; align-items: center; column-gap: 14px; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface-2); color: inherit; cursor: pointer; text-align: left; font: inherit; }
    .totp:hover { border-color: var(--accent); }
    .label { grid-column: 1; font-size: 12px; color: var(--text-3); font-weight: 550; }
    .code { grid-column: 1; grid-row: 2; font-size: 26px; letter-spacing: .1em; color: var(--accent); }
    .code i { display: inline-block; width: 10px; }
    .ring { grid-row: 1 / 3; grid-column: 2; width: 38px; height: 38px; transform: rotate(-90deg); }
    .ring circle { fill: none; stroke: var(--surface-3); stroke-width: 3; }
    .ring .arc { stroke: var(--accent); stroke-dasharray: 94.25; stroke-linecap: round; transition: stroke-dashoffset 1s linear; }
    .ring.low .arc { stroke: var(--danger); }
    .ring text { transform: rotate(90deg); transform-origin: 18px 18px; fill: var(--text-2); font: 600 11px var(--font-ui); text-anchor: middle; }
    .cp { grid-row: 1 / 3; grid-column: 3; color: var(--text-3); }
  `,
})
export class TotpCode {
  private clipboard = inject(Clipboard);
  readonly secret = input.required<string>();
  protected readonly info = computed(() => parseTotp(this.secret()));
  private readonly tick = signal(Date.now());
  protected readonly now = computed(() => totpNow(this.info()!, this.tick()));

  constructor() {
    const t = setInterval(() => this.tick.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }

  copy(): void {
    void this.clipboard.copy(this.now().code, 'Código copiado');
  }
}
