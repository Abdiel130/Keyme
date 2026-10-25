import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  DOC_LABELS, KIND_LABELS, formatCard, hostOf, isEntry, wifiQrPayload,
  type AttachmentRef, type CardEntry, type Entry, type HistoryEntry, type LoginEntry,
} from '@keyme/models';
import { Clipboard } from '../../core/clipboard.service';
import { Toasts } from '../../core/toasts';
import { UiState } from '../../core/ui-state';
import { VaultStore } from '../../core/vault.store';
import { Avatar } from '../../ui/avatar';
import { CardVisual } from '../../ui/card-visual';
import { Icon } from '../../ui/icon';
import { QrCode } from '../../ui/qr-code';
import { SecretRow } from '../../ui/secret-row';
import { StrengthMeter } from '../../ui/strength-meter';
import { TotpCode } from '../../ui/totp-code';

@Component({
  selector: 'km-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Avatar, CardVisual, Icon, QrCode, SecretRow, StrengthMeter, TotpCode],
  templateUrl: './detail.html',
  styleUrl: './detail.scss',
})
export class Detail {
  protected store = inject(VaultStore);
  protected ui = inject(UiState);
  private router = inject(Router);
  private clipboard = inject(Clipboard);
  private toasts = inject(Toasts);

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
  protected readonly confirmDelete = signal(false);
  protected readonly showHistory = signal(false);
  protected readonly revealCard = signal(false);
  protected readonly previews = signal<Record<string, string>>({});

  protected readonly kindLabel = KIND_LABELS;
  protected readonly docLabel: Record<string, string> = DOC_LABELS;
  protected readonly formatCard = formatCard;
  protected readonly hostOf = hostOf;
  protected readonly wifiQr = wifiQrPayload;

  constructor() {
    const urls: string[] = [];
    inject(DestroyRef).onDestroy(() => urls.forEach((u) => URL.revokeObjectURL(u)));
    // Vista previa de imágenes adjuntas (descifradas en memoria).
    effect(async () => {
      const e = this.entry();
      this.revealCard.set(false);
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
    await this.store.remove(e.id);
    this.toasts.show(`“${e.title || 'Elemento'}” eliminado`);
    void this.router.navigate(['/']);
  }

  protected async duplicate(): Promise<void> {
    const e = this.entry();
    if (!e) return;
    const { uuidv7 } = await import('@keyme/models');
    const now = new Date().toISOString();
    const copy = { ...structuredClone(e), id: uuidv7(), title: `${e.title} (copia)`, history: [], attachments: [], createdAt: now, usage: undefined };
    await this.store.save(copy);
    void this.router.navigate(['/item', copy.id]);
  }

  protected async moveTo(spaceId: string | null): Promise<void> {
    const e = this.entry();
    if (e) await this.store.save({ ...e, spaceId });
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
