import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Toasts } from '../core/toasts';
import { Icon } from './icon';

@Component({
  selector: 'km-toasts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    @for (t of toasts.items(); track t.id) {
      <div class="toast" [class]="t.tone" role="status">
        <km-icon [name]="t.tone === 'error' ? 'alert' : t.tone === 'info' ? 'info' : 'check'" [size]="16" />
        <span>{{ t.text }}</span>
        @if (t.countdown) {
          <span class="count" [style.animation-duration.s]="t.countdown">se borra en {{ t.countdown }} s</span>
        }
        @if (t.action; as a) {
          <button class="btn sm ghost" (click)="a.run(); toasts.dismiss(t.id)">{{ a.label }}</button>
        }
      </div>
    }
  `,
  styles: `
    :host { position: fixed; z-index: 90; left: 50%; bottom: 24px; transform: translateX(-50%); display: flex; flex-direction: column; gap: 8px; align-items: center; pointer-events: none; }
    .toast { pointer-events: auto; display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-radius: 18px; background: var(--surface-3); border: 1px solid var(--line-strong); box-shadow: var(--shadow-lg); font-size: 15px; font-weight: 550; animation: toast-in .4s var(--spring); white-space: nowrap; }
    @keyframes toast-in { from { opacity: 0; transform: translateY(16px) scale(.9); } }
    .toast.ok km-icon { color: var(--ok); }
    .toast.error km-icon { color: var(--danger); }
    .count { font-size: 12px; color: var(--text-3); padding-left: 10px; border-left: 1px solid var(--line-strong); }
    @media (max-width: 860px) { :host { bottom: calc(92px + env(safe-area-inset-bottom)); } }
  `,
})
export class ToastsOutlet {
  protected toasts = inject(Toasts);
}
