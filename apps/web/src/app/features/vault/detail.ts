import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  DOC_LABELS, KIND_LABELS, accountLabel, digitsOnly, formatCard, formatClabe, hostOf, isEntry, serviceKey, serviceName, wifiQrPayload,
  type AttachmentRef, type CardEntry, type Entry, type HistoryEntry, type LoginEntry,
} from '@keyme/models';
import { Brands } from '../../core/brands';
import { Clipboard } from '../../core/clipboard.service';
import { parseTotp, totpNow } from '../../core/totp';
import { type Filter } from '../../core/ui-state';
import { Toasts } from '../../core/toasts';
import { UiState } from '../../core/ui-state';
import { VaultStore } from '../../core/vault.store';
import { Avatar } from '../../ui/avatar';
import { CardVisual } from '../../ui/card-visual';
import { Icon } from '../../ui/icon';
import { QrCode } from '../../ui/qr-code';
import { SecretRow } from '../../ui/secret-row';
import { Sheet } from '../../ui/sheet';
import { StrengthMeter } from '../../ui/strength-meter';
import { TotpCode } from '../../ui/totp-code';

interface QuickAction {
  id: string;
  icon: string;
  label: string;
  value: string;
  toast?: string;
  /** No es secreto: no se borra del portapapeles ni cuenta como uso. */
  plain?: boolean;
}

@Component({
  selector: 'km-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Avatar, CardVisual, Icon, QrCode, SecretRow, StrengthMeter, TotpCode, Sheet],
  templateUrl: './detail.html',
  styleUrl: './detail.scss',
})
export class Detail {
  protected store = inject(VaultStore);
  protected ui = inject(UiState);
  private router = inject(Router);
  private clipboard = inject(Clipboard);
  private toasts = inject(Toasts);
  private brands = inject(Brands);

  readonly id = input.required<string>();
  protected readonly entry = computed(() => {
    const r = this.store.records().get(this.id());
    return r && isEntry(r) ? r : null;
  });
  protected readonly space = computed(() => {
    const e = this.entry();
    return e?.spaceId ? this.ui.spaceById().get(e.spaceId) ?? null : null;
  });
  protected readonly provider = computed(() => {
    const e = this.entry();
    if (e?.kind !== 'login' || !e.signInWith) return null;
    const p = this.store.records().get(e.signInWith);
    return p && isEntry(p) && p.kind === 'login' ? p : null;
  });
  protected readonly dependents = computed(() => {
    const e = this.entry();
    if (!e || e.kind !== 'login') return [];
    return this.store.entries().filter((x): x is LoginEntry => x.kind === 'login' && x.signInWith === e.id);
  });
  protected readonly owner = computed(() => {
    const e = this.entry();
    return e?.ownerId ? this.ui.personById().get(e.ownerId) ?? null : null;
  });
  /** Banca en línea vinculada a la tarjeta. */
  protected readonly bankLogin = computed(() => {
    const e = this.entry();
    const l = e?.kind === 'card' && e.loginId ? this.store.records().get(e.loginId) : undefined;
    return l && isEntry(l) && l.kind === 'login' ? l : null;
  });
  /** Tarjetas que usan este login como banca en línea. */
  protected readonly cards = computed(() => {
    const e = this.entry();
    if (e?.kind !== 'login') return [];
    return this.store.entries().filter((x): x is CardEntry => x.kind === 'card' && x.loginId === e.id);
  });
  private readonly get = (id: string) => {
    const r = this.store.records().get(id);
    return r && isEntry(r) ? r : undefined;
  };
  /** Las otras cuentas del mismo servicio (Google ×3) y su nombre. */
  protected readonly siblings = computed(() => {
    const e = this.entry();
    if (!e) return null;
    const key = serviceKey(e, this.get);
    const all = this.store.entries().filter((x) => serviceKey(x, this.get) === key);
    const others = all.filter((x) => x.id !== e.id && x.id !== this.bankLogin()?.id && !this.cards().some((c) => c.id === x.id));
    return { name: serviceName(all), others };
  });
  protected readonly accountLabel = accountLabel;
  protected readonly cardTab = signal<'card' | 'bank'>('card');

  /** Color de la marca para el halo de la cabecera. */
  protected readonly brandColor = computed(() => {
    const e = this.entry();
    const b = e ? this.brands.forEntry(e) : null;
    return b ? `#${b.hex}` : null;
  });

  /**
   * Acciones de un toque según el tipo: lo que más se hace con cada elemento
   * queda arriba, sin buscarlo entre los campos. La primera es la principal.
   */
  protected readonly actions = computed<QuickAction[]>(() => {
    const e = this.entry();
    if (!e) return [];
    const out: QuickAction[] = [];
    switch (e.kind) {
      case 'login':
        if (e.password) out.push({ id: 'pass', icon: 'key', label: 'Contraseña', value: e.password, toast: 'Contraseña copiada' });
        if (e.username) out.push({ id: 'user', icon: 'identity', label: 'Usuario', value: e.username, toast: 'Usuario copiado', plain: true });
        if (e.totp && parseTotp(e.totp)) out.push({ id: 'totp', icon: 'clock', label: 'Código 2FA', value: '', toast: 'Código copiado' });
        if (e.urls.some((u) => u.match !== 'regex')) out.push({ id: 'open', icon: 'external', label: 'Abrir sitio', value: '' });
        break;
      case 'card':
        if (e.number) out.push({ id: 'num', icon: 'card', label: 'Número', value: digitsOnly(e.number), toast: 'Número copiado' });
        if (e.expiry) out.push({ id: 'exp', icon: 'clock', label: 'Vence', value: e.expiry, toast: 'Vencimiento copiado', plain: true });
        if (!e.dynamicCvv && e.cvv) out.push({ id: 'cvv', icon: 'lock', label: 'CVV', value: e.cvv, toast: 'CVV copiado' });
        if (e.dynamicCvv && (e.bankAppPackage || e.bankAppUrl)) out.push({ id: 'bank', icon: 'bank', label: 'App banco', value: '' });
        if (e.clabe) out.push({ id: 'clabe', icon: 'bank', label: 'CLABE', value: digitsOnly(e.clabe), toast: 'CLABE copiada', plain: true });
        break;
      case 'wifi':
        if (e.password) out.push({ id: 'pass', icon: 'key', label: 'Contraseña', value: e.password, toast: 'Contraseña copiada' });
        if (e.ssid) out.push({ id: 'ssid', icon: 'wifi', label: 'Red', value: e.ssid, toast: 'Red copiada', plain: true });
        if (e.ssid) out.push({ id: 'qr', icon: 'qr', label: 'Ver QR', value: '' });
        break;
      case 'document':
        if (e.number) out.push({ id: 'num', icon: 'copy', label: 'Número', value: e.number, toast: 'Número copiado' });
        if (e.fullName) out.push({ id: 'name', icon: 'identity', label: 'Nombre', value: e.fullName, toast: 'Nombre copiado', plain: true });
        break;
      case 'identity':
        if (e.fullName) out.push({ id: 'name', icon: 'identity', label: 'Nombre', value: e.fullName, toast: 'Nombre copiado', plain: true });
        if (e.email) out.push({ id: 'email', icon: 'login', label: 'Correo', value: e.email, toast: 'Correo copiado', plain: true });
        if (e.phone) out.push({ id: 'phone', icon: 'phone', label: 'Teléfono', value: e.phone, toast: 'Teléfono copiado', plain: true });
        break;
      case 'note':
        if (e.notes) out.push({ id: 'note', icon: 'copy', label: 'Copiar nota', value: e.notes, toast: 'Nota copiada' });
        break;
    }
    out.push({ id: 'edit', icon: 'edit', label: 'Editar', value: '' });
    return out.slice(0, 4);
  });
  protected readonly flashed = signal<string | null>(null);
  protected readonly menu = signal(false);
  protected readonly flipCard = signal(false);
  protected readonly showDoc = signal(false);
  protected readonly scrolled = signal(false);
  protected readonly confirmDelete = signal(false);
  protected readonly showHistory = signal(false);
  protected readonly revealCard = signal(false);
  protected readonly previews = signal<Record<string, string>>({});

  protected readonly kindLabel = KIND_LABELS;
  protected readonly docLabel: Record<string, string> = DOC_LABELS;
  protected readonly formatCard = formatCard;
  protected readonly formatClabe = formatClabe;
  protected readonly hostOf = hostOf;
  protected readonly wifiQr = wifiQrPayload;

  constructor() {
    const urls: string[] = [];
    inject(DestroyRef).onDestroy(() => urls.forEach((u) => URL.revokeObjectURL(u)));
    // Vista previa de imágenes adjuntas (descifradas en memoria).
    effect(async () => {
      const e = this.entry();
      this.revealCard.set(false);
      this.flipCard.set(false);
      this.cardTab.set('card');
      this.showDoc.set(false);
      this.menu.set(false);
      this.confirmDelete.set(false);
      if (!e) return;
      const out: Record<string, string> = {};
      for (const a of e.attachments.filter((x) => x.mime.startsWith('image/'))) {
        try {
          const u = URL.createObjectURL(await this.store.openFile(a));
          urls.push(u);
          out[a.id] = u;
        } catch {
          /* sin copia local ni red: se muestra solo el nombre */
        }
      }
      this.previews.set(out);
    });
  }

  protected run(a: QuickAction): void {
    const e = this.entry();
    if (!e) return;
    switch (a.id) {
      case 'open': {
        const u = e.kind === 'login' ? e.urls.find((x) => x.match !== 'regex') : undefined;
        if (u) this.openUrl(u.value);
        return;
      }
      case 'edit':
        void this.router.navigate(['/item', e.id, 'edit']);
        return;
      case 'bank':
        if (e.kind === 'card') this.openBank(e);
        return;
      case 'qr':
        document.getElementById('wifi-qr')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      case 'totp': {
        const info = e.kind === 'login' && e.totp ? parseTotp(e.totp) : null;
        if (info) void this.clipboard.copy(totpNow(info, Date.now()).code, a.toast!);
        break;
      }
      default:
        void this.clipboard.copy(a.value, a.toast, !a.plain);
    }
    if (!a.plain) this.used();
    this.flashed.set(a.id);
    navigator.vibrate?.(10);
    setTimeout(() => this.flashed() === a.id && this.flashed.set(null), 1400);
  }

  protected filterBy(f: Filter): void {
    this.ui.filter.set(f);
    this.ui.query.set('');
    void this.router.navigate(['/']);
  }

  protected onScroll(ev: Event): void {
    this.scrolled.set((ev.target as HTMLElement).scrollTop > 40);
  }

  protected mask(v: string): string {
    return v ? '•'.repeat(Math.max(0, Math.min(v.length - 4, 10))) + v.slice(-4) : '—';
  }

  protected asCard(e: Entry): CardEntry {
    return e as CardEntry;
  }

  protected address(i: { street: string; city: string; state: string; zip: string; country: string }): string {
    return [i.street, i.city, i.state, i.zip, i.country].filter(Boolean).join(', ');
  }

  protected unusedCodes(e: Entry): number {
    return e.kind === 'login' ? e.recoveryCodes.filter((c) => !c.used).length : 0;
  }

  protected used(): void {
    const e = this.entry();
    if (e) void this.store.markUsed(e);
  }

  protected async toggleFav(): Promise<void> {
    const e = this.entry();
    if (e) await this.store.save({ ...e, favorite: !e.favorite });
  }

  protected async toggleCode(i: number): Promise<void> {
    const e = this.entry();
    if (e?.kind !== 'login') return;
    const codes = e.recoveryCodes.map((c, j) => (j === i ? { ...c, used: !c.used } : c));
    await this.store.save({ ...e, recoveryCodes: codes });
  }

  protected async remove(): Promise<void> {
    const e = this.entry();
    if (!e) return;
    // Las tarjetas que la usaban como banca en línea se quedan sin ella.
    for (const c of this.store.entries().filter((x): x is CardEntry => x.kind === 'card' && x.loginId === e.id)) await this.store.save({ ...c, loginId: null }, { touch: false });
    await this.store.remove(e.id);
    this.toasts.show(`“${e.title || 'Elemento'}” eliminado`);
    void this.router.navigate(['/']);
  }

  protected async duplicate(): Promise<void> {
    this.menu.set(false);
    const e = this.entry();
    if (!e) return;
    const { uuidv7 } = await import('@keyme/models');
    const now = new Date().toISOString();
    const copy = { ...structuredClone(e), id: uuidv7(), title: `${e.title} (copia)`, history: [], attachments: [], createdAt: now, usage: undefined };
    await this.store.save(copy);
    void this.router.navigate(['/item', copy.id]);
  }

  protected async setOwner(ownerId: string | null): Promise<void> {
    this.menu.set(false);
    const e = this.entry();
    if (!e) return;
    await this.store.save({ ...e, ownerId });
    this.toasts.show(ownerId ? `Ahora es de ${this.personName(ownerId)}` : 'Ahora es tuya');
  }

  protected personName(id: string | null | undefined): string {
    return id ? this.ui.personById().get(id)?.name ?? '' : '';
  }

  /** La app del banco: la de la tarjeta o, si no tiene, la del login. */
  protected openBankApp(c: CardEntry, l: LoginEntry): void {
    this.openBank({ ...c, bankAppPackage: c.bankAppPackage || l.androidPackages[0] || '' });
  }

  protected bankUsed(l: LoginEntry): void {
    void this.store.markUsed(l);
  }

  protected async moveTo(spaceId: string | null): Promise<void> {
    this.menu.set(false);
    const e = this.entry();
    if (!e) return;
    await this.store.save({ ...e, spaceId });
    this.toasts.show(`Movido a ${this.ui.spaceById().get(spaceId ?? '')?.name ?? 'otro espacio'}`);
  }

  protected openUrl(u: string): void {
    const href = /^https?:\/\//.test(u) ? u : `https://${u}`;
    window.open(href, '_blank', 'noopener,noreferrer');
    this.used();
  }

  /** Lanza la app del banco en Android (Chrome entiende intent://). En PC no hace nada útil. */
  protected openBank(c: CardEntry): void {
    if (c.bankAppUrl) {
      location.href = c.bankAppUrl;
      return;
    }
    if (!/Android/.test(navigator.userAgent)) {
      this.toasts.show('Abre la app del banco en tu teléfono para ver el CVV dinámico', 'info');
      return;
    }
    location.href = `intent://#Intent;package=${c.bankAppPackage};action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end`;
  }

  protected async download(a: AttachmentRef): Promise<void> {
    try {
      const blob = await this.store.openFile(a);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = a.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      this.toasts.show('No se pudo abrir el adjunto (¿sin conexión?)', 'error');
    }
  }

  protected async restore(h: HistoryEntry): Promise<void> {
    const e = this.entry();
    if (!e) return;
    if (h.snapshot) {
      await this.store.save({ ...(h.snapshot as Entry), id: e.id, history: e.history } as Entry);
      this.toasts.show('Versión restaurada');
    } else if (h.password !== undefined && (e.kind === 'login' || e.kind === 'wifi')) {
      await this.store.save({ ...e, password: h.password });
      this.toasts.show('Contraseña anterior restaurada');
    }
  }

  protected copy(v: string, what: string): void {
    void this.clipboard.copy(v, what);
  }

  protected size(n: number): string {
    return n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
  }

  protected date(iso?: string): string {
    return iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  }

  protected daysUntil(iso: string): number {
    return Math.ceil((+new Date(iso + 'T23:59:59') - Date.now()) / 86_400_000);
  }
}
