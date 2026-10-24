import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { digitsOnly, formatCard, type CardEntry } from '@keyme/models';

const NETWORK_LABEL: Record<string, string> = { visa: 'VISA', mastercard: 'mastercard', amex: 'AMEX', discover: 'DISCOVER', carnet: 'Carnet', other: '' };

/** Tarjeta física dibujada. Los datos quedan ocultos salvo que `revealed`. */
@Component({
  selector: 'km-card-visual',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.--h]': 'hue()', '[class.compact]': 'compact()' },
  template: `
    <div class="face">
      <div class="top">
        <span class="bank">{{ card().bank || card().title || 'Tarjeta' }}</span>
        @if (card().dynamicCvv) { <span class="dyn">CVV dinámico</span> }
      </div>
      <div class="chip-row"><span class="emv"></span><span class="nfc">)))</span></div>
      <div class="num mono">{{ number() }}</div>
      <div class="bottom">
        <div><span class="lbl">Titular</span><span class="val">{{ card().holder || '—' }}</span></div>
        <div><span class="lbl">Vence</span><span class="val mono">{{ card().expiry || '••/••' }}</span></div>
        <span class="net" [attr.data-n]="card().network">
          @if (card().network === 'mastercard') { <i></i><i></i> } @else { {{ net() }} }
        </span>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; width: 100%; max-width: 400px; aspect-ratio: 1.586; container-type: inline-size; }
    .face {
      position: relative; height: 100%; border-radius: 6cqw; padding: 6cqw 7cqw; display: flex; flex-direction: column; overflow: hidden;
      color: hsl(var(--h) 40% 94%);
      background:
        radial-gradient(120% 90% at 100% 0%, hsl(calc(var(--h) + 30) 60% 55% / .55), transparent 55%),
        radial-gradient(90% 80% at 0% 100%, hsl(calc(var(--h) - 20) 55% 35% / .7), transparent 60%),
        linear-gradient(135deg, hsl(var(--h) 45% 28%), hsl(calc(var(--h) + 20) 40% 14%));
      box-shadow: 0 24px 48px -20px hsl(var(--h) 60% 10% / .9), inset 0 1px 0 rgba(255,255,255,.18), inset 0 0 0 1px rgba(255,255,255,.06);
    }
    .face::after { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(115deg, rgba(255,255,255,.035) 0 2px, transparent 2px 9px); pointer-events: none; }
    .top { display: flex; justify-content: space-between; align-items: center; }
    .bank { font-family: var(--font-display); font-size: 6cqw; font-weight: 600; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dyn { font-size: 2.8cqw; text-transform: uppercase; letter-spacing: .1em; padding: .8cqw 2cqw; border-radius: 9cqw; background: rgba(255,255,255,.14); }
    .chip-row { display: flex; align-items: center; gap: 3cqw; margin-top: auto; }
    .emv { width: 11cqw; height: 8.5cqw; border-radius: 1.6cqw; background: linear-gradient(135deg, #e9cf8f, #b58d3e 60%, #f3dea4); box-shadow: inset 0 0 0 .4cqw rgba(0,0,0,.18); }
    .nfc { font-size: 4cqw; opacity: .6; transform: scaleX(.6); letter-spacing: -.5cqw; }
    .num { font-size: 6.4cqw; letter-spacing: .08em; margin: 3.5cqw 0 3cqw; text-shadow: 0 1px 0 rgba(0,0,0,.35); white-space: nowrap; }
    .bottom { display: flex; align-items: flex-end; gap: 6cqw; }
    .bottom > div { display: flex; flex-direction: column; min-width: 0; }
    .lbl { font-size: 2.6cqw; text-transform: uppercase; letter-spacing: .14em; opacity: .65; }
    .val { font-size: 3.9cqw; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 42cqw; text-transform: uppercase; }
    .net { margin-left: auto; font-weight: 800; font-style: italic; font-size: 5.6cqw; letter-spacing: -.02em; display: flex; }
    .net[data-n='mastercard'] i { width: 8cqw; height: 8cqw; border-radius: 50%; background: #eb5a3c; display: block; }
    .net[data-n='mastercard'] i + i { background: #f5a524; margin-left: -3.2cqw; mix-blend-mode: screen; }
  `,
})
export class CardVisual {
  readonly card = input.required<CardEntry>();
  readonly revealed = input(false);
  readonly compact = input(false);

  protected readonly number = computed(() => {
    const n = digitsOnly(this.card().number);
    if (!n) return '•••• •••• •••• ••••';
    if (this.revealed()) return formatCard(n);
    return `•••• •••• •••• ${n.slice(-4)}`;
  });
  protected readonly net = computed(() => NETWORK_LABEL[this.card().network] ?? '');
  protected readonly hue = computed(() => {
    const c = this.card();
    if (typeof c.hue === 'number') return c.hue;
    let h = 20;
    for (const ch of (c.bank || c.title || '').toLowerCase()) h = (h * 33 + ch.charCodeAt(0)) % 360;
    return h;
  });
}
