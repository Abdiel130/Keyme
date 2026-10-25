import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { strength } from '../core/strength';

@Component({
  selector: 'km-strength',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bars" [attr.data-score]="s().score">
      @for (i of [0, 1, 2, 3]; track i) {
        <span [class.on]="value() && s().score > i"></span>
      }
    </div>
    @if (value()) {
      <div class="meta">
        <b>{{ s().label }}</b>
        @if (s().crackTime && detail()) {
          <span class="faint"> · descifrarla tomaría {{ s().crackTime }}</span>
        }
      </div>
      @if (detail() && (s().warning || s().suggestions.length)) {
        <div class="hint">{{ s().warning || s().suggestions[0] }}</div>
      }
    }
  `,
  styles: `
    :host { display: block; }
    .bars { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
    .bars span { height: 4px; border-radius: 4px; background: var(--surface-3); transition: background .25s; }
    [data-score='0'] .on, [data-score='1'] .on { background: var(--danger); }
    [data-score='2'] .on { background: var(--warn); }
    [data-score='3'] .on { background: var(--ok); }
    [data-score='4'] .on { background: var(--accent); }
    .meta { margin-top: 7px; font-size: 12.5px; color: var(--text-2); }
    .meta b { color: var(--text); font-weight: 600; }
    .hint { font-size: 12.5px; color: var(--text-3); margin-top: 2px; }
  `,
})
export class StrengthMeter {
  readonly value = input('');
  readonly inputs = input<string[]>([]);
  readonly detail = input(true);
  protected readonly s = computed(() => strength(this.value(), this.inputs()));
}
