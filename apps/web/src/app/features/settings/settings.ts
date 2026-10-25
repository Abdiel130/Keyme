import { ChangeDetectionStrategy, Component, computed, inject, signal, type OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SPACE_COLORS, isEntry, normalizeEntry, uuidv7, type Entry, type Settings, type SiteRule, type Space, type VaultRecord } from '@keyme/models';
import type { KeymeExport } from '@keyme/crypto';
import { Api, ApiError, type AuditDto, type DeviceDto } from '../../core/api';
import { CryptoClient, CryptoError } from '../../core/crypto.client';
import { db, type PrfMeta } from '../../core/db';
import { downloadEmergencyKit } from '../../core/emergency-kit';
import { dedupeKey, detectFormat, importBitwarden, importChromeCsv, importSafeInCloud, type ImportResult } from '../../core/importers';
import { strength } from '../../core/strength';
import { APP_VERSION, AppUpdates } from '../../core/app-updates';
import { Toasts } from '../../core/toasts';
import { VaultStore, defaultDeviceName } from '../../core/vault.store';
import { prfSupported, registerPrf } from '../../core/webauthn';
import { Icon, SPACE_ICONS } from '../../ui/icon';
import { InstallPrompt } from '../../core/install';
import { InstallButton } from '../../ui/install-button';
import { StrengthMeter } from '../../ui/strength-meter';

const EVENT_LABELS: Record<string, string> = {
  vault_created: 'Vault creado', login: 'Inicio de sesión', login_failed: 'Contraseña incorrecta', logout: 'Cierre de sesión',
  device_revoked: 'Dispositivo revocado', password_changed: 'Contraseña maestra cambiada', vault_key_rotated: 'Vault Key rotada', setup_rejected: 'Intento de instalación rechazado',
};

@Component({
  selector: 'km-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon, InstallButton, StrengthMeter],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class SettingsPage implements OnInit {
  protected store = inject(VaultStore);
  private api = inject(Api);
  private toasts = inject(Toasts);
  private cryptoClient = inject(CryptoClient);

  protected readonly s = computed(() => this.store.settings());
  protected readonly colors = SPACE_COLORS;
  protected readonly icons = SPACE_ICONS;
  protected readonly lockOptions = [1, 2, 5, 10, 15, 30, 60, 0];
  protected readonly clipOptions = [15, 30, 45, 60, 90, 0];
  protected readonly origin = location.origin;
  protected readonly version = APP_VERSION;
  protected updates = inject(AppUpdates);
  protected installer = inject(InstallPrompt);

  // Windows Hello
  protected readonly helloSupported = signal(false);
  protected readonly hello = signal<PrfMeta | null>(null);
  protected readonly helloBusy = signal(false);

  // Contraseña maestra
  protected cpCurrent = '';
  protected readonly cpNew = signal('');
  protected cpConfirm = '';
  protected cpRevoke = true;
  protected readonly cpBusy = signal(false);
  protected readonly cpOpen = signal(false);

  // Rotación
  protected rotPassword = '';
  protected readonly rotOpen = signal(false);
  protected readonly rotBusy = signal(false);

  // Espacios
  protected readonly editing = signal<string | null>(null);
  protected readonly deleting = signal<string | null>(null);
  protected moveTarget: string | null = null;

  // Reglas por sitio
  protected newRule: SiteRule = { domain: '', rule: { symbols: false } };

  // Importar / exportar
  protected readonly importFile = signal<{ name: string; text: string } | null>(null);
  protected readonly importPreview = signal<ImportResult | null>(null);
  protected readonly importNeedsPassword = signal(false);
  protected importPassword = '';
  protected importSpace: string | null = null;
  protected readonly importBusy = signal(false);
  protected exportPassword = '';
  protected exportConfirm = '';
  protected readonly exportBusy = signal(false);

  // Dispositivos y registro
  protected readonly devices = signal<DeviceDto[] | null>(null);
  protected readonly audit = signal<AuditDto[] | null>(null);
  protected readonly serverError = signal('');
  protected readonly renaming = signal<string | null>(null);
  protected renameValue = '';

  async ngOnInit(): Promise<void> {
    this.helloSupported.set(await prfSupported());
    const meta = await db.getMeta<PrfMeta>('prf');
    this.hello.set(meta && meta.rpId === location.hostname ? meta : null);
    this.importSpace = this.store.spaces()[0]?.id ?? null;
    if (location.hash) setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 50);
    await this.loadServer();
  }

  protected async loadServer(): Promise<void> {
    this.serverError.set('');
    try {
      const [d, a] = await Promise.all([this.api.devices(), this.api.audit()]);
      this.devices.set(d.devices);
      this.audit.set(a.events.slice(0, 60));
    } catch (e) {
      this.serverError.set(e instanceof ApiError && e.offline ? 'Sin conexión con el servidor.' : 'No se pudo cargar.');
    }
  }

  protected save(patch: Partial<Settings>): void {
    void this.store.saveSettings(patch);
  }

  // ----- App -------------------------------------------------------------

  protected async checkUpdates(): Promise<void> {
    const ready = await this.updates.check();
    this.toasts.show(ready ? 'Hay una versión nueva lista' : navigator.onLine ? 'Ya tienes la última versión' : 'Sin conexión con el servidor', ready || navigator.onLine ? 'ok' : 'error');
  }

  // ----- Windows Hello ---------------------------------------------------

  protected async enableHello(): Promise<void> {
    this.helloBusy.set(true);
    try {
      const reg = await registerPrf();
      if (!reg) {
        this.toasts.show('Este autenticador no soporta la extensión PRF', 'error');
        return;
      }
      const { wrapped } = await this.cryptoClient.wrapPrf(reg.prf);
      const meta: PrfMeta = { credentialId: reg.credentialId, salt: reg.salt, wrapped, rpId: location.hostname, createdAt: new Date().toISOString() };
      await db.setMeta('prf', meta);
      this.hello.set(meta);
      this.toasts.show('Windows Hello activado');
    } catch (e) {
      if ((e as Error).name !== 'NotAllowedError') this.toasts.show('No se pudo activar Windows Hello', 'error');
    } finally {
      this.helloBusy.set(false);
    }
  }


  protected async disableHello(): Promise<void> {
    await db.delMeta('prf');
    this.hello.set(null);
    this.toasts.show('Windows Hello desactivado en este navegador');
  }

  // ----- Contraseña y llaves --------------------------------------------

  protected readonly cpScore = computed(() => strength(this.cpNew()).score);

  protected async changePassword(): Promise<void> {
    if (this.cpNew() !== this.cpConfirm || this.cpScore() < 3) return;
    this.cpBusy.set(true);
    try {
      await this.store.changePassword(this.cpCurrent, this.cpNew(), this.cpRevoke);
      this.cpCurrent = this.cpConfirm = '';
      this.cpNew.set('');
      this.cpOpen.set(false);
      this.hello.set(null);
      this.toasts.show('Contraseña maestra actualizada. Descarga un kit de emergencia nuevo.');
    } catch (e) {
      this.toasts.show(
        e instanceof ApiError && e.code === 'bad_credentials' ? 'La contraseña actual no es correcta'
          : e instanceof ApiError && e.code === 'throttled' ? 'Demasiados intentos. Espera un minuto.'
          : e instanceof ApiError && e.offline ? 'Necesitas conexión con el servidor'
          : 'No se pudo cambiar',
        'error',
      );
    } finally {
      this.cpBusy.set(false);
    }
  }

  protected async rotate(): Promise<void> {
    this.rotBusy.set(true);
    try {
      await this.store.rotateVaultKey(this.rotPassword);
      this.rotPassword = '';
      this.rotOpen.set(false);
      this.hello.set(null);
      this.toasts.show('Vault Key rotada. Los demás dispositivos deberán volver a iniciar sesión.');
    } catch (e) {
      const msg = e instanceof CryptoError && e.code === 'bad_password' ? 'Contraseña incorrecta'
        : e instanceof ApiError && e.offline ? 'Necesitas conexión con el servidor'
        : e instanceof ApiError && e.code === 'stale' ? 'El vault cambió mientras rotabas; intenta de nuevo'
        : e instanceof ApiError && e.code === 'throttled' ? 'Demasiados intentos. Espera un minuto.'
        : (e as Error).message || 'No se pudo rotar';
      this.toasts.show(msg, 'error');
    } finally {
      this.rotBusy.set(false);
    }
  }

  protected kit(): void {
    void downloadEmergencyKit(defaultDeviceName());
  }

  // ----- Espacios -------------------------------------------------------

  protected async addSpace(): Promise<void> {
    const sp: Space = {
      id: uuidv7(), kind: 'space', name: 'Nuevo espacio', color: SPACE_COLORS[this.store.spaces().length % SPACE_COLORS.length],
      icon: 'layers', order: this.store.spaces().length, modifiedAt: '',
    };
    await this.store.save(sp);
    this.editing.set(sp.id);
  }

  protected async updateSpace(sp: Space, patch: Partial<Space>): Promise<void> {
    await this.store.save({ ...sp, ...patch });
  }

  protected async moveSpace(sp: Space, dir: -1 | 1): Promise<void> {
    const list = [...this.store.spaces()];
    const i = list.findIndex((x) => x.id === sp.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    for (const [order, x] of list.entries()) if (x.order !== order) await this.store.save({ ...x, order });
  }

  protected countIn(id: string): number {
    return this.store.entries().filter((e) => e.spaceId === id).length;
  }

  protected async deleteSpace(sp: Space): Promise<void> {
    for (const e of this.store.entries().filter((x) => x.spaceId === sp.id)) await this.store.save({ ...e, spaceId: this.moveTarget }, { touch: false });
    await this.store.remove(sp.id);
    this.deleting.set(null);
    this.toasts.show(`Espacio “${sp.name}” eliminado`);
  }

  // ----- Reglas por sitio -----------------------------------------------

  protected addRule(): void {
    const domain = this.newRule.domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!domain) return;
    const rules = [...this.s().siteRules.filter((r) => r.domain !== domain), { domain, rule: { ...this.newRule.rule } }];
    this.save({ siteRules: rules });
    this.newRule = { domain: '', rule: { symbols: false } };
  }

  protected removeRule(domain: string): void {
    this.save({ siteRules: this.s().siteRules.filter((r) => r.domain !== domain) });
  }

  // ----- Importar / exportar --------------------------------------------

  protected async pickImport(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const text = await file.text();
    this.importFile.set({ name: file.name, text });
    this.importPreview.set(null);
    const fmt = detectFormat(file.name, text);
    if (fmt === 'keyme') {
      this.importNeedsPassword.set(true);
      return;
    }
    this.importNeedsPassword.set(false);
    try {
      this.importPreview.set(this.parse(fmt, text));
    } catch (e) {
      this.toasts.show((e as Error).message || 'No pude leer el archivo', 'error');
      this.importFile.set(null);
    }
  }

  private parse(fmt: string | null, text: string): ImportResult {
    if (fmt === 'safeincloud') return importSafeInCloud(text, this.importSpace);
    if (fmt === 'bitwarden') return importBitwarden(text, this.importSpace);
    if (fmt === 'chrome') return importChromeCsv(text, this.importSpace);
    throw new Error('Formato no reconocido. Usa XML de SafeInCloud, JSON de Bitwarden, CSV de Chrome o un .keyme');
  }

  protected async unlockKeyme(): Promise<void> {
    const f = this.importFile();
    if (!f) return;
    this.importBusy.set(true);
    try {
      const payload = (await this.cryptoClient.importKeyme(this.importPassword, JSON.parse(f.text) as KeymeExport)) as { records: VaultRecord[] };
      const entries = payload.records.filter(isEntry).map((e) => normalizeEntry(e));
      const spaces = payload.records.filter((r): r is Space => r.kind === 'space');
      this.importPreview.set({ entries, skipped: 0, warnings: spaces.length ? [`Incluye ${spaces.length} espacio(s)`] : [] });
      this.keymeSpaces = spaces;
      this.importNeedsPassword.set(false);
    } catch {
      this.toasts.show('Contraseña de exportación incorrecta', 'error');
    } finally {
      this.importBusy.set(false);
    }
  }

  private keymeSpaces: Space[] = [];

  /** Re-asigna el espacio elegido a la vista previa. */
  protected pickSpaceAgain(): void {
    const p = this.importPreview();
    if (p) this.importPreview.set({ ...p, entries: p.entries.map((e) => ({ ...e, spaceId: this.importSpace })) });
  }

  protected readonly duplicates = computed(() => {
    const p = this.importPreview();
    if (!p) return 0;
    const existing = new Set(this.store.entries().map(dedupeKey));
    return p.entries.filter((e) => existing.has(dedupeKey(e))).length;
  });

  protected async doImport(): Promise<void> {
    const p = this.importPreview();
    if (!p) return;
    this.importBusy.set(true);
    try {
      const existing = new Set(this.store.entries().map(dedupeKey));
      const knownSpaces = new Set(this.store.spaces().map((s) => s.id));
      const fromKeyme = this.keymeSpaces.length > 0;
      const records: VaultRecord[] = [];
      for (const s of this.keymeSpaces) if (!knownSpaces.has(s.id)) records.push(s);
      for (const e of p.entries) {
        if (existing.has(dedupeKey(e))) continue;
        const entry: Entry = fromKeyme ? e : { ...e, spaceId: this.importSpace };
        records.push(this.store.get(entry.id) ? { ...entry, id: uuidv7() } : entry);
      }
      await this.store.bulkInsert(records);
      this.toasts.show(`Importados ${records.filter(isEntry).length} elementos`);
      this.importFile.set(null);
      this.importPreview.set(null);
      this.keymeSpaces = [];
      this.importPassword = '';
    } finally {
      this.importBusy.set(false);
    }
  }

  protected async doExport(): Promise<void> {
    if (!this.exportPassword || this.exportPassword !== this.exportConfirm) return;
    this.exportBusy.set(true);
    try {
      const records = [...this.store.records().values()];
      const file = await this.cryptoClient.exportVault(this.exportPassword, { records, exported_at: new Date().toISOString() });
      const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `keyme-${new Date().toISOString().slice(0, 10)}.keyme`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      this.exportPassword = this.exportConfirm = '';
      this.toasts.show('Exportación cifrada descargada');
    } finally {
      this.exportBusy.set(false);
    }
  }

  // ----- Dispositivos ---------------------------------------------------

  protected async revoke(d: DeviceDto): Promise<void> {
    try {
      await this.api.revokeDevice(d.id);
      this.toasts.show(`“${d.name}” revocado`);
      await this.loadServer();
    } catch {
      this.toasts.show('No se pudo revocar', 'error');
    }
  }

  protected async rename(d: DeviceDto): Promise<void> {
    const name = this.renameValue.trim();
    this.renaming.set(null);
    if (!name || name === d.name) return;
    await this.api.renameDevice(d.id, name);
    await this.loadServer();
  }

  protected eventLabel(e: string): string {
    return EVENT_LABELS[e] ?? e;
  }

  protected when(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const diff = (Date.now() - +d) / 60_000;
    if (diff < 2) return 'ahora';
    if (diff < 60) return `hace ${Math.round(diff)} min`;
    if (diff < 1440) return `hace ${Math.round(diff / 60)} h`;
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: diff > 300 * 1440 ? 'numeric' : undefined });
  }

  protected async forget(): Promise<void> {
    await this.store.forget();
  }
}
