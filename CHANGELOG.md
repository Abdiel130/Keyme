# Changelog

Todos los cambios relevantes de Keyme se documentan en este archivo.

El formato sigue [Keep a Changelog 1.1.0](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [Versionado Semántico 2.0.0](https://semver.org/lang/es/).

## [Unreleased]

### Added

- Botón **Instalar app** en la pantalla de desbloqueo, la barra lateral y *Ajustes → App*. Usa el diálogo nativo en Chrome, Edge y Android, y muestra instrucciones en iPhone y Firefox.
- Actualización automática de la app: busca versiones nuevas al abrirse, al volver a primer plano, al recuperar conexión y cada 15 minutos. Se aplica al momento con el vault bloqueado; con el vault abierto se ofrece en un aviso y se aplica en el siguiente bloqueo.
- Sección *Ajustes → App* con la versión instalada y el botón *Buscar* actualizaciones.
- `./up.sh --update`: respalda, descarga el código y las imágenes base más recientes, reconstruye y reinicia.

### Changed

- La API vuelve a la etiqueta `php:8.5-fpm-alpine` para recibir parches con `./up.sh --update`. El build falla si PHP es menor que 8.5.12 (`PHP_MIN_VERSION`).
- nginx pasa de `1.27-alpine` a `stable-alpine`.

## [1.0.1] - 2026-10-24

### Changed

- Rutas de la app en inglés: `/new/:kind`, `/item/:id/edit`, `/wallet`, `/generator`, `/health` y `/settings`. Los marcadores o accesos directos con las rutas anteriores (`/nuevo`, `/tarjetas`, `/ajustes`…) abren el inicio.

### Security

- Imagen de la API fijada en `php:8.5.12-fpm-alpine`, que corrige PHP2Shell (CVE-2026-109618 y CVE-2026-109619).
- `session.upload_progress.enabled` y `fatal_error_backtraces` desactivados en `php.ini` como defensa adicional.

## [1.0.0] - 2026-10-24

Primera versión estable. Reemplaza a SafeInCloud como gestor de contraseñas personal: autohospedado, zero-knowledge, offline-first y accesible solo por Tailscale.

### Added

- API en Laravel 13 (PHP 8.5-FPM) con PostgreSQL 17 y tokens Sanctum por dispositivo que expiran a los 30 días.
- Vault de un solo usuario creado con un token de instalación de un solo uso.
- Sincronización por revisiones con `base_revision`: un conflicto responde `409` con la versión del servidor.
- Borrado lógico con purga automática a los 30 días y resincronización completa cuando un dispositivo queda atrás del horizonte de purga.
- Lista de dispositivos con revocación remota y registro de actividad.
- Paquete `@keyme/crypto`: Argon2id, XChaCha20-Poly1305, `crypto_secretstream` para adjuntos y formato de blob v1 fijado con vectores de prueba.
- Paquete `@keyme/models`: tipos de elemento, validaciones, coincidencia de URL, búsqueda difusa y UUIDv7.
- PWA en Angular 22 instalable en PC y teléfono.
- Funcionamiento offline-first con copia local cifrada en IndexedDB y cola de cambios que sube cuando el servidor está disponible.
- Resolución de conflictos entre dispositivos: gana la edición más reciente y la otra pasa al historial.
- Tipos de elemento: logins, tarjetas, documentos (INE, CURP, RFC, NSS, pasaporte, licencia), identidades, notas seguras y Wi-Fi con código QR.
- Espacios con color e ícono (Personal, Escuela y Trabajo de inicio).
- Cuentas vinculadas ("inicia sesión con Google") con lista de servicios dependientes.
- Cartera de tarjetas con número oculto, copia por campo, marca de CVV dinámico y acceso a la app del banco.
- Aviso de documentos por vencer.
- Generador de contraseñas aleatorias y de frases en español (4096 palabras), con reglas por sitio.
- Códigos 2FA (TOTP) en vivo, lectura de QR y códigos de recuperación.
- Salud del vault: contraseñas débiles, repetidas y antiguas.
- Historial de contraseñas por elemento.
- Adjuntos cifrados (fotos y PDF).
- Importación desde SafeInCloud (XML), Bitwarden (JSON) y Chrome/Edge (CSV), procesada en el navegador.
- Exportación cifrada `.keyme` con contraseña propia.
- Kit de emergencia en PDF generado en el cliente.
- Paleta de comandos `Ctrl K` y atajos de teclado (`N`, `/`, `Ctrl L`).
- Diseño "Bóveda cálida" con modo oscuro y claro, adaptado a escritorio y móvil.
- Stack en Docker Compose: PostgreSQL, API, scheduler, nginx y respaldos.
- `up.sh` para montar todo con un comando, con formulario `--setup` y opciones `--build`, `--tailscale`, `--status`, `--backup`, `--restore`, `--test`, `--new-setup-token`, `--logs` y `--down`.
- Publicación en el tailnet con `tailscale serve` en un puerto HTTPS propio (`KEYME_TS_PORT`, `8443` por defecto).
- Respaldos diarios automáticos (pg_dump + adjuntos) con retención configurable.
- Pruebas: 12 de criptografía, 7 de modelos y 16 de API (`./up.sh --test`).
- Documentación: `README.md` con guía de primer uso, `docs/security.md`, `docs/format.md` y `SECURITY.md`.

### Security

- Cifrado de extremo a extremo: el servidor nunca recibe la contraseña maestra ni datos en claro.
- Derivación de llaves con Argon2id (64 MiB, 3 iteraciones) y `crypto_kdf_derive_from_key`; Vault Key de 32 bytes envuelta con XChaCha20-Poly1305.
- Criptografía aislada en un Web Worker; al bloquear, las llaves se borran y el worker termina.
- Desbloqueo con Windows Hello mediante WebAuthn PRF, con contraseña maestra obligatoria cada 14 días.
- Cambio de contraseña maestra y rotación de la Vault Key con re-cifrado completo; los demás dispositivos lo detectan y se bloquean.
- Bloqueo por inactividad, bloqueo opcional al ocultar la pestaña y limpieza del portapapeles.
- Revisión de filtraciones en Have I Been Pwned con k-anonymity (solo se envían 5 caracteres del hash SHA-1).
- Límite de intentos de autenticación: 5/min por IP y 15/min en total.
- nginx solo en `127.0.0.1`, con CSP estricta, HSTS y sin logs de acceso; acceso remoto solo dentro del tailnet, nunca por Funnel.
- Keyme en su propio origen (host + puerto) para aislar su almacenamiento, service worker y credenciales WebAuthn de otros proyectos.
- `.env` con permisos `600` y secretos generados automáticamente.

[Unreleased]: https://github.com/Abdiel130/Keyme/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/Abdiel130/Keyme/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Abdiel130/Keyme/releases/tag/v1.0.0
