import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { digitsOnly, formatCard, type CardEntry } from '@keyme/models';
import { Brands, hueOf, inkFor } from '../core/brands';
import { Clipboard } from '../core/clipboard.service';
import { Icon } from './icon';

/** Solo VISA se dibuja con su logo; Mastercard con sus círculos y el resto con texto. */
const NETWORK_KEY: Record<string, string> = { visa: 'visa' };
const NETWORK_LABEL: Record<string, string> = { visa: 'VISA', mastercard: 'mastercard', amex: 'AMEX', discover: 'DISCOVER', carnet: 'Carnet', other: '' };

/**
 * Tarjeta física dibujada, con frente y reverso. Los datos van ocultos salvo
 * que `revealed`; aun ocultos se copian tocándolos. Con `tilt` responde al
 * puntero con un poco de perspectiva y brillo.
 */
@Component({
  selector: 'km-card-visual',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: {
    '[style.--h]': 'hue()',
    '[class.flipped]': 'flipped()',
    '[class.compact]': 'compact()',
    '[style.--rx.deg]': 'rx()',
    '[style.--ry.deg]': 'ry()',
    '[style.--gx.%]': 'gx()',
    '(pointermove)': 'move($event)',
    '(pointerleave)': 'leave()',
  },
  template: `
    <div class="flip">
      <div class="face front">
        <div class="top">
          @if (bank(); as b) {
            <span class="logo" [style.background]="'#' + b.hex" [style.color]="ink()">
              @if (b.path) { <svg viewBox="0 0 24 24"><path [attr.d]="b.path" /></svg> } @else { {{ b.title.slice(0, 1) }} }
            </span>
          }
          <span class="bank">{{ card().bank || card().title || 'Tarjeta' }}</span>
          @if (card().dynamicCvv) { <span class="dyn"><km-icon name="zap" [size]="11" /> CVV dinámico</span> }
        </div>
        <div class="chip-row"><span class="emv"></span><svg class="nfc" viewBox="0 0 24 24"><path d="M8 7a7 7 0 0 1 0 10M12 4.5a11 11 0 0 1 0 15M4 9.5a3.5 3.5 0 0 1 0 5" /></svg></div>
        <button type="button" class="num mono copyable" (click)="copy($event, 'number')" [attr.tabindex]="interactive() ? 0 : -1">
          {{ number() }}
          @if (interactive()) { <km-icon name="copy" [size]="14" class="ci" /> }
        </button>
        <div class="bottom">
          <div><span class="lbl">Titular</span><span class="val">{{ card().holder || '—' }}</span></div>
          <button type="button" class="copyable exp" (click)="copy($event, 'expiry')" [attr.tabindex]="interactive() ? 0 : -1">
            <span class="lbl">Vence</span><span class="val mono">{{ card().expiry || '••/••' }}</span>
          </button>
          <span class="net" [attr.data-n]="card().network">
            @if (network(); as n) {
              <svg viewBox="0 0 24 24"><path [attr.d]="n" /></svg>
            } @else if (card().network === 'mastercard') { <i></i><i></i> } @else { {{ netLabel() }} }
          </span>
        </div>
        <span class="glare"></span>
      </div>
      <div class="face back">
        <span class="stripe"></span>
        <div class="sig">
          <span class="sig-line"></span>
          @if (card().dynamicCvv) {
            <span class="cvv dyn-cvv"><km-icon name="zap" [size]="12" /> en la app</span>
          } @else {
            <button type="button" class="cvv mono copyable" (click)="copy($event, 'cvv')" [attr.tabindex]="flipped() && interactive() ? 0 : -1">
              {{ card().cvv ? (revealed() ? card().cvv : '•••') : '—' }}
            </button>
          }
        </div>
        <div class="back-rows">
          @if (card().pin) {
            <button type="button" class="copyable pin" (click)="copy($event, 'pin')" [attr.tabindex]="flipped() && interactive() ? 0 : -1">
              <span class="lbl">NIP</span><span class="val mono">{{ revealed() ? card().pin : '••••' }}</span>
            </button>
          }
          <span class="lbl hint">{{ interactive() ? 'Toca un dato para copiarlo' : '' }}</span>
        </div>
        <span class="glare"></span>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; width: 100%; max-width: 420px; aspect-ratio: 1.586; container-type: inline-size; perspective: 1400px; --rx: 0deg; --ry: 0deg; --gx: 50%; }
    .flip {
      position: relative; height: 100%; transform-style: preserve-3d;
      transform: rotateX(var(--rx)) rotateY(calc(var(--ry) + var(--flip, 0deg)));
      transition: transform .7s var(--ease-emph);
    }
    :host(.flipped) .flip { --flip: 180deg; }
    :host(.tilting) .flip { transition: transform .12s linear; }
    .face {
      position: absolute; inset: 0; border-radius: 5.5cqw; overflow: hidden; backface-visibility: hidden; -webkit-backface-visibility: hidden;
      color: hsl(var(--h) 40% 95%);
      background:
        radial-gradient(120% 90% at 100% 0%, hsl(calc(var(--h) + 30) 62% 56% / .55), transparent 55%),
        radial-gradient(90% 80% at 0% 100%, hsl(calc(var(--h) - 20) 56% 34% / .7), transparent 60%),
        linear-gradient(135deg, hsl(var(--h) 46% 28%), hsl(calc(var(--h) + 20) 42% 13%));
      box-shadow: 0 26px 50px -22px hsl(var(--h) 60% 8% / .95), inset 0 1px 0 rgba(255,255,255,.2), inset 0 0 0 1px rgba(255,255,255,.07);
    }
    .face::after { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(115deg, rgba(255,255,255,.035) 0 2px, transparent 2px 9px); pointer-events: none; }
    .front { padding: 6cqw 7cqw; display: flex; flex-direction: column; }
    .back { transform: rotateY(180deg); display: flex; flex-direction: column; }
    .glare { position: absolute; inset: 0; pointer-events: none; z-index: 2; opacity: 0; transition: opacity .3s;
      background: radial-gradient(60% 80% at var(--gx) 0%, rgba(255,255,255,.22), transparent 60%); }
    :host(.tilting) .glare { opacity: 1; }
    .top { display: flex; align-items: center; gap: 2.6cqw; position: relative; z-index: 1; }
    .logo { width: 8.5cqw; height: 8.5cqw; border-radius: 2.2cqw; display: grid; place-items: center; flex: none; font: 800 4.4cqw var(--font-ui); box-shadow: 0 1px 0 rgba(255,255,255,.25) inset; }
    .logo svg { width: 60%; height: 60%; fill: currentColor; }
    .bank { font-family: var(--font-display); font-size: 5.8cqw; font-weight: 600; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
    .dyn { display: inline-flex; align-items: center; gap: 1cqw; font-size: 2.6cqw; font-weight: 650; text-transform: uppercase; letter-spacing: .08em; padding: 1cqw 2.2cqw; border-radius: 9cqw; background: rgba(255,255,255,.16); white-space: nowrap; }
    .chip-row { display: flex; align-items: center; gap: 3cqw; margin-top: auto; }
    .emv { width: 11cqw; height: 8.5cqw; border-radius: 1.6cqw; background: linear-gradient(135deg, #ecd393, #b58d3e 60%, #f3dea4); box-shadow: inset 0 0 0 .4cqw rgba(0,0,0,.18), inset 0 0 0 1.6cqw rgba(0,0,0,.04); }
    .nfc { width: 6cqw; height: 6cqw; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; opacity: .7; }
    .copyable { position: relative; z-index: 1; background: none; border: 0; color: inherit; font: inherit; padding: 0; text-align: left; cursor: pointer; border-radius: 1.6cqw; transition: background .15s, transform .25s var(--spring); }
    .copyable:active { transform: scale(.96); transition-duration: .08s; }
    @media (hover: hover) { .copyable:hover { background: rgba(255,255,255,.1); } }
    .num { display: flex; align-items: center; gap: 2cqw; font-size: 6.6cqw; letter-spacing: .07em; margin: 3cqw -1.5cqw 2.6cqw; padding: .6cqw 1.5cqw; text-shadow: 0 1px 0 rgba(0,0,0,.35); white-space: nowrap; align-self: flex-start; }
    .ci { opacity: .55; width: 3.6cqw !important; height: 3.6cqw !important; }
    .bottom { display: flex; align-items: flex-end; gap: 6cqw; position: relative; z-index: 1; }
    .bottom > div, .exp, .pin { display: flex; flex-direction: column; min-width: 0; }
    .exp, .pin { margin: -1cqw -1.5cqw; padding: 1cqw 1.5cqw; }
    .lbl { font-size: 2.5cqw; text-transform: uppercase; letter-spacing: .14em; opacity: .7; }
    .val { font-size: 3.9cqw; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40cqw; text-transform: uppercase; font-weight: 550; }
    .net { margin-left: auto; font-weight: 800; font-style: italic; font-size: 5.6cqw; letter-spacing: -.02em; display: flex; align-items: center; }
    .net svg { height: 9cqw; width: auto; aspect-ratio: 1; fill: currentColor; }
    .net[data-n='visa'] svg { height: 11cqw; }
    .net[data-n='mastercard'] i { width: 8cqw; height: 8cqw; border-radius: 50%; background: #eb5a3c; display: block; }
    .net[data-n='mastercard'] i + i { background: #f5a524; margin-left: -3.2cqw; mix-blend-mode: screen; }
    .stripe { height: 17cqw; margin-top: 8cqw; background: linear-gradient(#1a1410, #0c0907); }
    .sig { display: flex; align-items: center; gap: 3cqw; margin: 6cqw 7cqw 0; }
    .sig-line { flex: 1; height: 10cqw; border-radius: 1.2cqw; background: repeating-linear-gradient(-45deg, rgba(255,255,255,.85) 0 1.4cqw, rgba(255,255,255,.7) 1.4cqw 2.8cqw); }
    .cvv { height: 10cqw; min-width: 17cqw; padding: 0 2.6cqw; border-radius: 1.6cqw; display: grid; place-items: center; background: #fff; color: #1b1510 !important; font-size: 4.8cqw; font-weight: 700; letter-spacing: .1em; }
    .dyn-cvv { display: flex; gap: 1cqw; font: 650 3cqw var(--font-ui); letter-spacing: 0; }
    .back-rows { display: flex; align-items: flex-end; justify-content: space-between; gap: 4cqw; margin: auto 7cqw 6cqw; }
    .hint { opacity: .55; text-transform: none; letter-spacing: .02em; font-size: 2.8cqw; }
    :host(.compact) .ci, :host(.compact) .hint { display: none; }
  `,
})
export class CardVisual {
  private brands = inject(Brands);
  private clipboard = inject(Clipboard);
  private el = inject(ElementRef<HTMLElement>);

  readonly card = input.required<CardEntry>();
  readonly revealed = input(false);
  readonly flipped = input(false);
  readonly compact = input(false);
  /** Los datos se copian al tocarlos (en la vista previa del editor no). */
  readonly interactive = input(true);
  readonly tilt = input(false);
  readonly copied = output<void>();

  protected readonly rx = signal(0);
  protected readonly ry = signal(0);
  protected readonly gx = signal(50);

  protected readonly bank = computed(() => this.brands.forName(this.card().bank) ?? this.brands.forName(this.card().title));
  protected readonly ink = computed(() => (this.bank() ? inkFor(this.bank()!.hex) : '#fff'));
  protected readonly network = computed(() => {
    const k = NETWORK_KEY[this.card().network];
    return k ? this.brands.get(k)?.path || null : null;
  });
  protected readonly netLabel = computed(() => NETWORK_LABEL[this.card().network] ?? '');

  protected readonly number = computed(() => {
    const n = digitsOnly(this.card().number);
    if (!n) return '•••• •••• •••• ••••';
    if (this.revealed()) return formatCard(n);
    return `•••• •••• •••• ${n.slice(-4)}`;
  });

  protected readonly hue = computed(() => {
    const c = this.card();
    if (typeof c.hue === 'number') return c.hue;
    const b = this.bank();
    if (b) return hueOf(b.hex);
    let h = 20;
    for (const ch of (c.bank || c.title || '').toLowerCase()) h = (h * 33 + ch.charCodeAt(0)) % 360;
    return h;
  });

  protected copy(ev: Event, what: 'number' | 'expiry' | 'cvv' | 'pin'): void {
    if (!this.interactive()) return;
    ev.stopPropagation();
    const c = this.card();
    const v = { number: digitsOnly(c.number), expiry: c.expiry, cvv: c.cvv, pin: c.pin }[what];
    if (!v) return;
    const label = { number: 'Número copiado', expiry: 'Vencimiento copiado', cvv: 'CVV copiado', pin: 'NIP copiado' }[what];
    void this.clipboard.copy(v, label, what !== 'expiry');
    this.copied.emit();
  }

  protected move(e: PointerEvent): void {
    if (!this.tilt() || e.pointerType !== 'mouse') return;
    const r = (this.el.nativeElement as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    this.el.nativeElement.classList.add('tilting');
    this.ry.set((x - 0.5) * 14);
    this.rx.set((0.5 - y) * 10);
    this.gx.set(x * 100);
  }

  protected leave(): void {
    this.el.nativeElement.classList.remove('tilting');
    this.rx.set(0);
    this.ry.set(0);
  }
}
