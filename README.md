# Keyme

Gestor de contraseñas personal, autohospedado y zero-knowledge. Cifrado de extremo a extremo con libsodium, offline-first, multicuentas por espacios y acceso rápido a tarjetas.

El servidor nunca ve tu contraseña maestra ni tus datos: todo se cifra y descifra en tu dispositivo. El servidor solo guarda bloques cifrados y los sincroniza.

## Arranque rápido

Requisitos: Docker con Compose v2. Tailscale es opcional (para usarlo desde el teléfono u otras PCs).

```bash
./up.sh --setup
```

El asistente:

1. Revisa Docker y Tailscale.
2. Pide la configuración del servidor: puerto local, contraseña de PostgreSQL (o la genera), carpeta, retención y hora de los respaldos, y el tamaño máximo de los adjuntos. Guarda todo en `.env` con permisos `600`.
3. Construye y levanta el stack, y espera a que la API responda.
4. Ofrece publicar Keyme en tu tailnet con HTTPS (`tailscale serve`).
5. Imprime el **token de instalación**: lo pegas en la PWA al crear el vault.

La contraseña maestra **no** se pide aquí. La eliges en la PWA y nunca sale de tu dispositivo.

Luego abre `http://localhost:8470` (o la URL `https://<tu-pc>.<tailnet>.ts.net`) e instala la app: menú del navegador → *Instalar Keyme*.

## Comandos

| Comando | Qué hace |
|---|---|
| `./up.sh` | Levanta el stack. Si falta `.env`, lo crea con secretos aleatorios. |
| `./up.sh --setup` | Asistente completo (formulario, build, Tailscale, token). |
| `./up.sh --build` | Reconstruye las imágenes y levanta. |
| `./up.sh --tailscale` | Publica Keyme en el tailnet con HTTPS. Solo lo ven tus equipos. |
| `./up.sh --status` | Muestra contenedores, estado del vault, URL del tailnet y último respaldo. |
| `./up.sh --backup` | Hace un respaldo ahora. |
| `./up.sh --restore backups/keyme-AAAAMMDD-HHMMSS.tar` | Restaura un respaldo. Antes respalda el estado actual. |
| `./up.sh --test` | Corre las pruebas: vectores de crypto, modelos y API. |
| `./up.sh --new-setup-token` | Genera otro token si el vault aún no existe. |
| `./up.sh --down` | Detiene el stack. Los datos quedan en los volúmenes. |

## Acceso y red

- Nginx escucha **solo en `127.0.0.1`**. Nada entra desde la red local ni desde internet.
- Desde otros dispositivos se entra por **Tailscale Serve**: HTTPS con certificado válido, visible solo dentro de tu tailnet. Keyme nunca usa Funnel.
- En WSL, `up.sh` usa el `tailscale.exe` de Windows, porque Docker Desktop publica los puertos en el localhost de Windows.
- Para el HTTPS del tailnet, activa *MagicDNS* y *HTTPS Certificates* en <https://login.tailscale.com/admin/dns>.
- Si el servidor está apagado, cada dispositivo sigue funcionando con su copia local cifrada. Los cambios suben cuando el servidor vuelve.

## Funcionalidades

- **Tipos de elemento:** logins, tarjetas, documentos (INE, CURP, RFC, NSS, pasaporte, licencia), identidades, notas seguras y redes Wi‑Fi con código QR.
- **Espacios:** Personal, Escuela, Trabajo o los que crees. Cada uno tiene color e ícono, y cada cuenta se ve etiquetada con su espacio.
- **Cuentas vinculadas:** registra "Spotify → inicia sesión con Google (Personal)". La ficha de la cuenta de Google lista todos los servicios que dependen de ella.
- **Cartera:** tarjetas dibujadas, copia de número y vencimiento con un toque, marca de CVV dinámico y botón para abrir la app del banco (en Android).
- **Generador:** contraseñas aleatorias o frases en español, con reglas por sitio (por ejemplo, "sin símbolos" o "máximo 16").
- **Salud del vault:** contraseñas débiles (zxcvbn), repetidas y antiguas, revisión de filtraciones en Have I Been Pwned con k-anonymity y una puntuación por espacio.
- **2FA:** códigos TOTP en vivo, lectura de QR desde una captura y códigos de recuperación con marca de usados.
- **Historial:** guarda las contraseñas anteriores y la versión perdedora de cada conflicto de sincronización, para que nunca se pierda una contraseña.
- **Adjuntos cifrados:** fotos de INE, PDFs y otros archivos.
- **Importar:** SafeInCloud (XML), Bitwarden (JSON sin cifrar) y Chrome/Edge (CSV). El archivo se procesa en el navegador.
- **Exportar:** archivo `.keyme` cifrado con una contraseña propia.
- **Kit de emergencia:** PDF para imprimir y escribir a mano la contraseña maestra.
- **Seguridad de sesión:** bloqueo por inactividad, bloqueo al ocultar la pestaña (opcional), limpieza del portapapeles, desbloqueo con Windows Hello (WebAuthn PRF), lista de dispositivos con revocación remota y registro de actividad.
- **Productividad:** `Ctrl K` busca y copia sin abrir la ficha, `N` crea un elemento, `/` filtra y `Ctrl L` bloquea.

## Arquitectura

```
apps/api/          Laravel 13 + PHP-FPM 8.5 + PostgreSQL 17 (solo blobs cifrados)
apps/web/          Angular 22 PWA (zoneless, signals), Dexie/IndexedDB, Web Worker de cifrado
packages/crypto/   Núcleo TypeScript sobre libsodium (KDF, AEAD, secretstream, formato v1)
packages/models/   Tipos de elemento, espacios, coincidencia de dominios
infra/nginx/       PWA + proxy /api con CSP estricta
infra/backup/      pg_dump diario + adjuntos
```

Servicios de Docker: `db`, `api`, `scheduler` (purga de borrados a 30 días), `web` y `backup`.

## Respaldos (regla 3-2-1)

1. **Automático diario.** El servicio `backup` guarda `keyme-*.tar` (base de datos y adjuntos, ya cifrados) en `BACKUP_DIR` y conserva los últimos `BACKUP_RETENTION_DAYS` días.
2. **Copia semanal fuera del equipo.** Copia la carpeta de respaldos a una USB o a la nube.
3. **Exportación `.keyme` manual.** Desde *Ajustes → Importar y exportar*.
4. **Prueba de restauración cada 3 meses.** Usa `./up.sh --restore`.

## Desarrollo

```bash
npm install                      # workspaces: crypto, models, web
npm test -w @keyme/crypto        # vectores fijos del formato
npm test -w @keyme/models
cd apps/web && npx ng serve      # http://localhost:4470, proxy /api → :8470
./up.sh --test                   # todo dentro de Docker, incluida la API
```

## Hoja de ruta

- **Fase 1:** base segura y PWA. Hecho.
- **Fase 2:** app Android con Capacitor y módulos Kotlin (servicio de autocompletado, biometría con Keystore, tile, widget, `FLAG_SECURE`). Mientras tanto, la PWA instalada en Android cubre consulta, copia y el botón a la app del banco.
- **Fase 3:** extensión de navegador (Manifest V3) para autocompletar en PC, passkeys y acceso de emergencia.

## Seguridad

Ver [SECURITY.md](SECURITY.md), [docs/security.md](docs/security.md) y [docs/format.md](docs/format.md).
