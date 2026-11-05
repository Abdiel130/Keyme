import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DOC_LABELS, digitsOnly, type CardEntry, type DocumentEntry, type LoginEntry } from '@keyme/models';
import { Clipboard } from '../../core/clipboard.service';
import { Toasts } from '../../core/toasts';
import { VaultStore } from '../../core/vault.store';
import { CardVisual } from '../../ui/card-visual';
import { Icon } from '../../ui/icon';

/** Cuánto asoma cada tarjeta en la pila (px). */
const PEEK = 62;

/**
 * Cartera al estilo de una wallet de teléfono: las tarjetas se apilan y al
 * tocar una sube, se voltea si hace falta y muestra sus acciones; las demás
 * bajan a un montón al fondo.
 */
@Component({
  selector: 'km-wallet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CardVisual, Icon],
  template: `
    <div class="page">
      <div class="page-head">
        <div><p class="eyebrow">Acceso rápido</p><h1>Cartera</h1></div>
        <a class="btn tonal" routerLink="/new/card"><km-icon name="plus" [size]="18" /> Tarjeta</a>
      </div>

      @if (cards().length) {
        <p class="muted lead">{{ open() ? 'Toca un dato de la tarjeta para copiarlo. Toca afuera para volver a la pila.' : 'Toca una tarjeta para usarla.' }}</p>
        <div class="stack" [class.has-open]="!!open()" [style.--n]="cards().length" [style.--ah]="openCard() && bankOf(openCard()!) ? '286px' : null" (click)="close($event)">
          @for (c of cards(); track c.id; let i = $index) {
            @let pos = place(i);
            <div class="slot" [class.open]="open() === c.id" [class.piled]="pos.piled"
                 [style.--y]="pos.y" [style.--s]="pos.s" [style.z-index]="pos.z" (click)="toggle($event, c.id)">
              <km-card-visual [card]="c" [revealed]="open() === c.id && reveal()" [flipped]="open() === c.id && flip()" [interactive]="open() === c.id" (copied)="used(c)" />
            </div>
          }
          @if (openCard(); as c) {
            <div class="panel acts" (click)="$event.stopPropagation()">
              <button class="act primary" (click)="copy(digitsOnly(c.number), 'Número copiado', c)"><span class="ai"><km-icon name="copy" [size]="20" /></span>Número</button>
              @if (c.expiry) { <button class="act" (click)="copy(c.expiry, 'Vencimiento copiado', c, false)"><span class="ai"><km-icon name="clock" [size]="20" /></span>{{ c.expiry }}</button> }
              @if (c.dynamicCvv) {
                <button class="act" (click)="openBank(c)"><span class="ai"><km-icon name="bank" [size]="20" /></span>CVV en app</button>
              } @else if (c.cvv) {
                <button class="act" (click)="copy(c.cvv, 'CVV copiado', c)"><span class="ai"><km-icon name="lock" [size]="20" /></span>CVV</button>
              }
              @if (bankOf(c); as l) {
                @if (l.username) { <button class="act" (click)="copy(l.username, 'Usuario del banco copiado', undefined, false); used(l)"><span class="ai"><km-icon name="bank" [size]="20" /></span>Usuario app</button> }
                @if (l.password) { <button class="act" (click)="copy(l.password, 'Contraseña del banco copiada'); used(l)"><span class="ai"><km-icon name="key" [size]="20" /></span>Clave app</button> }
              }
              <button class="act" [class.on]="reveal()" (click)="reveal.set(!reveal())"><span class="ai"><km-icon [name]="reveal() ? 'eye-off' : 'eye'" [size]="20" /></span>{{ reveal() ? 'Ocultar' : 'Mostrar' }}</button>
              <button class="act" (click)="flip.set(!flip())"><span class="ai"><km-icon name="sync" [size]="20" /></span>Voltear</button>
              <a class="act" [routerLink]="['/item', c.id]"><span class="ai"><km-icon name="chevron" [size]="20" /></span>Ficha</a>
            </div>
          }
        </div>
      } @else {
        <div class="empty-w">
          <div class="ghost-card"><km-icon name="card" [size]="34" /></div>
          <h2>Sin tarjetas</h2>
          <p class="muted">Agrega tus tarjetas para tenerlas a un toque: número, vencimiento y CVV se copian solos.</p>
          <a class="btn primary lg" routerLink="/new/card"><km-icon name="plus" [size]="18" /> Agregar tarjeta</a>
        </div>
      }

      @if (docs().length) {
        <h2 class="sec">Documentos</h2>
        <div class="docs stagger">
          @for (d of docs(); track d.id; let i = $index) {
            <a class="doc" [style.--i]="i" [attr.data-t]="d.docType" [routerLink]="['/item', d.id]">
              <span class="dt">{{ label[d.docType] }}</span>
              <span class="dn mono">{{ d.number ? '•••• ' + d.number.slice(-4) : '—' }}</span>
              <span class="dname">{{ d.fullName || d.title }}</span>
              <button class="cp" (click)="$event.preventDefault(); $event.stopPropagation(); copy(d.number, label[d.docType] + ' copiado')" aria-label="Copiar número"><km-icon name="copy" [size]="17" /></button>
            </a>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .page { max-width: 980px; margin: 0 auto; }
    .lead { margin: -14px 0 22px; font-size: 15px; }
    .stack {
      position: relative; width: min(440px, 100%); margin: 0 auto; container-type: inline-size;
      --ch: calc(100cqw / 1.586);
      height: calc(var(--ch) + (var(--n) - 1) * ${PEEK}px + 10px);
      transition: height .5s var(--ease-emph);
    }
    .stack.has-open { height: calc(var(--ch) + var(--ah, 196px) + min(var(--n) - 1, 4) * 12px + 30px); }
    .slot {
      position: absolute; left: 0; right: 0; top: 0; cursor: pointer;
      transform: translateY(calc(var(--y) * 1px)) scale(var(--s));
      transform-origin: top center;
      transition: transform .6s var(--ease-emph), filter .4s;
      animation: deal .6s var(--ease-emph) both; animation-delay: calc(var(--z) * 0ms);
    }
    .slot km-card-visual { max-width: none; }
    .stack.has-open .slot.piled { transform: translateY(calc(var(--ch) + var(--ah, 196px) + var(--y) * 1px)) scale(var(--s)); filter: brightness(.7); }
    @media (hover: hover) { .stack:not(.has-open) .slot:hover { transform: translateY(calc(var(--y) * 1px - 10px)) scale(var(--s)); } }
    .slot.open { cursor: default; }
    @keyframes deal { from { opacity: 0; transform: translateY(calc(var(--y) * 1px + 60px)) scale(.94); } }
    .acts {
      position: absolute; left: 0; right: 0; top: calc(var(--ch) + 18px); z-index: 200; padding: 10px;
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; border-radius: 22px; animation: rise .4s var(--ease-emph) .1s both;
    }
    .act {
      display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 4px; border-radius: 16px; border: 0; background: none;
      color: var(--text); font: 600 13.5px var(--font-ui); cursor: pointer; text-decoration: none; transition: background .15s, transform .25s var(--spring);
      .ai { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; background: var(--surface-2); color: var(--text-2); }
      @media (hover: hover) { &:hover { background: var(--surface-2); } }
      &:active { transform: scale(.92); }
      &.primary .ai { background: var(--accent); color: var(--accent-ink); }
      &.on .ai { background: var(--accent-soft); color: var(--accent); }
    }
    .sec { margin: 44px 0 16px; }
    .docs { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
    .doc {
      position: relative; display: flex; flex-direction: column; gap: 4px; padding: 16px 18px; border-radius: 20px; color: #eaf3ef; min-height: 128px;
      background: repeating-linear-gradient(-30deg, rgba(255,255,255,.03) 0 2px, transparent 2px 10px), linear-gradient(150deg, #2c4a44, #1b2b28);
      box-shadow: 0 18px 36px -20px rgba(0,0,0,.9), inset 0 1px 0 rgba(255,255,255,.14); transition: transform .3s var(--spring);
      @media (hover: hover) { &:hover { transform: translateY(-3px); } }
      &:active { transform: scale(.97); }
    }
    .doc[data-t='pasaporte'] { background: linear-gradient(150deg, #3a2a52, #20172e); }
    .doc[data-t='licencia'] { background: linear-gradient(150deg, #2a3d5c, #18233a); }
    .doc[data-t='rfc'], .doc[data-t='curp'], .doc[data-t='nss'] { background: linear-gradient(150deg, #57352a, #2b1a14); }
    .dt { font: 600 21px var(--font-display); }
    .dn { font-size: 16px; margin-top: auto; letter-spacing: .06em; }
    .dname { font-size: 13px; opacity: .65; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cp { position: absolute; top: 12px; right: 12px; width: 38px; height: 38px; border-radius: 12px; border: 0; background: rgba(255,255,255,.12); color: inherit; display: grid; place-items: center; cursor: pointer; transition: background .15s, transform .25s var(--spring); &:active { transform: scale(.88); } }
    .empty-w { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; padding: 30px 16px; p { max-width: 360px; margin: 0 0 8px; } }
    .ghost-card { width: min(300px, 80vw); aspect-ratio: 1.586; border-radius: 20px; border: 2px dashed var(--line-strong); display: grid; place-items: center; color: var(--text-3); margin-bottom: 10px; animation: pop .5s var(--spring); }
    @media (max-width: 860px) { .page { padding-top: calc(24px + env(safe-area-inset-top)); } }
  `,
})
export class Wallet {
  private store = inject(VaultStore);
  private clipboard = inject(Clipboard);
  private toasts = inject(Toasts);
  protected readonly label = DOC_LABELS;
  protected readonly digitsOnly = digitsOnly;
  protected readonly open = signal<string | null>(null);
  protected readonly reveal = signal(false);
  protected readonly flip = signal(false);

  protected readonly cards = computed(() =>
    this.store.entries().filter((e): e is CardEntry => e.kind === 'card')
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || (b.usage?.count ?? 0) - (a.usage?.count ?? 0)),
  );
  protected readonly openCard = computed(() => this.cards().find((c) => c.id === this.open()) ?? null);
  protected readonly docs = computed(() => this.store.entries().filter((e): e is DocumentEntry => e.kind === 'document'));

  /** Posición de cada tarjeta: en pila, o la abierta arriba y el resto al fondo. */
  protected place(i: number): { y: number; s: number; z: number; piled: boolean } {
    const list = this.cards();
    const openIdx = list.findIndex((c) => c.id === this.open());
    if (openIdx < 0) return { y: i * PEEK, s: 1, z: i + 1, piled: false };
    if (i === openIdx) return { y: 0, s: 1, z: 100, piled: false };
    const j = i < openIdx ? i : i - 1;
    const depth = Math.min(j, 4);
    return { y: depth * 12, s: 1 - (4 - depth) * 0.025, z: 10 + j, piled: true };
  }

  protected toggle(ev: Event, id: string): void {
    ev.stopPropagation();
    if (this.open() === id) return;
    this.open.set(id);
    this.reveal.set(false);
    this.flip.set(false);
  }

  protected close(ev: Event): void {
    if (ev.target === ev.currentTarget || (ev.target as HTMLElement).closest('.piled')) this.open.set(null);
  }

  protected used(e: CardEntry | LoginEntry): void {
    void this.store.markUsed(e);
  }

  /** Banca en línea vinculada a la tarjeta. */
  protected bankOf(c: CardEntry): LoginEntry | null {
    const l = c.loginId ? this.store.get(c.loginId) : undefined;
    return l?.kind === 'login' ? l : null;
  }

  protected copy(v: string, what: string, c?: CardEntry, sensitive = true): void {
    void this.clipboard.copy(v, what, sensitive);
    if (c) void this.store.markUsed(c);
    navigator.vibrate?.(10);
  }

  protected openBank(c: CardEntry): void {
    if (c.bankAppUrl) location.href = c.bankAppUrl;
    else if (/Android/.test(navigator.userAgent)) location.href = `intent://#Intent;package=${c.bankAppPackage};action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end`;
    else this.toasts.show('Abre la app del banco en tu teléfono para ver el CVV dinámico', 'info');
    void this.store.markUsed(c);
  }
}
