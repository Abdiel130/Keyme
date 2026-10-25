# Formato de blob v1

Todo lo binario viaja como **base64url sin relleno**.

## Blob AEAD (elementos y llaves envueltas)

```
byte 0        versión de formato (0x01)
bytes 1..24   nonce XChaCha20 (24 B, aleatorio por escritura)
bytes 25..    ciphertext + tag Poly1305 (16 B)
```

El AAD es la cadena UTF-8 `keyme:v<versión>:<contexto>`:

| Contexto | Uso | Llave |
|---|---|---|
| `item:<uuid>` | Elemento del vault (JSON) | Vault Key |
| `vaultkey` | Vault Key envuelta | Wrap Key |
| `prf` | Vault Key envuelta para Windows Hello | KDF(PRF) |
| `export` | Contenido de un archivo `.keyme` | Wrap Key derivada de la contraseña de exportación |

## Adjuntos

```
byte 0        versión (0x01)
bytes 1..24   cabecera de crypto_secretstream
bloques       (64 KiB de texto + 17 B) cada uno; el último lleva TAG_FINAL
```

Si falta el bloque final o hay bytes sobrantes, el adjunto se rechaza como truncado o alterado.

## Archivo `.keyme`

```json
{
  "format": "keyme-export",
  "version": 1,
  "created_at": "2026-10-24T22:00:00.000Z",
  "kdf": { "alg": "argon2id13", "ops": 3, "mem": 67108864, "salt": "<16 B>" },
  "data": "<blob AEAD con contexto 'export'>"
}
```

## Vectores de prueba

`packages/crypto/test/vectors.json` fija la contraseña, el salt, el nonce y los resultados esperados. Si ese archivo cambia, se rompió la compatibilidad con los vaults existentes. No lo regeneres sin subir la versión del formato.
