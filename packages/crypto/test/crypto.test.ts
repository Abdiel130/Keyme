import { beforeAll, describe, expect, it } from 'vitest';
import * as k from '../src/index';
import vectors from './vectors.json';

beforeAll(() => k.ready());

describe('vectores fijos (control de formato v1)', () => {
  it('deriva las mismas llaves', () => {
    const d = k.deriveKeys(vectors.password, vectors.salt, vectors.params as k.KdfParams);
    expect(k.toB64(d.wrapKey)).toBe(vectors.wrap_key);
    expect(d.authKey).toBe(vectors.auth_key);
  });

  it('desenvuelve la Vault Key conocida', () => {
    const vk = k.unwrapVaultKey(vectors.wrapped_vault_key, k.fromB64(vectors.wrap_key));
    expect(k.toB64(vk)).toBe(vectors.vault_key);
  });

  it('descifra el elemento conocido', () => {
    const item = k.decryptItem(k.fromB64(vectors.vault_key), vectors.item_id, vectors.item_blob);
    expect(item).toEqual(vectors.item);
  });
});

describe('propiedades', () => {
  it('crear vault y desbloquear con la misma contraseña', () => {
    const fast = { alg: 'argon2id13', ops: 2, mem: 32 * 1024 * 1024 } as const;
    const v = k.createVault('una frase muy larga', fast);
    const { wrapKey, authKey } = k.deriveKeys('una frase muy larga', v.salt, fast);
    expect(authKey).toBe(v.authKey);
    expect(k.unwrapVaultKey(v.wrappedVaultKey, wrapKey)).toEqual(v.vaultKey);
    const bad = k.deriveKeys('otra', v.salt, fast);
    expect(() => k.unwrapVaultKey(v.wrappedVaultKey, bad.wrapKey)).toThrow(k.DecryptError);
  });

  it('AAD ata el blob a su id', () => {
    const key = k.newVaultKey();
    const blob = k.encryptItem(key, 'a', { x: 1 });
    expect(k.decryptItem(key, 'a', blob)).toEqual({ x: 1 });
    expect(() => k.decryptItem(key, 'b', blob)).toThrow(k.DecryptError);
  });

  it('nonce distinto en cada cifrado', () => {
    const key = k.newVaultKey();
    expect(k.encryptItem(key, 'a', { x: 1 })).not.toBe(k.encryptItem(key, 'a', { x: 1 }));
  });

  it('detecta alteraciones', () => {
    const key = k.newVaultKey();
    const raw = k.fromB64(k.encryptItem(key, 'a', { x: 1 }));
    raw[raw.length - 1] ^= 1;
    expect(() => k.decryptItem(key, 'a', k.toB64(raw))).toThrow(k.DecryptError);
  });

  it('adjuntos de varios bloques', () => {
    const key = k.newAttachmentKey();
    for (const size of [0, 10, k.ATTACHMENT_CHUNK, k.ATTACHMENT_CHUNK * 2 + 7]) {
      const data = k.randomBytes(size);
      const enc = k.encryptAttachment(key, data);
      expect(k.decryptAttachment(key, enc)).toEqual(data);
    }
    const enc = k.encryptAttachment(key, k.randomBytes(k.ATTACHMENT_CHUNK * 2));
    expect(() => k.decryptAttachment(key, enc.subarray(0, enc.length - 100))).toThrow();
  });

  it('rekey conserva la Vault Key', () => {
    const fast = { alg: 'argon2id13', ops: 2, mem: 32 * 1024 * 1024 } as const;
    const v = k.createVault('vieja', fast);
    const r = k.rekey(v.vaultKey, 'nueva', fast);
    const { wrapKey } = k.deriveKeys('nueva', r.salt, fast);
    expect(k.unwrapVaultKey(r.wrappedVaultKey, wrapKey)).toEqual(v.vaultKey);
  });

  it('PRF envuelve y desenvuelve', () => {
    const vk = k.newVaultKey();
    const prf = k.randomBytes(32);
    expect(k.unwrapWithPrf(k.wrapWithPrf(vk, prf), prf)).toEqual(vk);
    expect(() => k.unwrapWithPrf(k.wrapWithPrf(vk, prf), k.randomBytes(32))).toThrow();
  });

  it('exportación .keyme', () => {
    const fast = { alg: 'argon2id13', ops: 2, mem: 32 * 1024 * 1024 } as const;
    const file = k.encryptExport('exp', { items: [1, 2] }, fast);
    expect(k.decryptExport('exp', JSON.parse(JSON.stringify(file)))).toEqual({ items: [1, 2] });
    expect(() => k.decryptExport('mal', file)).toThrow();
  });

  it('sha1 para HIBP', async () => {
    expect(await k.sha1Hex('password')).toBe('5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8');
  });
});
