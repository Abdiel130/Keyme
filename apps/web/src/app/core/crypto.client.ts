import { Injectable } from '@angular/core';
import type { KdfParams, KeymeExport } from '@keyme/crypto';
import type { KeyMaterial, WorkerRequest, WorkerResponse } from './crypto.protocol';

export class CryptoError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/** Puente al worker de cifrado. Cada desbloqueo crea un worker nuevo; bloquear lo termina. */
@Injectable({ providedIn: 'root' })
export class CryptoClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./crypto.worker', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      const p = this.pending.get(data.seq);
      if (!p) return;
      this.pending.delete(data.seq);
      data.ok ? p.resolve(data.result) : p.reject(new CryptoError(data.error));
    };
    w.onerror = (e) => {
      for (const p of this.pending.values()) p.reject(new CryptoError(e.message || 'worker_error'));
      this.pending.clear();
    };
    this.worker = w;
    return w;
  }

  private call<T>(req: WorkerRequest, transfer: Transferable[] = []): Promise<T> {
    const seq = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(seq, { resolve: resolve as (v: unknown) => void, reject });
      this.ensure().postMessage({ seq, req }, transfer);
    });
  }

  createVault(password: string, params?: KdfParams) {
    return this.call<KeyMaterial>({ op: 'createVault', password, params });
  }

  deriveAuth(password: string, salt: string, params: KdfParams) {
    return this.call<{ authKey: string }>({ op: 'deriveAuth', password, salt, params });
  }

  unlockPassword(password: string, salt: string, params: KdfParams, wrappedVaultKey: string) {
    return this.call<{ authKey: string }>({ op: 'unlockPassword', password, salt, params, wrappedVaultKey });
  }

  unlockPrf(prf: string, wrapped: string) {
    return this.call<{ ok: true }>({ op: 'unlockPrf', prf, wrapped });
  }

  wrapPrf(prf: string) {
    return this.call<{ wrapped: string }>({ op: 'wrapPrf', prf });
  }

  async encrypt(id: string, payload: unknown): Promise<string> {
    return (await this.call<{ blob: string }>({ op: 'encrypt', id, payload })).blob;
  }

  async decryptMany(items: { id: string; blob: string }[]) {
    return (await this.call<{ items: { id: string; payload?: unknown; error?: string }[] }>({ op: 'decryptMany', items })).items;
  }

  rekey(password: string, params?: KdfParams) {
    return this.call<KeyMaterial>({ op: 'rekey', password, params });
  }

  rotate(password: string, salt: string, params: KdfParams, currentWrapped: string, items: { id: string; payload: unknown }[]) {
    return this.call<{ authKey: string; wrappedVaultKey: string; items: { id: string; blob: string }[] }>({
      op: 'rotate', password, salt, params, currentWrapped, items,
    });
  }

  commitRotation() {
    return this.call({ op: 'commitRotation' });
  }

  encryptAttachment(data: ArrayBuffer) {
    return this.call<{ key: string; data: ArrayBuffer }>({ op: 'encryptAttachment', data }, [data]);
  }

  async decryptAttachment(key: string, data: ArrayBuffer): Promise<ArrayBuffer> {
    return (await this.call<{ data: ArrayBuffer }>({ op: 'decryptAttachment', key, data }, [data])).data;
  }

  async exportVault(password: string, payload: unknown): Promise<KeymeExport> {
    return (await this.call<{ file: KeymeExport }>({ op: 'exportVault', password, payload })).file;
  }

  async importKeyme(password: string, file: KeymeExport): Promise<unknown> {
    return (await this.call<{ payload: unknown }>({ op: 'importKeyme', password, file })).payload;
  }

  /** Borra la llave y termina el worker. */
  async lock(): Promise<void> {
    if (!this.worker) return;
    try {
      await Promise.race([this.call({ op: 'lock' }), new Promise((r) => setTimeout(r, 300))]);
    } finally {
      this.worker?.terminate();
      this.worker = null;
      for (const p of this.pending.values()) p.reject(new CryptoError('locked'));
      this.pending.clear();
    }
  }
}
