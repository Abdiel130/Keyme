import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Clipboard } from '../core/clipboard.service';
import { Icon } from './icon';

/**
 * Fila de dato: tocarla copia y confirma con una palomita. Si es secreta se
 * muestra con puntos y el ojo la revela (dígitos y símbolos resaltados).
 */
@Component({
  selector: 'km-secret-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: { '[class.done]': 'done()', '[class.big]': 'big()' },
  template: `
    @if (icon()) { <span class="ic"><km-icon [name]="icon()!" [size]="19" /></span> }
    <button class="row" type="button" (click)="copy()" [title]="'Copiar ' + label().toLowerCase()">
      <span class="label">{{ label() }}</span>
      <span class="value" [class.mono]="mono() || secret()" [class.hidden]="secret() && !shown()">
        @if (secret() && !shown()) {
          {{ dots() }}
        } @else if (secret()) {
          @for (ch of chars(); track $index) { <span [class]="cls(ch)">{{ ch }}</span> }
        } @else {
          {{ display() }}
        }
      </span>
    </button>
    <div class="actions">
      <ng-content />
      @if (secret()) {
        <button class="btn icon ghost" type="button" (click)="shown.set(!shown())" [title]="shown() ? 'Ocultar' : 'Mostrar'" [attr.aria-label]="shown() ? 'Ocultar' : 'Mostrar'">
          <km-icon [name]="shown() ? 'eye-off' : 'eye'" [size]="19" />
        </button>
      }
      <button class="btn icon ghost cp" type="button" (click)="copy()" title="Copiar" aria-label="Copiar">
        <km-icon [name]="done() ? 'check' : 'copy'" [size]="19" />
      </button>
    </div>
    @if (done()) { <span class="toast-in">Copiado</span> }
  `,
  styles: `
    :host { position: relative; display: flex; align-items: center; gap: 4px; padding: 4px 6px 4px 4px; border-radius: 14px; transition: background .2s; }
    @media (hover: hover) { :host(:hover) { background: var(--surface-2); } }
    :host(:active) { background: var(--surface-2); }
    .ic { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: var(--surface-2); color: var(--text-3); flex: none; margin-left: 6px; }
    .row { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 10px 12px; background: none; border: 0; color: inherit; cursor: pointer; text-align: left; border-radius: 12px; font: inherit; }
    .label { font-size: 13px; color: var(--text-3); font-weight: 600; }
    .value { font-size: 17px; color: var(--text); word-break: break-all; white-space: pre-wrap; line-height: 1.4; }
    :host(.big) .value { font-size: 19px; }
    .value.mono { font-size: 16.5px; }
    .value.hidden { letter-spacing: .1em; color: var(--text-2); white-space: nowrap; overflow: hidden; }
    .value .d { color: var(--accent); }
    .value .s { color: #e58f73; }
    .actions { display: flex; gap: 2px; }
    :host(.done) .cp { color: var(--ok); }
    :host(.done) .cp km-icon { animation: pop .3s var(--spring); }
    .toast-in { position: absolute; right: 54px; top: 50%; translate: 0 -50%; padding: 4px 10px; border-radius: 10px; background: var(--ok-soft); color: var(--ok); font: 650 12.5px var(--font-ui); pointer-events: none; animation: pop .3s var(--spring); }
  `,
})
export class SecretRow {
  private clipboard = inject(Clipboard);
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly secret = input(false);
  readonly mono = input(false);
  readonly big = input(false);
  readonly icon = input<string | null>(null);
  readonly format = input<((v: string) => string) | null>(null);
  readonly copied = output<void>();
  protected readonly shown = signal(false);
  protected readonly done = signal(false);
  private timer?: ReturnType<typeof setTimeout>;

  protected readonly display = computed(() => (this.format() ? this.format()!(this.value()) : this.value()));
  protected readonly dots = computed(() => '•'.repeat(Math.min(Math.max(this.value().length, 8), 12)));
  protected readonly chars = computed(() => [...this.display()]);

  protected cls(ch: string): string {
    return /\d/.test(ch) ? 'd' : /[a-zñ]/i.test(ch) || ch === ' ' ? '' : 's';
  }

  copy(): void {
    void this.clipboard.copy(this.value(), `Copiado · ${this.label()}`, this.secret());
    this.copied.emit();
    this.done.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.done.set(false), 1500);
    navigator.vibrate?.(10);
  }
}
