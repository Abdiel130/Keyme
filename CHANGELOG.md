# Changelog

Todos los cambios notables en este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

## [1.2.0] - 2026-11-05

Keyme estrena cara. Cada cuenta lleva el logo real de su servicio, lo que
más usas se copia con un toque desde la lista y la app se mueve como una app
nativa en el teléfono: las pantallas se deslizan, las tarjetas se voltean y
todo responde al tacto. Además entiende que una persona tiene varias cuentas
del mismo servicio y que a veces guardas las de alguien más: tus cuentas de
Google, la de la escuela y la de tu abuelita aparecen juntas en un solo
grupo, y las tarjetas guardan junto a ellas el acceso a la app del banco.

### Added
- **Logos de tus servicios**: Google, Netflix, Spotify, GitHub, Nu y unos 200
  más se reconocen por el sitio o el nombre y muestran su logo y su color.
  Vienen dentro de la app: nadie se entera de qué sitios tienes guardados.
- **Copia rápida en la lista**: cada fila tiene un botón para copiar la
  contraseña (o el número de la tarjeta) sin abrir la ficha. En el teléfono
  deslizas la fila a la derecha para copiar la contraseña y a la izquierda
  para el usuario. Arriba de la lista están tus favoritos a un toque.
- **Ficha nueva**: el logo grande con el color de la marca y botones de un
  toque para lo que más se hace con cada elemento: copiar la contraseña, el
  usuario o el código 2FA, o abrir el sitio. Los datos secretos van ocultos
  y se copian con solo tocarlos.
- **Tarjeta de verdad**: la tarjeta bancaria se dibuja con el logo y el color
  de su banco, se voltea para ver el CVV y el NIP, y copias el número, el
  vencimiento o el CVV tocándolos. Los documentos se ven como una
  identificación y las notas como una hoja.
- **Crear una cuenta en dos toques**: al agregar un login eliges el servicio
  de una cuadrícula de logos y Keyme llena el nombre, el sitio y el logo. Al
  agregar una tarjeta eliges el banco y toma su color. Mientras escribes ves
  cómo va a quedar.
- **Cartera apilada**: tus tarjetas se apilan como en la cartera del
  teléfono; tocas una y sube con sus botones para copiar.
- **Agrupar por servicio**: en "Todo" las cuentas del mismo sitio o banco se
  juntan en un grupo que se abre con un toque, por ejemplo "Google · 3
  cuentas". Gmail y YouTube cuentan como Google, y Outlook y Hotmail como
  Microsoft. Se apaga desde el menú de orden, y Keyme recuerda tu elección.
- **Personas**: en Ajustes › Personas das de alta a quien le guardas cuentas,
  como tu abuelita. Sus cuentas muestran "de Abuelita" en la lista, en la
  búsqueda y en Salud, y un filtro las separa de las tuyas. Si quitas a
  alguien, sus cuentas no se borran: pasan a ser tuyas.
- **Banca en línea en la tarjeta**: la tarjeta tiene ahora las pestañas
  "Tarjeta" y "Banca en línea". En la segunda capturas el usuario y la
  contraseña de la app del banco, o eliges un login que ya tengas. En la
  lista ves el banco con sus dos elementos, y en la Cartera copias el
  usuario y la contraseña sin abrir la ficha.
- **Otras cuentas del servicio**: la ficha de cada cuenta lista las demás
  del mismo servicio. Con "Agregar otra cuenta" creas una nueva que ya trae
  los sitios, las apps, el espacio y la persona; solo te falta escribir las
  credenciales.

### Changed
- **Navegación más simple**: en la computadora la barra lateral es ahora una
  columna de íconos y los espacios, tipos, etiquetas y personas se eligen con
  chips arriba de la lista. En el teléfono hay una barra inferior con
  Bóveda, Cartera, Nuevo, Salud y Ajustes.
- **Letras más grandes y botones más cómodos** de tocar en toda la app, con
  animaciones al abrir, copiar y cambiar de pantalla. Si tu sistema pide
  reducir el movimiento, se desactivan.
- **Lo avanzado al final**: en el editor los sitios extra, las apps de
  Android, los campos personalizados, las etiquetas y los adjuntos quedan en
  "Más opciones", y mover, duplicar o borrar un elemento está en el menú
  "⋯" de la ficha.

## [1.1.1] - 2026-11-04

El desbloqueo rápido ya funciona en Android. Con Keyme instalada en el
teléfono, abres el vault con tu huella igual que en Windows con Windows
Hello. Además la app se siente más nativa al tocarla: sin destellos azules y
con una respuesta sutil al presionar.

### Added
- **`./up-version.sh --rollback`**: si te equivocaste de versión, deshace la
  última subida en todos los archivos y devuelve sus notas a [Unreleased]
  para volver a subir con la correcta. No toca versiones ya publicadas con
  su tag.

### Fixed
- **Huella en Android**: activar el desbloqueo rápido en el teléfono ya no
  falla con "no soporta PRF". Si Android pregunta dónde guardar la llave de
  acceso, elige Google Password Manager; Samsung Pass y otros proveedores no
  sirven para esto, y Keyme te lo dice si eliges uno de ellos.
- **Sin llaves huérfanas**: si el proveedor elegido no sirve, Keyme le pide
  borrar la llave que acaba de crear para que no se quede en tu lista.

### Changed
- **Nombre según el dispositivo**: el desbloqueo rápido se llama "Huella
  digital" en la app instalada en Android, "Windows Hello" en Windows y
  "Passkey" en los demás, en Ajustes, en la pantalla de desbloqueo y en los
  avisos.
- **Toques más naturales en el teléfono**: desaparece el resaltado azul al
  tocar, los efectos de hover solo aparecen con mouse y botones, filas y
  tarjetas responden con un ligero efecto al presionarlos.

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
