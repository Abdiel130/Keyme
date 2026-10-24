import type { KdfParams, KeymeExport } from '@keyme/crypto';

export type WorkerRequest =
  | { op: 'createVault'; password: string; params?: KdfParams }
  | { op: 'deriveAuth'; password: string; salt: string; params: KdfParams }
  | { op: 'unlockPassword'; password: string; salt: string; params: KdfParams; wrappedVaultKey: string }
  | { op: 'unlockPrf'; prf: string; wrapped: string }
  | { op: 'wrapPrf'; prf: string }
  | { op: 'encrypt'; id: string; payload: unknown }
  | { op: 'decryptMany'; items: { id: string; blob: string }[] }
  | { op: 'rekey'; password: string; params?: KdfParams }
  | { op: 'rotate'; password: string; salt: string; params: KdfParams; currentWrapped: string; items: { id: string; payload: unknown }[] }
  | { op: 'commitRotation' }
  | { op: 'encryptAttachment'; data: ArrayBuffer }
  | { op: 'decryptAttachment'; key: string; data: ArrayBuffer }
  | { op: 'exportVault'; password: string; payload: unknown }
  | { op: 'importKeyme'; password: string; file: KeymeExport }
  | { op: 'lock' };

export type WorkerResponse = { seq: number; ok: true; result: unknown } | { seq: number; ok: false; error: string };

export interface KeyMaterial {
  salt: string;
  params: KdfParams;
  wrappedVaultKey: string;
  authKey: string;
}
