# Changelog

Todos los cambios notables en este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

## [1.1.0] - 2026-10-24

Keyme ya se instala con un toque y se mantiene al día solo. El botón
"Instalar app" aparece donde lo necesitas, y cada dispositivo recibe las
versiones nuevas sin que tengas que hacer nada. En el servidor, un solo
comando respalda, baja los últimos parches de seguridad y reinicia.

### Added
- **Botón "Instalar app"**: aparece en la pantalla de desbloqueo, en la barra
  lateral y en Ajustes › App mientras uses Keyme desde el navegador. En
  Chrome, Edge y Android abre el diálogo de instalación; en iPhone y Firefox
  te muestra los pasos. Ya instalada, el botón desaparece.
- **Actualización automática**: la app busca versiones nuevas al abrirla, al
  volver a ella, al recuperar la conexión y cada 15 minutos. Con el vault
  bloqueado se actualiza al momento; con el vault abierto te avisa y se
  actualiza en el siguiente bloqueo, así nunca pierdes lo que estabas
  editando.
- **Ajustes › App**: muestra la versión instalada y tiene un botón para
  buscar actualizaciones en ese momento.
- **`./up.sh --update`**: respalda, baja la última versión del código y las
  imágenes con los parches de seguridad más recientes, reconstruye y
  reinicia el servidor.
- **`./up-version.sh`**: sube la versión de todo el proyecto de una vez y
  pasa lo escrito en [Unreleased] a la nueva versión.

### Changed
- **Parches de PHP sin editar archivos**: la API vuelve a seguir PHP 8.5 y
  recibe cada parche con `./up.sh --update`, pero se niega a construirse con
  una versión menor a 8.5.12, la que corrige PHP2Shell.
- **nginx al día**: pasa de la versión 1.27 a la estable.

## [1.0.1] - 2026-10-24

Keyme queda protegido contra PHP2Shell, la vulnerabilidad crítica de PHP de
octubre, y sus direcciones internas pasan a inglés. Por fuera todo se ve
igual.

### Changed
- **Direcciones de la app en inglés**: Nuevo, Editar, Cartera, Generador,
  Salud y Ajustes ahora viven en `/new`, `/edit`, `/wallet`, `/generator`,
  `/health` y `/settings`. Un marcador o acceso directo con la dirección
  anterior te lleva al inicio.

### Security
- **Protección contra PHP2Shell** (CVE-2026-109618 y CVE-2026-109619): el
  servidor usa PHP 8.5.12, que corrige el fallo, y además apaga las dos
  funciones de PHP por donde entraba el ataque. Keyme no las usaba.

## [1.0.0] - 2026-10-24

Primera versión de Keyme, el gestor de contraseñas que reemplaza a
SafeInCloud. Vive en tu propia PC, solo lo ven tus equipos de Tailscale y
funciona sin conexión. Todo se cifra en tu dispositivo: el servidor guarda
cajas cerradas y nunca ve tu contraseña maestra ni tus datos.

### Added
- **Tu vault con una sola contraseña**: lo creas una vez con el token que te
  da `./up.sh --setup` y una contraseña maestra que nunca sale de tu
  dispositivo. Al terminar descargas el kit de emergencia en PDF para
  escribirla a mano.
- **Funciona sin conexión**: cada dispositivo guarda una copia cifrada. Lo
  que cambies sin red se sube solo cuando el servidor vuelve, y si dos
  dispositivos editan lo mismo gana el cambio más reciente sin perder el
  otro: queda en el historial.
- **Todo tipo de datos**: logins, tarjetas, documentos (INE, CURP, RFC, NSS,
  pasaporte, licencia), identidades, notas seguras y redes Wi-Fi con su
  código QR. Cada uno guarda su historial de contraseñas y sus adjuntos
  cifrados.
- **Espacios**: separa Personal, Escuela y Trabajo, o los que crees, cada uno
  con su color e ícono.
- **Cuentas vinculadas**: anota que Spotify entra con tu cuenta de Google, y
  la ficha de Google te muestra todo lo que depende de ella.
- **Cartera de tarjetas**: tus tarjetas dibujadas, el número oculto hasta que
  lo tocas, copia de cada dato con un toque y acceso a la app del banco.
- **Documentos por vencer**: el inicio te avisa 30 días antes.
- **Generador**: contraseñas al azar o frases en español fáciles de
  recordar, con reglas por sitio.
- **Códigos 2FA**: el código del momento siempre a la vista, lectura de QR
  desde una captura y códigos de recuperación que se marcan al usarse.
- **Salud del vault**: encuentra contraseñas débiles, repetidas, viejas o
  filtradas en internet, y le pone calificación a cada espacio.
- **Importar y exportar**: trae todo desde SafeInCloud, Bitwarden o Chrome, y
  saca una copia `.keyme` cifrada con su propia contraseña.
- **Desbloqueo con Windows Hello**: huella, rostro o PIN; cada 14 días te
  pide la contraseña maestra para que no la olvides.
- **Dispositivos y actividad**: ves qué equipos tienen acceso, cierras la
  sesión de uno a distancia y revisas el registro de actividad.
- **Rápido con el teclado**: `Ctrl K` busca y copia sin abrir nada, `N` crea
  un elemento y `Ctrl L` bloquea.
- **Diseño propio**: modo oscuro y claro, cómodo en computadora y teléfono.
- **Un comando para todo**: `./up.sh` monta el servidor completo; `--setup`
  pregunta lo necesario en un formulario y genera las contraseñas del
  servidor, `--tailscale` lo publica en tu red, y los respaldos son diarios
  y automáticos, con `--backup` y `--restore` a la mano.

### Security
- **Cifrado de extremo a extremo**: Argon2id y XChaCha20-Poly1305 con
  libsodium. El servidor no puede leer nada aunque alguien lo robe.
- **Bloqueo automático**: por inactividad y, si lo activas, al ocultar la
  ventana. El portapapeles se limpia solo.
- **Solo dentro de tu red**: el servidor no escucha fuera de la PC y llega a
  tus otros equipos únicamente por Tailscale, en su propio puerto y con
  HTTPS.
- **Revisión de filtraciones sin exponerte**: a Have I Been Pwned solo viajan
  5 caracteres del hash de cada contraseña.
- **Límite de intentos**: 5 por minuto para adivinar la contraseña.
