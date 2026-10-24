import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DEFAULT_SETTINGS,
  DEFAULT_SPACES,
  SETTINGS_ID,
  isEntry,
  normalizeEntry,
  uuidv7,
  type AttachmentRef,
  type Entry,
  type HistoryEntry,
  type Settings,
  type Space,
  type VaultRecord,
} from '@keyme/models';
import { Api, ApiError, type KeyMaterialDto, type SessionDto, type SyncItemDto } from './api';
import { CryptoClient, CryptoError } from './crypto.client';
import { db, type KeysMeta, type LocalRecord, type SessionMeta } from './db';

export type VaultState = 'boot' | 'setup' | 'no-server' | 'locked' | 'unlocked' | 'revoked';
export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';

const HISTORY_LIMIT = 25;
const BATCH = 200;
/** Si el token vence antes de esto, se renueva al desbloquear con contraseña. */
const TOKEN_REFRESH_DAYS = 16;

export function defaultDeviceName(): string {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Dispositivo';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  return `${browser} en ${os}`;
}

@Injectable({ providedIn: 'root' })
export class VaultStore {
  private api = inject(Api);
  private crypto = inject(CryptoClient);

  readonly state = signal<VaultState>('boot');
  readonly records = signal<ReadonlyMap<string, VaultRecord>>(new Map());
  readonly undecryptable = signal(0);
  /** El asistente de creación sigue en pantalla (paso del kit de emergencia). */
  readonly onboarding = signal(false);

  readonly syncState = signal<SyncState>('idle');
  readonly pending = signal(0);
  readonly lastSyncAt = signal<Date | null>(null);
  readonly online = signal(navigator.onLine);

  readonly entries = computed(() => [...this.records().values()].filter(isEntry));
  readonly spaces = computed(() =>
    [...this.records().values()].filter((r): r is Space => r.kind === 'space').sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
  );
  readonly settings = computed<Settings>(() => {
    const s = this.records().get(SETTINGS_ID) as Settings | undefined;
    return { ...DEFAULT_SETTINGS, modifiedAt: '', ...s, generator: { ...DEFAULT_SETTINGS.generator, ...s?.generator } };
  });

  /** Auth Key en memoria mientras está desbloqueado: permite renovar el token sin volver a pedir la contraseña. */
  private authKey: string | null = null;
  private session: SessionMeta | null = null;
  private syncing: Promise<void> | null = null;
  private syncAgain = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    addEventListener('online', () => {
      this.online.set(true);
      void this.sync();
    });
    addEventListener('offline', () => {
      this.online.set(false);
      this.syncState.set('offline');
    });
  }

  // -------------------------------------------------------------------------
  // Arranque y sesión
  // -------------------------------------------------------------------------

  async boot(): Promise<void> {
    this.session = (await db.getMeta<SessionMeta>('session')) ?? null;
    this.api.token = this.session?.token ?? null;
    if (await db.getMeta<KeysMeta>('keys')) {
      this.state.set('locked');
      return;
    }
    try {
      const status = await this.api.status();
      this.state.set(status.initialized ? 'locked' : 'setup');
    } catch {
      this.state.set('no-server');
    }
  }

  async hasLocalVault(): Promise<boolean> {
    return !!(await db.getMeta<KeysMeta>('keys'));
  }

  async create(setupToken: string, password: string, deviceName: string): Promise<void> {
    const km = await this.crypto.createVault(password);
    const res = await this.api.setup({
      setup_token: setupToken.trim(),
      auth_key: km.authKey,
      kdf_salt: km.salt,
      kdf_params: km.params,
      wrapped_vault_key: km.wrappedVaultKey,
      device_name: deviceName,
    });
    this.authKey = km.authKey;
    await this.storeSession(res);
    await db.setMeta('cursor', 0);
    await db.setMeta('lastPasswordAt', new Date().toISOString());
    this.records.set(new Map());
    this.state.set('unlocked');

    const now = new Date().toISOString();
    await this.save({ ...DEFAULT_SETTINGS, modifiedAt: now } as Settings);
    for (const [i, s] of DEFAULT_SPACES.entries()) {
      await this.save({ id: uuidv7(), kind: 'space', order: i, modifiedAt: now, ...s });
    }
    this.startSync();
  }

  /**
   * Desbloqueo con contraseña maestra. Con copia local funciona sin red; sin
   * ella (dispositivo nuevo) necesita el servidor.
   */
  async unlock(password: string): Promise<void> {
    const keys = await db.getMeta<KeysMeta>('keys');
    if (keys) {
      try {
        const { authKey } = await this.crypto.unlockPassword(password, keys.salt, keys.params, keys.wrappedVaultKey);
        this.authKey = authKey;
      } catch (e) {
        // ¿La contraseña cambió en otro dispositivo? Con red, se prueba contra el material del servidor.
        if (!(e instanceof CryptoError && e.code === 'bad_password')) throw e;
        try {
          await this.unlockViaServer(password);
        } catch (e2) {
          throw e2 instanceof ApiError && e2.offline ? e : e2;
        }
      }
      await db.setMeta('lastPasswordAt', new Date().toISOString());
      this.passwordChangedElsewhere.set(false);
      await this.afterUnlock();
      void this.refreshSession(password);
      return;
    }

    await this.unlockViaServer(password);
    await db.setMeta('lastPasswordAt', new Date().toISOString());
    await this.afterUnlock();
  }

  /** Deriva con el salt del servidor, inicia sesión y adopta su llave envuelta. */
  private async unlockViaServer(password: string): Promise<void> {
    const pre = await this.api.prelogin();
    let authKey: string;
    try {
      ({ authKey } = await this.crypto.deriveAuth(password, pre.kdf_salt, pre.kdf_params));
      const res = await this.api.login({ auth_key: authKey, device_name: defaultDeviceName(), device_id: this.session?.deviceId });
      await this.crypto.unlockPassword(password, res.kdf_salt, res.kdf_params, res.wrapped_vault_key);
      await this.storeSession(res);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'bad_credentials') throw new CryptoError('bad_password');
      throw e;
    }
    this.authKey = authKey;
  }

  /** Desbloqueo con Windows Hello: la salida PRF ya la obtuvo WebAuthn. */
  async unlockWithPrf(prf: string, wrapped: string): Promise<void> {
    await this.crypto.unlockPrf(prf, wrapped);
    this.authKey = null;
    await this.afterUnlock();
  }

  private async afterUnlock(): Promise<void> {
    await this.loadLocal();
    this.state.set('unlocked');
    this.startSync();
  }

  /**
   * Con red: verifica que la contraseña no haya cambiado en otro dispositivo
   * y renueva el token si está por vencer.
   */
  private async refreshSession(password: string): Promise<void> {
    try {
      const expires = this.session ? new Date(this.session.expiresAt) : null;
      const soon = !expires || +expires - Date.now() < TOKEN_REFRESH_DAYS * 86_400_000;
      if (!soon) {
        const s = await this.api.session();
        const local = await db.getMeta<KeysMeta>('keys');
        if (local && s.wrapped_vault_key === local.wrappedVaultKey) return;
      }
      await this.relogin(password);
    } catch {
      // Sin red: seguimos con la copia local.
    }
  }

  private async relogin(password?: string): Promise<boolean> {
    let authKey = this.authKey;
    if (password) {
      const pre = await this.api.prelogin();
      authKey = (await this.crypto.deriveAuth(password, pre.kdf_salt, pre.kdf_params)).authKey;
    }
    if (!authKey) return false;
    try {
      const res = await this.api.login({ auth_key: authKey, device_name: defaultDeviceName(), device_id: this.session?.deviceId });
      const local = await db.getMeta<KeysMeta>('keys');
      const changed = !!local && local.wrappedVaultKey !== res.wrapped_vault_key;
      if (changed && password) {
        await this.crypto.unlockPassword(password, res.kdf_salt, res.kdf_params, res.wrapped_vault_key);
      }
      this.authKey = authKey;
      await this.storeSession(res);
      if (changed && !password) {
        // La Vault Key se rotó en otro dispositivo: hay que desbloquear de nuevo
        // para obtenerla, y la copia local (cifrada con la vieja) se reconstruye.
        await this.lock();
        this.keyRotatedElsewhere.set(true);
        return false;
      }
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'bad_credentials') {
        // La contraseña cambió en otro dispositivo: la sesión de este ya no sirve.
        this.passwordChangedElsewhere.set(true);
      }
      return false;
    }
  }

  readonly passwordChangedElsewhere = signal(false);
  readonly keyRotatedElsewhere = signal(false);

  private async storeSession(res: SessionDto): Promise<void> {
    this.session = { token: res.token, deviceId: res.device_id, expiresAt: res.expires_at };
    this.api.token = res.token;
    await db.setMeta('session', this.session);
    await this.storeKeys(res);
  }

  private async storeKeys(k: KeyMaterialDto): Promise<void> {
    await db.setMeta('keys', {
      salt: k.kdf_salt,
      params: k.kdf_params,
      wrappedVaultKey: k.wrapped_vault_key,
      passwordChangedAt: k.password_changed_at,
    } satisfies KeysMeta);
  }

  get deviceId(): string | null {
    return this.session?.deviceId ?? null;
  }

  async lock(): Promise<void> {
    if (this.state() !== 'unlocked') return;
    this.stopSync();
    await this.crypto.lock();
    this.authKey = null;
    this.records.set(new Map());
    this.state.set('locked');
  }

  /** Borra todo lo local de este navegador (no toca el servidor). */
  async forget(): Promise<void> {
    this.stopSync();
    await this.crypto.lock();
    try {
      await this.api.logout();
    } catch {
      /* sin red: el token caduca solo o se revoca desde otro dispositivo */
    }
    await db.delete();
    await db.open();
    this.session = null;
    this.api.token = null;
    this.authKey = null;
    this.records.set(new Map());
    await this.boot();
  }

  // -------------------------------------------------------------------------
  // Registros
  // -------------------------------------------------------------------------

  private async loadLocal(): Promise<void> {
    const rows = await db.records.where('deleted').equals(0).toArray();
    const out = await this.crypto.decryptMany(rows.filter((r) => r.blob).map((r) => ({ id: r.id, blob: r.blob! })));
    const map = new Map<string, VaultRecord>();
    const bad: string[] = [];
    for (const it of out) {
      if (it.payload) map.set(it.id, this.revive(it.payload as VaultRecord));
      else bad.push(it.id);
    }
    if (bad.length) {
      // Copias cifradas con una llave anterior (rotación en otro dispositivo):
      // se descartan las que no tienen cambios pendientes y se resincroniza todo.
      const dirty = new Set(rows.filter((r) => r.dirty).map((r) => r.id));
      await db.records.bulkDelete(bad.filter((id) => !dirty.has(id)));
      await db.setMeta('cursor', 0);
    }
    this.records.set(map);
    this.undecryptable.set(bad.length);
    this.keyRotatedElsewhere.set(false);
    await this.countPending();
  }

  private revive(r: VaultRecord): VaultRecord {
    return isEntry(r) ? normalizeEntry(r) : r;
  }

  get(id: string): VaultRecord | undefined {
    return this.records().get(id);
  }

  /** Guarda (crea o actualiza). Registra historial de contraseñas y rotación. */
  async save<T extends VaultRecord>(record: T, opts: { touch?: boolean } = {}): Promise<T> {
    const now = new Date().toISOString();
    const prev = this.records().get(record.id);
    let next = { ...record } as T;
    if (opts.touch !== false) next.modifiedAt = now;

    if (isEntry(next) && prev && isEntry(prev) && (next.kind === 'login' || next.kind === 'wifi') && prev.kind === next.kind) {
      const oldPass = (prev as { password: string }).password;
      if (oldPass && oldPass !== (next as { password: string }).password) {
        const h: HistoryEntry = { at: now, password: oldPass, reason: 'edit' };
        next = { ...next, history: [h, ...next.history].slice(0, HISTORY_LIMIT), rotatedAt: now };
      }
    }
    if (isEntry(next) && !prev && !next.rotatedAt) next = { ...next, rotatedAt: now };

    await this.writeLocal(next);
    return next;
  }

  private async writeLocal(record: VaultRecord): Promise<void> {
    const blob = await this.crypto.encrypt(record.id, record);
    await db.transaction('rw', db.records, async () => {
      const cur = await db.records.get(record.id);
      await db.records.put({ id: record.id, blob, revision: cur?.revision ?? null, dirty: 1, deleted: 0, updatedAt: new Date().toISOString() });
    });
    const map = new Map(this.records());
    map.set(record.id, record);
    this.records.set(map);
    await this.countPending();
    this.scheduleSync();
  }

  async remove(id: string): Promise<void> {
    const rec = this.records().get(id);
    await db.transaction('rw', db.records, async () => {
      const cur = await db.records.get(id);
      if (!cur) return;
      if (cur.revision === null) await db.records.delete(id);
      else await db.records.put({ ...cur, blob: null, dirty: 1, deleted: 1, updatedAt: new Date().toISOString() });
    });
    if (rec && isEntry(rec)) for (const a of rec.attachments) await this.deleteFile(a.id);
    const map = new Map(this.records());
    map.delete(id);
    this.records.set(map);
    await this.countPending();
    this.scheduleSync();
  }

  /** Cuenta un uso (orden del autocompletado). Como mucho una escritura por hora por elemento. */
  async markUsed(entry: Entry): Promise<void> {
    const last = entry.usage?.lastUsedAt ? +new Date(entry.usage.lastUsedAt) : 0;
    if (Date.now() - last < 3_600_000) return;
    await this.save({ ...entry, usage: { count: (entry.usage?.count ?? 0) + 1, lastUsedAt: new Date().toISOString() } }, { touch: false });
  }

  async saveSettings(patch: Partial<Settings>): Promise<void> {
    await this.save({ ...this.settings(), ...patch, id: SETTINGS_ID, kind: 'settings' } as Settings);
  }

  /** Inserta muchos registros (importación) en una sola pasada. */
  async bulkInsert(records: VaultRecord[]): Promise<void> {
    const map = new Map(this.records());
    const rows: LocalRecord[] = [];
    const now = new Date().toISOString();
    for (const r of records) {
      rows.push({ id: r.id, blob: await this.crypto.encrypt(r.id, r), revision: null, dirty: 1, deleted: 0, updatedAt: now });
      map.set(r.id, r);
    }
    await db.records.bulkPut(rows);
    this.records.set(map);
    await this.countPending();
    void this.sync();
  }

  // -------------------------------------------------------------------------
  // Adjuntos
  // -------------------------------------------------------------------------

  async addFile(itemId: string, file: File): Promise<AttachmentRef> {
    const { key, data } = await this.crypto.encryptAttachment(await file.arrayBuffer());
    const id = uuidv7();
    await db.files.put({ id, itemId, data, uploaded: 0 });
    this.scheduleSync();
    return { id, name: file.name, mime: file.type || 'application/octet-stream', size: file.size, key };
  }

  async openFile(ref: AttachmentRef): Promise<Blob> {
    let local = await db.files.get(ref.id);
    if (!local) {
      const data = await this.api.getAttachment(ref.id);
      local = { id: ref.id, itemId: '', data, uploaded: 1 };
      await db.files.put(local);
    }
    const plain = await this.crypto.decryptAttachment(ref.key, local.data.slice(0));
    return new Blob([plain], { type: ref.mime });
  }

  async deleteFile(id: string): Promise<void> {
    await db.files.delete(id);
    try {
      await this.api.deleteAttachment(id);
    } catch {
      const q = (await db.getMeta<string[]>('fileDeletes')) ?? [];
      await db.setMeta('fileDeletes', [...q, id]);
    }
  }

  // -------------------------------------------------------------------------
  // Sincronización
  // -------------------------------------------------------------------------

  private startSync(): void {
    this.stopSync();
    void this.sync();
    this.timer = setInterval(() => void this.sync(), 60_000);
  }

  private stopSync(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.debounce) clearTimeout(this.debounce);
    this.timer = this.debounce = null;
  }

  private scheduleSync(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.sync(), 800);
  }

  private async countPending(): Promise<void> {
    this.pending.set((await db.records.where('dirty').equals(1).count()) + (await db.files.where('uploaded').equals(0).count()));
  }

  sync(): Promise<void> {
    if (this.state() !== 'unlocked' || !this.api.token) return Promise.resolve();
    if (this.syncing) {
      this.syncAgain = true;
      return this.syncing;
    }
    this.syncing = (async () => {
      this.syncState.set('syncing');
      try {
        do {
          this.syncAgain = false;
          await this.withAuth(async () => {
            await this.uploadFiles();
            await this.push();
            await this.pull();
            await this.push(); // lo que resolvió un conflicto durante el pull
          });
        } while (this.syncAgain);
        this.syncState.set('idle');
        this.lastSyncAt.set(new Date());
      } catch (e) {
        if (e instanceof ApiError && e.offline) this.syncState.set('offline');
        else if (e instanceof ApiError && e.code === 'device_revoked') await this.onRevoked();
        else {
          console.error('[keyme] sync', e);
          this.syncState.set('error');
        }
      } finally {
        this.syncing = null;
        await this.countPending();
      }
    })();
    return this.syncing;
  }

  /** Reintenta una vez tras renovar el token si caducó. */
  private async withAuth(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && e.code !== 'device_revoked') {
        if (await this.relogin()) return fn();
        this.needsPassword.set(true);
      }
      throw e;
    }
  }

  /** El token caducó y no hay Auth Key en memoria (se desbloqueó con Windows Hello). */
  readonly needsPassword = signal(false);

  private async onRevoked(): Promise<void> {
    // Revocación remota (p. ej. teléfono robado): se borra la copia local.
    this.stopSync();
    await this.crypto.lock();
    await db.delete();
    await db.open();
    this.records.set(new Map());
    this.session = null;
    this.api.token = null;
    this.state.set('revoked');
  }

  private async push(): Promise<void> {
    for (let pass = 0; pass < 4; pass++) {
      const dirty = await db.records.where('dirty').equals(1).toArray();
      if (!dirty.length) return;
      let conflicts = 0;
      for (let i = 0; i < dirty.length; i += BATCH) {
        const chunk = dirty.slice(i, i + BATCH);
        const res = await this.api.batch(chunk.map((r) => ({ id: r.id, blob: r.deleted ? null : r.blob, base_revision: r.revision })));
        for (const [j, out] of res.results.entries()) {
          const sent = chunk[j];
          if (out.status === 200) {
            await db.transaction('rw', db.records, async () => {
              const cur = await db.records.get(sent.id);
              if (!cur) return;
              if (sent.deleted && cur.deleted && cur.blob === null) {
                await db.records.delete(sent.id);
              } else if (cur.blob === sent.blob) {
                await db.records.put({ ...cur, revision: out.revision!, dirty: 0 });
              } else {
                await db.records.put({ ...cur, revision: out.revision! }); // cambió mientras subía: sigue sucio
              }
            });
          } else if (out.status === 409 && out.item) {
            conflicts++;
            await this.resolveConflict(sent, out.item);
          } else {
            throw new ApiError(out.status, 'batch_item_failed');
          }
        }
      }
      if (!conflicts) return;
    }
  }

  /**
   * Conflicto: dos dispositivos editaron lo mismo. Gana el más reciente
   * (modifiedAt dentro del JSON cifrado) y el perdedor queda en el historial
   * del elemento, así nunca se pierde una contraseña.
   */
  private async resolveConflict(local: LocalRecord, server: SyncItemDto): Promise<void> {
    const mine = local.deleted ? null : this.records().get(local.id) ?? null;
    let theirs: VaultRecord | null = null;
    if (!server.deleted && server.blob) {
      const [d] = await this.crypto.decryptMany([{ id: server.id, blob: server.blob }]);
      theirs = d.payload ? this.revive(d.payload as VaultRecord) : null;
    }

    if (!mine && !theirs) {
      await db.records.delete(local.id);
      return;
    }
    if (!mine && theirs) {
      // Borré aquí, pero allá lo editaron: se conserva la edición.
      await this.applyRemote(server, theirs);
      return;
    }
    if (mine && !theirs) {
      // Allá lo borraron, aquí lo edité: se conserva mi versión.
      await db.records.update(local.id, { revision: server.revision });
      return;
    }

    const a = mine!;
    const b = theirs!;
    const winner = (b.modifiedAt ?? '') > (a.modifiedAt ?? '') ? b : a;
    const loser = winner === a ? b : a;
    let merged: VaultRecord = winner;
    if (isEntry(winner) && isEntry(loser) && JSON.stringify({ ...loser, history: [] }) !== JSON.stringify({ ...winner, history: [] })) {
      const { history: _h, ...snapshot } = loser;
      const seen = new Set(winner.history.map((h) => h.at + (h.password ?? '')));
      const extra = loser.history.filter((h) => !seen.has(h.at + (h.password ?? '')));
      merged = {
        ...winner,
        history: [{ at: new Date().toISOString(), snapshot, reason: 'conflict' as const }, ...winner.history, ...extra]
          .sort((x, y) => y.at.localeCompare(x.at))
          .slice(0, HISTORY_LIMIT),
      };
    }
    const blob = await this.crypto.encrypt(merged.id, merged);
    await db.records.put({ id: merged.id, blob, revision: server.revision, dirty: 1, deleted: 0, updatedAt: new Date().toISOString() });
    const map = new Map(this.records());
    map.set(merged.id, merged);
    this.records.set(map);
  }

  private async applyRemote(server: SyncItemDto, payload: VaultRecord): Promise<void> {
    await db.records.put({ id: server.id, blob: server.blob, revision: server.revision, dirty: 0, deleted: 0, updatedAt: server.updated_at });
    const map = new Map(this.records());
    map.set(server.id, payload);
    this.records.set(map);
  }

  private async pull(): Promise<void> {
    const cursor = (await db.getMeta<number>('cursor')) ?? 0;
    const res = await this.api.pull(cursor);
    const incoming = res.items.filter((i) => !i.deleted && i.blob);
    const decrypted = new Map(
      (await this.crypto.decryptMany(incoming.map((i) => ({ id: i.id, blob: i.blob! })))).map((d) => [d.id, d] as const),
    );

    const map = new Map(this.records());
    const seen = new Set<string>();
    await db.transaction('rw', db.records, async () => {
      for (const item of res.items) {
        seen.add(item.id);
        const cur = await db.records.get(item.id);
        if (cur?.dirty) {
          // Cambio local pendiente: el próximo push detectará el conflicto.
          continue;
        }
        if (item.deleted) {
          if (cur) await db.records.delete(item.id);
          map.delete(item.id);
          continue;
        }
        const d = decrypted.get(item.id);
        await db.records.put({ id: item.id, blob: item.blob, revision: item.revision, dirty: 0, deleted: 0, updatedAt: item.updated_at });
        if (d?.payload) map.set(item.id, this.revive(d.payload as VaultRecord));
      }
      if (res.full && cursor > 0) {
        // Sincronización completa: lo que no vino y no está pendiente ya no existe.
        const stale = await db.records.filter((r) => !r.dirty && r.revision !== null && !seen.has(r.id)).primaryKeys();
        await db.records.bulkDelete(stale);
        for (const id of stale) map.delete(id);
      }
    });
    if (res.items.length) this.records.set(map);
    await db.setMeta('cursor', res.revision);
  }

  private async uploadFiles(): Promise<void> {
    const pendingFiles = await db.files.where('uploaded').equals(0).toArray();
    for (const f of pendingFiles) {
      await this.api.putAttachment(f.id, f.itemId, f.data.slice(0));
      await db.files.update(f.id, { uploaded: 1 });
    }
    const deletes = (await db.getMeta<string[]>('fileDeletes')) ?? [];
    for (const id of deletes) await this.api.deleteAttachment(id);
    if (deletes.length) await db.delMeta('fileDeletes');
  }

  // -------------------------------------------------------------------------
  // Mantenimiento de llaves
  // -------------------------------------------------------------------------

  async changePassword(current: string, next: string, revokeOthers: boolean): Promise<void> {
    const keys = (await db.getMeta<KeysMeta>('keys'))!;
    const { authKey: currentAuth } = await this.crypto.deriveAuth(current, keys.salt, keys.params);
    const km = await this.crypto.rekey(next);
    const res = await this.api.rekey({
      current_auth_key: currentAuth,
      auth_key: km.authKey,
      kdf_salt: km.salt,
      kdf_params: km.params,
      wrapped_vault_key: km.wrappedVaultKey,
      revoke_others: revokeOthers,
    });
    await this.storeKeys(res);
    this.authKey = km.authKey;
    await db.delMeta('prf'); // la llave PRF envuelve la misma Vault Key, pero se re-registra por higiene
    await db.setMeta('lastPasswordAt', new Date().toISOString());
  }

  /** Nueva Vault Key y re-cifrado de todo (si se sospecha compromiso). */
  async rotateVaultKey(password: string): Promise<void> {
    await this.sync();
    if (this.pending()) throw new Error('Hay cambios sin subir; conéctate al servidor antes de rotar.');
    const keys = (await db.getMeta<KeysMeta>('keys'))!;
    const rows = await db.records.where('deleted').equals(0).toArray();
    const items = rows.map((r) => ({ id: r.id, payload: this.records().get(r.id) })).filter((i) => i.payload);
    const out = await this.crypto.rotate(password, keys.salt, keys.params, keys.wrappedVaultKey, items);
    const revs = new Map(rows.map((r) => [r.id, r.revision ?? 0]));
    const res = await this.api.rotate({
      current_auth_key: out.authKey,
      wrapped_vault_key: out.wrappedVaultKey,
      items: out.items.map((i) => ({ ...i, base_revision: revs.get(i.id)! })),
    });
    await this.crypto.commitRotation();
    await this.storeKeys(res);
    // Todo cambió de revisión y de llave: se descarta la copia local y una
    // sincronización completa la reconstruye con los blobs nuevos.
    await db.records.clear();
    await db.setMeta('cursor', 0);
    await db.delMeta('prf');
    await this.sync();
  }

  async verifyPassword(password: string): Promise<boolean> {
    const keys = await db.getMeta<KeysMeta>('keys');
    if (!keys) return false;
    try {
      await this.crypto.unlockPassword(password, keys.salt, keys.params, keys.wrappedVaultKey);
      return true;
    } catch {
      return false;
    }
  }
}
