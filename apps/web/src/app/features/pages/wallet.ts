import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DOC_LABELS, type CardEntry, type DocumentEntry } from '@keyme/models';
import { Clipboard } from '../../core/clipboard.service';
import { Toasts } from '../../core/toasts';
import { VaultStore } from '../../core/vault.store';
import { CardVisual } from '../../ui/card-visual';
import { Icon } from '../../ui/icon';

@Component({
  selector: 'km-wallet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CardVisual, Icon],
  template: `
    <div class="page">
      <div class="page-head">
        <div><p class="eyebrow">Acceso rápido</p><h1>Cartera</h1><p class="muted">Toca una tarjeta para ver sus datos. Copia con un toque; el portapapeles se limpia solo.</p></div>
        <a class="btn" routerLink="/nuevo/card"><km-icon name="plus" [size]="16" /> Tarjeta</a>
      </div>

      @if (cards().length) {
        <div class="cards">
          @for (c of cards(); track c.id) {
            <article class="slot" [class.open]="open() === c.id">
              <km-card-visual [card]="c" [revealed]="open() === c.id" (click)="toggle(c.id)" />
              <div class="quick">
                <button class="btn sm" (click)="copy(c.number, 'Número copiado', c)"><km-icon name="copy" [size]="14" /> Número</button>
                @if (c.expiry) { <button class="btn sm" (click)="copy(c.expiry, 'Vencimiento copiado', c, false)">Vence {{ c.expiry }}</button> }
                @if (c.dynamicCvv) {
                  @if (c.bankAppPackage || c.bankAppUrl) {
                    <button class="btn sm primary" (click)="openBank(c)"><km-icon name="bank" [size]="14" /> CVV en la app</button>
                  } @else {
                    <span class="chip accent">CVV dinámico</span>
                  }
                } @else if (c.cvv) {
                  <button class="btn sm" (click)="copy(c.cvv, 'CVV copiado', c)">CVV {{ open() === c.id ? c.cvv : '•••' }}</button>
                }
                <a class="btn sm ghost" [routerLink]="['/item', c.id]">Ficha <km-icon name="chevron" [size]="14" /></a>
              </div>
            </article>
          }
        </div>
      } @else {
        <div class="empty panel"><km-icon name="card" [size]="30" /><h2>Sin tarjetas</h2><p>Agrega tus tarjetas para tenerlas a un toque.</p><a class="btn primary" routerLink="/nuevo/card">Agregar tarjeta</a></div>
      }

      @if (docs().length) {
        <h2 class="sec">Documentos</h2>
        <div class="docs">
          @for (d of docs(); track d.id) {
            <a class="doc panel" [routerLink]="['/item', d.id]">
              <span class="dt">{{ label[d.docType] }}</span>
              <span class="dn mono">{{ open() === d.id ? d.number : (d.number ? '••••' + d.number.slice(-4) : '—') }}</span>
              <span class="faint tiny">{{ d.fullName || d.title }}</span>
              <button class="btn sm ghost cp" (click)="$event.preventDefault(); $event.stopPropagation(); copy(d.number, label[d.docType] + ' copiado')"><km-icon name="copy" [size]="14" /></button>
            </a>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr)); gap: 28px 22px; }
    .slot { display: flex; flex-direction: column; gap: 12px; }
    .slot km-card-visual { cursor: pointer; transition: transform .25s var(--ease); max-width: none; }
    .slot km-card-visual:hover { transform: translateY(-3px) rotate(-.4deg); }
    .quick { display: flex; flex-wrap: wrap; gap: 6px; }
    .sec { margin: 36px 0 14px; }
    .docs { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
    .doc { position: relative; display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; color: var(--text); background: linear-gradient(160deg, var(--surface-2), var(--surface)); }
    .dt { font-family: var(--font-display); font-size: 20px; color: var(--accent); }
    .dn { font-size: 15px; }
    .cp { position: absolute; top: 10px; right: 10px; }
  `,
})
export class Wallet {
  private store = inject(VaultStore);
  private clipboard = inject(Clipboard);
  private toasts = inject(Toasts);
  protected readonly label = DOC_LABELS;
  protected readonly open = signal<string | null>(null);

  protected readonly cards = computed(() =>
    this.store.entries().filter((e): e is CardEntry => e.kind === 'card')
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || (b.usage?.count ?? 0) - (a.usage?.count ?? 0)),
  );
  protected readonly docs = computed(() => this.store.entries().filter((e): e is DocumentEntry => e.kind === 'document'));

  protected toggle(id: string): void {
    this.open.set(this.open() === id ? null : id);
  }

  protected copy(v: string, what: string, c?: CardEntry, sensitive = true): void {
    void this.clipboard.copy(v, what, sensitive);
    if (c) void this.store.markUsed(c);
  }

  protected openBank(c: CardEntry): void {
    if (c.bankAppUrl) location.href = c.bankAppUrl;
    else if (/Android/.test(navigator.userAgent)) location.href = `intent://#Intent;package=${c.bankAppPackage};action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end`;
    else this.toasts.show('Abre la app del banco en tu teléfono para ver el CVV dinámico', 'info');
    void this.store.markUsed(c);
  }
}
