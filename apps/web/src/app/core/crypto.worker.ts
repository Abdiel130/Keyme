/// <reference lib="webworker" />
/**
 * Worker de cifrado. La Vault Key vive SOLO aquí: el hilo principal manda
 * contraseñas y blobs, recibe blobs y JSON. Al bloquear, el hilo principal
 * termina este worker y la llave desaparece con él.
 */
import * as k from '@keyme/crypto';
import type { WorkerRequest, WorkerResponse } from './crypto.protocol';

let vaultKey: Uint8Array | null = null;
// Llave nueva durante una rotación, hasta que el servidor la confirma.
let pendingKey: Uint8Array | null = null;

function requireKey(): Uint8Array {
  if (!vaultKey) throw new Error('locked');
  return vaultKey;
}

function setKey(key: Uint8Array): void {
  if (vaultKey) k.wipe(vaultKey);
  vaultKey = key;
}

async function handle(req: WorkerRequest): Promise<unknown> {
  await k.ready();
  switch (req.op) {
    case 'createVault': {
      const v = k.createVault(req.password, req.params);
      setKey(v.vaultKey);
      return { salt: v.salt, params: v.params, wrappedVaultKey: v.wrappedVaultKey, authKey: v.authKey };
    }
    case 'deriveAuth': {
      const { wrapKey, authKey } = k.deriveKeys(req.password, req.salt, req.params);
      k.wipe(wrapKey);
      return { authKey };
    }
    case 'unlockPassword': {
      const { wrapKey, authKey } = k.deriveKeys(req.password, req.salt, req.params);
      try {
        setKey(k.unwrapVaultKey(req.wrappedVaultKey, wrapKey));
      } finally {
        k.wipe(wrapKey);
      }
      return { authKey };
    }
    case 'unlockPrf': {
      setKey(k.unwrapWithPrf(req.wrapped, k.fromB64(req.prf)));
      return { ok: true };
    }
    case 'wrapPrf':
      return { wrapped: k.wrapWithPrf(requireKey(), k.fromB64(req.prf)) };
    case 'encrypt':
      return { blob: k.encryptItem(requireKey(), req.id, req.payload) };
    case 'decryptMany': {
      const key = requireKey();
      const out: { id: string; payload?: unknown; error?: string }[] = [];
      for (const it of req.items) {
        try {
          out.push({ id: it.id, payload: k.decryptItem(key, it.id, it.blob) });
        } catch (e) {
          out.push({ id: it.id, error: (e as Error).message });
        }
      }
      return { items: out };
    }
    case 'rekey': {
      const r = k.rekey(requireKey(), req.password, req.params);
      return { salt: r.salt, params: r.params, wrappedVaultKey: r.wrappedVaultKey, authKey: r.authKey };
    }
    case 'rotate': {
      // Nueva Vault Key: re-cifra todo con ella y la envuelve con la contraseña actual.
      const fresh = k.newVaultKey();
      const { wrapKey, authKey } = k.deriveKeys(req.password, req.salt, req.params);
      try {
        k.unwrapVaultKey(req.currentWrapped, wrapKey); // verifica la contraseña
        const items = req.items.map((it) => ({ id: it.id, blob: k.encryptItem(fresh, it.id, it.payload) }));
        if (pendingKey) k.wipe(pendingKey);
        pendingKey = fresh;
        return { authKey, wrappedVaultKey: k.wrapVaultKey(fresh, wrapKey), items };
      } finally {
        k.wipe(wrapKey);
      }
    }
    case 'commitRotation':
      if (!pendingKey) throw new Error('Sin rotación pendiente');
      setKey(pendingKey);
      pendingKey = null;
      return { ok: true };
    case 'encryptAttachment': {
      const key = k.newAttachmentKey();
      const data = k.encryptAttachment(key, new Uint8Array(req.data));
      return { key: k.toB64(key), data: data.buffer };
    }
    case 'decryptAttachment': {
      const data = k.decryptAttachment(k.fromB64(req.key), new Uint8Array(req.data));
      return { data: data.buffer };
    }
    case 'exportVault':
      return { file: k.encryptExport(req.password, req.payload) };
    case 'importKeyme':
      return { payload: k.decryptExport(req.password, req.file) };
    case 'lock':
      if (vaultKey) k.wipe(vaultKey);
      if (pendingKey) k.wipe(pendingKey);
      vaultKey = pendingKey = null;
      return { ok: true };
  }
}

addEventListener('message', async ({ data }: MessageEvent<{ seq: number; req: WorkerRequest }>) => {
  let res: WorkerResponse;
  try {
    res = { seq: data.seq, ok: true, result: await handle(data.req) };
  } catch (e) {
    const err = e as Error;
    res = { seq: data.seq, ok: false, error: err.name === 'DecryptError' ? 'bad_password' : err.message };
  }
  const transfer: Transferable[] = [];
  const r = res.ok ? (res.result as { data?: unknown }) : null;
  if (r && r.data instanceof ArrayBuffer) transfer.push(r.data);
  postMessage(res, transfer);
});
