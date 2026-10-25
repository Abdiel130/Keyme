# Diseño de seguridad

## Principio

Keyme es zero-knowledge. La contraseña maestra y los datos en claro nunca salen del dispositivo. El servidor guarda blobs cifrados y los metadatos mínimos para sincronizar: id, revisión, fechas y tamaño.

No hay criptografía propia: todo usa libsodium (`libsodium-wrappers-sumo`). Las mismas primitivas existen en Lazysodium para la futura app de Android.

## Jerarquía de llaves

```
contraseña maestra + salt (16 B)
        │ Argon2id (64 MiB, 3 iteraciones; parámetros guardados por vault)
        ▼
   Master Key (32 B)  ── crypto_kdf_derive_from_key ──┬─ id 1, "kmwrap01" → Wrap Key
                                                       └─ id 2, "kmauth01" → Auth Key
Vault Key (32 B, aleatoria) ── XChaCha20-Poly1305 con Wrap Key ──► wrapped_vault_key
```

- La **Auth Key** prueba ante el servidor que conoces la contraseña. El servidor la vuelve a hashear con Argon2id (`password_hash`) antes de guardarla.
- La **Vault Key** cifra cada elemento. Cambiar la contraseña maestra solo vuelve a envolver estos 32 bytes.
- Al servidor llegan solo: salt, parámetros de Argon2id, `wrapped_vault_key` y la Auth Key (que se guarda hasheada).

## Elementos

- Cada elemento se serializa a JSON completo y se cifra con XChaCha20-Poly1305 IETF y un nonce aleatorio de 24 B por escritura.
- El AAD es `keyme:v1:item:<id>`, así un blob no puede moverse a otro registro.
- Los espacios y los ajustes también son elementos cifrados. El servidor no distingue un login de un espacio.

## Adjuntos

Cada adjunto tiene su propia llave aleatoria. Se cifra con `crypto_secretstream_xchacha20poly1305` en bloques de 64 KiB. La llave del adjunto vive dentro del JSON cifrado del elemento.

## Sesión

- La Vault Key vive solo dentro de un Web Worker. Al bloquear se borra con `memzero` y el worker se termina.
- **Windows Hello:** la extensión PRF de WebAuthn devuelve un secreto estable de 32 B, que solo sale tras la verificación biométrica o con PIN. Ese secreto, pasado por KDF (`"kmprf001"`), envuelve la Vault Key en IndexedDB. El servidor no participa. Cada 14 días se exige la contraseña maestra.
- Los tokens de Sanctum pertenecen a un dispositivo y duran 30 días. Revocar un dispositivo borra sus tokens y, la próxima vez que ese dispositivo se conecta, borra su copia local.
- El inicio de sesión tiene un límite de 5 intentos por minuto por IP y de 15 por minuto en total.

## Modelo de amenazas

| Amenaza | Mitigación |
|---|---|
| Robo del servidor, del disco o de un respaldo | Todo está cifrado con llaves que nunca salen del cliente. |
| Fuerza bruta sobre la contraseña maestra | Argon2id con 64 MiB y límite de intentos. |
| Intercepción de red | HTTPS de Tailscale y red privada. Aun interceptado, el contenido va cifrado. |
| Manipulación de datos en el servidor | AEAD: cualquier alteración hace fallar el descifrado. El AAD liga cada blob a su id. |
| Otro equipo del tailnet crea el vault antes que tú | Hace falta el token de instalación de un solo uso. |
| Malware leyendo el portapapeles | El portapapeles se limpia solo. La copia rápida evita exponer los datos en pantalla. |
| Phishing con dominios parecidos | La coincidencia de sitios es solo por dominio exacto o host exacto, nunca por parecido. |
| Pérdida total del servidor | Copias locales en cada dispositivo, respaldos diarios y exportación `.keyme`. |

**Riesgo aceptado:** si olvidas la contraseña maestra, no hay forma de recuperar el vault. Por eso existe el kit de emergencia.

## Cabeceras

Nginx envía una CSP estricta: `script-src 'self' 'wasm-unsafe-eval'`, sin scripts inline, `frame-ancestors 'none'` y `connect-src` limitado a la propia API y a `api.pwnedpasswords.com`. También envía HSTS, `nosniff`, `Referrer-Policy: no-referrer` y una `Permissions-Policy` restrictiva. Nginx y PHP no guardan access logs.
