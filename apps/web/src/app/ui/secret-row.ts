import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Clipboard } from '../core/clipboard.service';
import { Icon } from './icon';

/** Fila de dato con copiar y (si es secreto) revelar. Click en la fila = copiar. */
@Component({
  selector: 'km-secret-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <button class="row" type="button" (click)="copy()" [title]="'Copiar ' + label().toLowerCase()">
      <span class="label">{{ label() }}</span>
      <span class="value" [class.mono]="mono() || secret()" [class.hidden]="secret() && !shown()">
        @if (secret() && !shown()) {
          {{ dots() }}
        } @else {
          {{ display() }}
        }
      </span>
    </button>
    <div class="actions">
      <ng-content />
      @if (secret()) {
        <button class="btn icon sm ghost" type="button" (click)="shown.set(!shown())" [title]="shown() ? 'Ocultar' : 'Mostrar'">
          <km-icon [name]="shown() ? 'eye-off' : 'eye'" [size]="16" />
        </button>
      }
      <button class="btn icon sm ghost" type="button" (click)="copy()" title="Copiar"><km-icon name="copy" [size]="16" /></button>
    </div>
  `,
  styles: `
    :host { display: flex; align-items: center; gap: 6px; padding: 4px 6px 4px 0; border-radius: 12px; transition: background .15s; }
    :host(:hover) { background: var(--surface-2); }
    .row { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 8px 14px; background: none; border: 0; color: inherit; cursor: pointer; text-align: left; border-radius: 10px; font: inherit; }
    .label { font-size: 12px; color: var(--text-3); font-weight: 550; }
    .value { font-size: 15.5px; color: var(--text); word-break: break-all; white-space: pre-wrap; line-height: 1.4; }
    .value.mono { font-size: 15px; }
    .value.hidden { letter-spacing: .12em; color: var(--text-2); }
    .actions { display: flex; gap: 2px; opacity: .55; transition: opacity .15s; }
    :host(:hover) .actions, .actions:focus-within { opacity: 1; }
    @media (hover: none) { .actions { opacity: 1; } }
  `,
})
export class SecretRow {
  private clipboard = inject(Clipboard);
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly secret = input(false);
  readonly mono = input(false);
  readonly format = input<((v: string) => string) | null>(null);
  readonly copied = output<void>();
  protected readonly shown = signal(false);

  protected readonly display = computed(() => (this.format() ? this.format()!(this.value()) : this.value()));
  protected readonly dots = computed(() => '•'.repeat(Math.min(Math.max(this.value().length, 8), 18)));

  copy(): void {
    void this.clipboard.copy(this.value(), `${this.label()} copiado`, this.secret());
    this.copied.emit();
  }
}
