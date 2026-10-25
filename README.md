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

Después sigue [Primer uso](#primer-uso).

## Primer uso

Usa siempre la **URL del tailnet** (`https://<tu-pc>.<tailnet>.ts.net:8443`), también en la PC del servidor. El navegador guarda la copia local del vault y la llave de Windows Hello por origen (host + puerto): `localhost:8470` y la URL del tailnet cuentan como dos dispositivos distintos. `./up.sh --status` muestra la URL y el token.

### 1. Crear el vault (una sola vez)

1. Abre la URL. Como el vault aún no existe, aparece la pantalla **Bienvenido a tu bóveda** → *Comenzar*.
2. **Token de instalación:** pega el token que imprimió `./up.sh --setup` (formato `km-setup-…`). Pon un nombre al dispositivo, por ejemplo "PC gamer".
3. **Contraseña maestra:** escríbela dos veces. Debe llegar al nivel "Buena" o mejor. *Sugerir una frase* genera 5 palabras en español al azar, más fáciles de recordar que una contraseña corta. Marca la casilla "Entiendo que si la olvido…" → *Crear mi vault*.
   - Tarda unos segundos a propósito: Argon2id hace lento cada intento de adivinarla.
   - Nadie puede recuperarla, ni el servidor ni los respaldos. Si la olvidas, el vault es irrecuperable.
4. **Kit de emergencia:** *Descargar kit de emergencia* baja `Keyme-kit-de-emergencia.pdf`. Imprímelo, escribe la contraseña maestra **a mano** en el recuadro y guárdalo en un lugar físico seguro. El PDF no contiene datos del vault: solo la URL del servidor e instrucciones de recuperación. No lo guardes con la contraseña escrita en la computadora ni en la nube.
5. *Entrar a mi vault*. Keyme crea los espacios Personal, Escuela y Trabajo.

Si eliges "Lo haré después", el kit sigue disponible en *Ajustes → Seguridad*.

### 2. Instalar la app

- **PC (Chrome o Edge):** ícono de instalar en la barra de direcciones, o menú → *Instalar Keyme*.
- **Teléfono:** activa Tailscale, abre la misma URL en Chrome, inicia sesión con la contraseña maestra y elige menú → *Agregar a pantalla principal* (o *Instalar app*).

Cada dispositivo nuevo pide solo la contraseña maestra. El token de instalación ya no sirve después del primer uso.

### 3. Configurar

- **Windows Hello:** *Ajustes → Seguridad → Windows Hello*. Desbloquea con huella, rostro o PIN. Cada 14 días Keyme vuelve a pedir la contraseña maestra para que no la olvides.
- **Importar desde SafeInCloud:** en SafeInCloud exporta a XML, luego en Keyme *Ajustes → Importar y exportar → SafeInCloud*. Al terminar, **borra el XML**: está sin cifrar.
- **Bloqueo automático:** *Ajustes → Seguridad* (5 minutos por defecto).

### Si algo sale mal

| Problema | Qué hacer |
|---|---|
| "El token de instalación no coincide" | Cópialo de nuevo con `./up.sh --status`. |
| Perdiste el token antes de crear el vault | `./up.sh --new-setup-token`. |
| Olvidaste la contraseña maestra | Sin solución: por eso existe el kit de emergencia. |
| El teléfono no abre la URL | Revisa que Tailscale esté activo en el teléfono y que la PC esté encendida. La app instalada funciona sin conexión con la última copia. |

## Comandos

| Comando | Qué hace |
|---|---|
| `./up.sh` | Levanta el stack. Si falta `.env`, lo crea con secretos aleatorios. |
| `./up.sh --setup` | Asistente completo (formulario, build, Tailscale, token). |
| `./up.sh --build` | Reconstruye las imágenes y levanta. |
| `./up.sh --tailscale` | Publica Keyme en el tailnet con HTTPS. Solo lo ven tus equipos. |
| `./up.sh --update` | Respalda, baja la última versión del código y las imágenes base con parches, reconstruye y reinicia. |
| `./up.sh --status` | Muestra contenedores, estado del vault, URL del tailnet y último respaldo. |
| `./up.sh --backup` | Hace un respaldo ahora. |
| `./up.sh --restore backups/keyme-AAAAMMDD-HHMMSS.tar` | Restaura un respaldo. Antes respalda el estado actual. |
| `./up.sh --test` | Corre las pruebas: vectores de crypto, modelos y API. |
| `./up.sh --new-setup-token` | Genera otro token si el vault aún no existe. |
| `./up.sh --down` | Detiene el stack. Los datos quedan en los volúmenes. |

## Acceso y red

- Nginx escucha **solo en `127.0.0.1`**. Nada entra desde la red local ni desde internet.
- Desde otros dispositivos se entra por **Tailscale Serve**: HTTPS con certificado válido, visible solo dentro de tu tailnet. Keyme nunca usa Funnel.
- Keyme se publica en su propio puerto HTTPS (`KEYME_TS_PORT`, por defecto `8443`) y deja `443` libre para otros proyectos. No se usa una ruta tipo `/keyme` porque el navegador aísla por origen (host + puerto), no por ruta: compartir host expondría la copia local del vault, el service worker y las credenciales de Windows Hello a cualquier otro proyecto en ese host.
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

## Actualizaciones

Hay dos partes: el servidor y las apps instaladas.

**Servidor.** `./up.sh --update` hace todo:

1. `git pull --ff-only` de la rama actual. Si hay cambios locales sin commit, se salta este paso.
2. Respaldo de la base y los adjuntos.
3. Descarga las imágenes base más recientes (PHP 8.5, nginx estable, PostgreSQL 17, Node 24) con sus parches de seguridad, y reconstruye.
4. Reinicia y espera a que la API responda.

El Dockerfile de la API usa la etiqueta `php:8.5` para recibir cada parche, pero exige un mínimo (`PHP_MIN_VERSION`, hoy 8.5.12 por PHP2Shell): si la imagen es más vieja, el build falla.

**Apps instaladas (PC y teléfono).** Se actualizan solas. Al abrirse, al volver a primer plano, al recuperar conexión y cada 15 minutos preguntan al servidor si hay versión nueva y la descargan en segundo plano.

- Con el vault bloqueado, la versión nueva se aplica al momento.
- Con el vault abierto aparece un aviso *Actualizar ahora*. Si no lo usas, se aplica en el siguiente bloqueo, manual o por inactividad.
- *Ajustes → App* muestra la versión y tiene el botón *Buscar*.

No hace falta reinstalar ni tocar nada en cada dispositivo.

## Instalar la app

El botón **Instalar app** aparece en la pantalla de desbloqueo, en la barra lateral y en *Ajustes → App* mientras Keyme se use desde el navegador. En Chrome, Edge y Android abre el diálogo de instalación. En iPhone y Firefox muestra los pasos para instalarla a mano. Ya instalada, el botón desaparece.

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
