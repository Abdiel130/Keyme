import Dexie, { type Table } from 'dexie';
import type { KdfParams } from '@keyme/crypto';

/** Copia local cifrada de un registro del vault. */
export interface LocalRecord {
  id: string;
  /** null = borrado (tombstone local pendiente o recibido). */
  blob: string | null;
  /** Revisión del servidor sobre la que se basa esta copia; null = nunca subido. */
  revision: number | null;
  /** 1 = cambio local pendiente de subir. */
  dirty: 0 | 1;
  deleted: 0 | 1;
  updatedAt: string;
}

/** Adjunto cifrado guardado localmente (para verlo offline y subirlo al reconectar). */
export interface LocalFile {
  id: string;
  itemId: string;
  data: ArrayBuffer;
  uploaded: 0 | 1;
}

export interface Meta {
  key: string;
  value: unknown;
}

export interface SessionMeta {
  token: string;
  deviceId: string;
  expiresAt: string;
}

export interface KeysMeta {
  salt: string;
  params: KdfParams;
  wrappedVaultKey: string;
  passwordChangedAt: string | null;
}

export interface PrfMeta {
  credentialId: string;
  salt: string;
  wrapped: string;
  rpId: string;
  createdAt: string;
}

class KeymeDb extends Dexie {
  records!: Table<LocalRecord, string>;
  files!: Table<LocalFile, string>;
  meta!: Table<Meta, string>;

  constructor() {
    super('keyme');
    this.version(1).stores({
      records: 'id, dirty, deleted',
      files: 'id, itemId, uploaded',
      meta: 'key',
    });
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.meta.get(key))?.value as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.meta.put({ key, value });
  }

  async delMeta(key: string): Promise<void> {
    await this.meta.delete(key);
  }
}

export const db = new KeymeDb();
