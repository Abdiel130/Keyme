import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Clipboard } from '../../core/clipboard.service';
import { entropyBits, generatePassphrase, generatePassword } from '../../core/generator';
import { VaultStore } from '../../core/vault.store';
import { Icon } from '../../ui/icon';
import { StrengthMeter } from '../../ui/strength-meter';

@Component({
  selector: 'km-generator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon, StrengthMeter],
  template: `
    <div class="page">
      <div class="page-head"><div><p class="eyebrow">Herramienta</p><h1>Generador</h1></div></div>

      <div class="out panel">
        <div class="val mono" [class.phrase]="mode() === 'passphrase'">
          @for (ch of chars(); track $index) {
            <span [class]="cls(ch)">{{ ch }}</span>
          }
        </div>
        <div class="acts">
          <button class="btn icon lg" (click)="regen()" title="Otra"><km-icon name="sync" /></button>
          <button class="btn primary lg" (click)="copy()"><km-icon name="copy" [size]="16" /> Copiar</button>
        </div>
      </div>
      <div class="meter"><km-strength [value]="value()" /><span class="faint small">≈ {{ bits() }} bits de entropía</span></div>

      <div class="opts panel">
        <div class="seg">
          <button [class.on]="mode() === 'random'" (click)="set('mode', 'random')">Aleatoria</button>
          <button [class.on]="mode() === 'passphrase'" (click)="set('mode', 'passphrase')">Frase en español</button>
        </div>

        @if (mode() === 'random') {
          <div class="field">
            <label>Longitud <b class="big">{{ length() }}</b></label>
            <input type="range" min="8" max="64" [ngModel]="length()" (ngModelChange)="set('length', +$event)" />
          </div>
          <div class="checks">
            <label class="check"><input type="checkbox" [checked]="g().lower !== false" (change)="set('lower', $any($event.target).checked)" /> Minúsculas</label>
            <label class="check"><input type="checkbox" [checked]="g().upper !== false" (change)="set('upper', $any($event.target).checked)" /> Mayúsculas</label>
            <label class="check"><input type="checkbox" [checked]="g().digits !== false" (change)="set('digits', $any($event.target).checked)" /> Números</label>
            <label class="check"><input type="checkbox" [checked]="g().symbols !== false" (change)="set('symbols', $any($event.target).checked)" /> Símbolos</label>
          </div>
        } @else {
          <div class="field">
            <label>Palabras <b class="big">{{ g().words }}</b></label>
            <input type="range" min="3" max="10" [ngModel]="g().words" (ngModelChange)="set('words', +$event)" />
          </div>
          <div class="field sep">
            <label>Separador</label>
            <div class="seg">
              @for (s of seps; track s) {
                <button [class.on]="g().separator === s" (click)="set('separator', s)">{{ s === ' ' ? 'espacio' : s }}</button>
              }
            </div>
          </div>
        }
        <p class="faint small">Se genera en tu dispositivo con el generador criptográfico del navegador. Estas opciones se guardan como predeterminadas (también en el editor).</p>
      </div>
    </div>
  `,
  styles: `
    .page { max-width: 760px; }
    .out { display: flex; align-items: center; gap: 16px; padding: 22px 22px 22px 26px; flex-wrap: wrap; }
    .val { flex: 1; min-width: 240px; font-size: 26px; line-height: 1.35; word-break: break-all; }
    .val.phrase { font-size: 24px; word-break: normal; }
    .val .d { color: var(--accent); }
    .val .s { color: #e58f73; }
    .val .w { color: var(--text-3); }
    .acts { display: flex; gap: 8px; }
    .meter { margin: 14px 4px 24px; display: flex; flex-direction: column; gap: 4px; max-width: 360px; }
    .opts { padding: 20px; display: flex; flex-direction: column; gap: 20px; }
    .big { font-family: var(--font-display); font-size: 20px; color: var(--accent); margin-left: auto; }
    .checks { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
  `,
})
export class GeneratorPage {
  private store = inject(VaultStore);
  private clipboard = inject(Clipboard);
  protected readonly seps = ['-', '.', ' ', '_', '#'];
  // Copia local: el slider no debe cifrar y sincronizar en cada movimiento.
  private readonly local = signal<ReturnType<VaultStore['settings']>['generator'] | null>(null);
  protected readonly g = computed(() => this.local() ?? this.store.settings().generator);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly mode = computed(() => this.g().mode);
  protected readonly length = computed(() => this.g().length ?? 20);
  private readonly nonce = signal(0);
  protected readonly value = computed(() => {
    this.nonce();
    const g = this.g();
    return g.mode === 'passphrase' ? generatePassphrase({ words: g.words, separator: g.separator, number: true }) : generatePassword(g);
  });
  protected readonly chars = computed(() => [...this.value()]);
  protected readonly bits = computed(() => entropyBits(this.g()));

  protected cls(ch: string): string {
    if (this.mode() === 'passphrase') return /[a-z]/i.test(ch) ? '' : /\d/.test(ch) ? 'd' : 'w';
    return /\d/.test(ch) ? 'd' : /[^a-z0-9]/i.test(ch) ? 's' : '';
  }

  protected regen(): void {
    this.nonce.update((n) => n + 1);
  }

  protected set(key: string, value: unknown): void {
    const next = { ...this.g(), [key]: value };
    this.local.set(next);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.store.saveSettings({ generator: next }), 700);
  }

  protected copy(): void {
    void this.clipboard.copy(this.value(), 'Contraseña copiada');
  }
}
