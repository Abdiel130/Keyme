import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  DOC_LABELS, KIND_LABELS, baseDomain, detectNetwork, digitsOnly, formatCard, hostOf, isEntry, luhnValid, newEntry, uuidv7,
  type AttachmentRef, type CardEntry, type Entry, type EntryKind, type GeneratorRule, type LoginEntry, type UrlMatch,
} from '@keyme/models';
import { generatePassphrase, generatePassword } from '../../core/generator';
import { parseTotp } from '../../core/totp';
import { Toasts } from '../../core/toasts';
import { UiState } from '../../core/ui-state';
import { VaultStore } from '../../core/vault.store';
import { Icon } from '../../ui/icon';
import { StrengthMeter } from '../../ui/strength-meter';

/** Paquetes Android conocidos (verifícalos en la URL de Play Store: ...?id=<paquete>). */
const BANK_APPS = [
  { name: 'BBVA México', pkg: 'com.bancomer.mbanking' },
  { name: 'Santander México', pkg: 'mx.bancosantander.supermovil' },
  { name: 'Nu México', pkg: 'com.nu.production' },
  { name: 'Mercado Pago', pkg: 'com.mercadopago.wallet' },
];

@Component({
  selector: 'km-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon, StrengthMeter],
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class Editor {
  protected store = inject(VaultStore);
  protected ui = inject(UiState);
  private router = inject(Router);
  private toasts = inject(Toasts);

  /** Ruta /item/:id/edit */
  readonly id = input<string>();
  /** Ruta /new/:kind */
  readonly kind = input<EntryKind>();

  // Borrador mutable: los campos se enlazan con ngModel y `touch()` notifica.
  protected draft!: Entry;
  protected readonly rev = signal(0);
  protected readonly isNew = signal(true);
  protected readonly saving = signal(false);
  protected readonly showPass = signal(false);
  protected readonly genOpen = signal(false);
  protected readonly genPreview = signal('');
  protected readonly tagsText = signal('');
  protected readonly codesText = signal('');
  protected readonly packagesText = signal('');
  private added: string[] = [];
  private original: AttachmentRef[] = [];

  protected readonly kindLabel = KIND_LABELS;
  protected readonly docTypes = Object.entries(DOC_LABELS);
  protected readonly bankApps = BANK_APPS;

  protected readonly logins = computed(() =>
    this.store.entries().filter((e): e is LoginEntry => e.kind === 'login' && e.id !== this.draft?.id && !e.signInWith)
      .sort((a, b) => a.title.localeCompare(b.title, 'es')),
  );

  constructor() {
    effect(() => {
      const id = this.id();
      const kind = this.kind();
      untracked(() => this.init(id, kind));
    });
  }

  private init(id: string | undefined, kind: EntryKind | undefined): void {
    const rec = id ? this.store.records().get(id) : undefined;
    if (rec && isEntry(rec)) {
      this.draft = structuredClone(rec);
      this.isNew.set(false);
    } else {
      const f = this.ui.filter();
      const space = f.type === 'space' ? f.id : this.store.spaces()[0]?.id ?? null;
      this.draft = newEntry(kind ?? 'login', space);
      if (f.type === 'fav') this.draft.favorite = true;
      if (f.type === 'tag') this.draft.tags = [f.tag];
      this.isNew.set(true);
    }
    this.original = [...this.draft.attachments];
    this.added = [];
    this.tagsText.set(this.draft.tags.join(', '));
    if (this.draft.kind === 'login') {
      this.codesText.set(this.draft.recoveryCodes.map((c) => c.code).join('\n'));
      this.packagesText.set(this.draft.androidPackages.join(', '));
    }
    this.touch();
  }

  protected touch(): void {
    this.rev.update((n) => n + 1);
  }

  protected get d(): any {
    return this.draft;
  }

  protected get login(): LoginEntry {
    return this.draft as LoginEntry;
  }

  protected get card(): CardEntry {
    return this.draft as CardEntry;
  }

  // ----- Login ------------------------------------------------------------

  protected addUrl(): void {
    this.login.urls = [...this.login.urls, { value: '', match: 'base' }];
    this.touch();
  }

  protected removeUrl(i: number): void {
    this.login.urls = this.login.urls.filter((_, j) => j !== i);
    this.touch();
  }

  protected urlBlur(u: UrlMatch): void {
    if (!this.draft.title.trim() && u.value) {
      const h = hostOf(u.value);
      if (h) {
        const name = baseDomain(h).split('.')[0];
        this.draft.title = name.charAt(0).toUpperCase() + name.slice(1);
      }
    }
    this.touch();
  }

  protected readonly totpValid = computed(() => {
    this.rev();
    const t = this.draft?.kind === 'login' ? this.login.totp : '';
    return !t || !!parseTotp(t);
  });

  /** Lee un QR de 2FA desde una imagen (captura de pantalla) o la cámara. */
  protected async scanQr(ev: Event): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    (ev.target as HTMLInputElement).value = '';
    if (!file) return;
    const value = await this.decodeQr(file);
    if (value?.startsWith('otpauth://')) {
      this.login.totp = value;
      const info = parseTotp(value);
      if (info && !this.draft.title) this.draft.title = info.issuer;
      if (info && !this.login.username && info.label) this.login.username = info.label;
      this.touch();
      this.toasts.show('Código 2FA agregado');
    } else {
      this.toasts.show('No encontré un QR de 2FA en la imagen', 'error');
    }
  }

  private async decodeQr(file: File): Promise<string | null> {
    const { default: jsQR } = await import('jsqr');
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height)?.data ?? null;
  }

  // ----- Generador --------------------------------------------------------

  private ruleFor(): GeneratorRule & { mode: 'random' | 'passphrase'; words: number; separator: string } {
    const s = this.store.settings();
    const host = this.draft.kind === 'login' ? hostOf(this.login.urls[0]?.value ?? '') : '';
    const site = host ? s.siteRules.find((r) => baseDomain(host) === baseDomain(r.domain)) : undefined;
    const own = this.draft.kind === 'login' ? this.login.generatorRule : undefined;
    return { ...s.generator, ...(site?.rule ?? {}), ...(own ?? {}) };
  }

  protected readonly siteRuleNote = computed(() => {
    this.rev();
    const host = this.draft?.kind === 'login' ? hostOf(this.login.urls[0]?.value ?? '') : '';
    const r = host ? this.store.settings().siteRules.find((x) => baseDomain(host) === baseDomain(x.domain)) : undefined;
    if (!r) return '';
    const bits = [r.rule.symbols === false ? 'sin símbolos' : '', r.rule.maxLength ? `máx. ${r.rule.maxLength}` : '', r.rule.length ? `${r.rule.length} caracteres` : ''].filter(Boolean);
    return `Regla de ${r.domain}: ${bits.join(', ')}`;
  });

  protected generate(mode?: 'random' | 'passphrase'): void {
    const r = this.ruleFor();
    const m = mode ?? r.mode;
    this.genPreview.set(m === 'passphrase' ? generatePassphrase({ words: r.words, separator: r.separator, number: true }) : generatePassword(r));
    this.genOpen.set(true);
  }

  protected useGenerated(): void {
    this.d.password = this.genPreview();
    this.showPass.set(true);
    this.genOpen.set(false);
    this.touch();
  }

  // ----- Tarjeta ----------------------------------------------------------

  protected onCardNumber(v: string): void {
    this.card.number = digitsOnly(v).slice(0, 19);
    this.card.network = detectNetwork(this.card.number);
    this.touch();
  }

  protected readonly cardFormatted = computed(() => {
    this.rev();
    return this.draft?.kind === 'card' ? formatCard(this.card.number) : '';
  });

  protected readonly cardInvalid = computed(() => {
    this.rev();
    return this.draft?.kind === 'card' && this.card.number.length >= 13 && !luhnValid(this.card.number);
  });

  protected onExpiry(v: string): void {
    const n = digitsOnly(v).slice(0, 4);
    this.card.expiry = n.length > 2 ? `${n.slice(0, 2)}/${n.slice(2)}` : n;
    this.touch();
  }

  // ----- Comunes ----------------------------------------------------------

  protected addField(secret = false): void {
    this.draft.fields = [...this.draft.fields, { id: uuidv7(), label: '', value: '', secret }];
    this.touch();
  }

  protected removeField(id: string): void {
    this.draft.fields = this.draft.fields.filter((f) => f.id !== id);
    this.touch();
  }

  protected async addFiles(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    for (const f of files) {
      if (f.size > 25 * 1024 * 1024) {
        this.toasts.show(`${f.name} pesa más de 25 MB`, 'error');
        continue;
      }
      const ref = await this.store.addFile(this.draft.id, f);
      this.added.push(ref.id);
      this.draft.attachments = [...this.draft.attachments, ref];
      this.touch();
    }
  }

  protected removeFile(id: string): void {
    this.draft.attachments = this.draft.attachments.filter((a) => a.id !== id);
    this.touch();
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    const e = this.draft;
    e.title = e.title.trim() || this.fallbackTitle();
    e.tags = [...new Set(this.tagsText().split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean))];
    e.fields = e.fields.filter((f) => f.label.trim() || f.value);
    if (e.kind === 'login') {
      const prevCodes = new Map(e.recoveryCodes.map((c) => [c.code, c.used]));
      e.recoveryCodes = this.codesText().split('\n').map((c) => c.trim()).filter(Boolean).map((code) => ({ code, used: prevCodes.get(code) ?? false }));
      e.androidPackages = this.packagesText().split(/[\s,]+/).map((p) => p.trim()).filter(Boolean);
      e.urls = e.urls.filter((u) => u.value.trim());
      e.totp = e.totp?.trim() || undefined;
    }
    this.saving.set(true);
    try {
      const saved = await this.store.save(e);
      // Adjuntos quitados en esta edición
      const kept = new Set(saved.attachments.map((a) => a.id));
      for (const a of this.original) if (!kept.has(a.id)) await this.store.deleteFile(a.id);
      this.added = [];
      this.toasts.show(this.isNew() ? 'Guardado' : 'Cambios guardados');
      void this.router.navigate(['/item', saved.id], { replaceUrl: true });
    } finally {
      this.saving.set(false);
    }
  }

  private fallbackTitle(): string {
    const e = this.draft;
    if (e.kind === 'card') return e.bank || 'Tarjeta';
    if (e.kind === 'wifi') return e.ssid || 'Wi-Fi';
    if (e.kind === 'document') return DOC_LABELS[e.docType];
    if (e.kind === 'identity') return e.fullName || 'Identidad';
    if (e.kind === 'login') return hostOf(e.urls[0]?.value ?? '') || e.username || 'Login';
    return 'Nota';
  }

  protected async cancel(): Promise<void> {
    for (const id of this.added) await this.store.deleteFile(id);
    this.added = [];
    if (this.isNew()) void this.router.navigate(['/']);
    else void this.router.navigate(['/item', this.draft.id]);
  }

  protected onKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void this.save();
    } else if (e.key === 'Escape' && !this.genOpen()) {
      void this.cancel();
    } else if (e.key === 'Escape') {
      this.genOpen.set(false);
    }
  }

  protected size(n: number): string {
    return n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
  }
}
