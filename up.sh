#!/usr/bin/env bash
# =============================================================================
# up.sh — Monta Keyme completo con un solo comando
#
# Uso:
#   ./up.sh                    Levanta el stack (crea .env con secretos si falta)
#   ./up.sh --setup            Asistente: formulario de configuración, build,
#                              arranque, Tailscale y token para crear el vault
#   ./up.sh --build            Reconstruye las imágenes antes de levantar
#   ./up.sh --no-cache         Reconstruye sin caché de Docker (implica --build)
#   ./up.sh --tailscale        Publica Keyme en tu tailnet con HTTPS (tailscale serve)
#   ./up.sh --test             Corre las pruebas (crypto, modelos y API)
#   ./up.sh --backup           Hace un respaldo ahora mismo
#   ./up.sh --restore <tar>    Restaura un respaldo (borra el estado actual)
#   ./up.sh --new-setup-token  Genera otro token de instalación
#   ./up.sh --status           Estado de contenedores, vault y Tailscale
#   ./up.sh --logs             Sigue los logs al terminar
#   ./up.sh --down             Detiene el stack (los datos se conservan)
#
# Qué hay detrás:
#   db         PostgreSQL 17 (volumen keyme_pgdata)
#   api        Laravel 13 + PHP-FPM: solo guarda blobs cifrados
#   scheduler  Tareas programadas (purga de borrados a los 30 días)
#   web        Nginx: PWA + proxy /api, escucha SOLO en 127.0.0.1
#   backup     pg_dump diario + adjuntos → BACKUP_DIR
#
# La contraseña maestra NO se configura aquí: se crea en la PWA y nunca sale
# de tu dispositivo. Aquí solo van secretos del servidor (base de datos,
# APP_KEY) y el token de un solo uso para crear el vault.
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE="$ROOT_DIR/.env.example"
DB_VOLUME="keyme_pgdata"
DATA_VOLUME="keyme_data"
WAIT_TIMEOUT=300
UNSAFE_SECRET_CHARS='[[:space:]$#"\\`'"']"

BUILD=false
NO_CACHE=false
SETUP=false
WAIT=false
FOLLOW_LOGS=false
ACTION=up
RESTORE_FILE=""

# -----------------------------------------------------------------------------
# Salida
# -----------------------------------------------------------------------------
if [[ -t 1 ]]; then
  BOLD=$'\e[1m'; DIM=$'\e[2m'; RED=$'\e[31m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; BLUE=$'\e[34m'; AMBER=$'\e[38;5;179m'; RESET=$'\e[0m'
else
  BOLD=''; DIM=''; RED=''; GREEN=''; YELLOW=''; BLUE=''; AMBER=''; RESET=''
fi

info()  { echo "${BLUE}[keyme]${RESET} $*"; }
ok()    { echo "${GREEN}[keyme]${RESET} $*"; }
warn()  { echo "${YELLOW}[keyme]${RESET} $*" >&2; }
fail()  { echo "${RED}[keyme]${RESET} $*" >&2; exit 1; }
step()  { echo; echo "${BOLD}== $* ==${RESET}"; }

usage() {
  sed -n '3,/^# =\{10,\}$/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
}

banner() {
  echo "${AMBER}"
  echo "   ╭─────────╮   Keyme"
  echo "   │  ╭───╮  │   Gestor de contraseñas autohospedado"
  echo "   │  │ ● │  │   zero-knowledge · offline-first"
  echo "   ╰──┴───┴──╯${RESET}"
}

# -----------------------------------------------------------------------------
# Formularios
# -----------------------------------------------------------------------------

ask() {
  local __var="$1" label="$2" default="${3:-}" answer
  read -r -p "  ${label}${default:+ ${DIM}[$default]${RESET}}: " answer
  printf -v "$__var" '%s' "${answer:-$default}"
}

confirm() {
  local label="$1" default="${2:-n}" hint answer
  [[ "$default" == "s" ]] && hint="S/n" || hint="s/N"
  read -r -p "  ${label} [${hint}]: " answer
  answer="${answer:-$default}"
  [[ "$answer" =~ ^[sSyY] ]]
}

port_holder() {
  local port="$1" name
  name="$(docker ps --filter "publish=$port" --format '{{.Names}}' 2>/dev/null | head -n1)"
  if [[ -n "$name" ]]; then
    echo "$name"
  elif (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    echo "otro proceso"
  fi
}

ask_port() {
  local __var="$1" label="$2" default="$3" value holder
  while true; do
    ask value "$label" "$default"
    if ! [[ "$value" =~ ^[0-9]+$ ]] || (( value < 1024 || value > 65535 )); then
      warn "Puerto inválido: $value (usa 1024-65535)"
      continue
    fi
    holder="$(port_holder "$value")"
    if [[ -n "$holder" && "$holder" != keyme-* ]]; then
      warn "El puerto $value está ocupado por: $holder"
      confirm "¿Usarlo de todos modos?" n || continue
    fi
    printf -v "$__var" '%s' "$value"
    return
  done
}

ask_secret() {
  local __var="$1" label="$2" first second
  while true; do
    read -r -s -p "  ${label} ${DIM}[vacío = generar una]${RESET}: " first; echo
    if [[ -z "$first" ]]; then
      printf -v "$__var" '%s' "$(random_secret 32)"
      info "Generada y guardada en .env."
      return
    fi
    if [[ "$first" =~ $UNSAFE_SECRET_CHARS ]]; then
      warn "Sin espacios ni los caracteres \$ # ' \" \\ \` (Compose los interpreta en .env)."
      continue
    fi
    if (( ${#first} < 12 )); then
      warn "Mínimo 12 caracteres."
      continue
    fi
    read -r -s -p "  Repite la contraseña: " second; echo
    [[ "$first" == "$second" ]] || { warn "No coinciden."; continue; }
    printf -v "$__var" '%s' "$first"
    return
  done
}

random_secret() {
  LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "${1:-32}" || true
}

# -----------------------------------------------------------------------------
# .env
# -----------------------------------------------------------------------------

env_get() {
  local key="$1" file="${2:-$ENV_FILE}"
  [[ -f "$file" ]] || return 0
  grep -E "^${key}=" "$file" | tail -n1 | cut -d= -f2- | sed -E "s/^['\"](.*)['\"]$/\1/" || true
}

env_set() {
  local key="$1" value="$2" file="${3:-$ENV_FILE}" tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$value" '
    BEGIN { done = 0 }
    index($0, k "=") == 1 { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$file" > "$tmp"
  cat "$tmp" > "$file"
  rm -f "$tmp"
  chmod 600 "$file"
}

# Crea .env si falta y rellena los secretos vacíos. Así "./up.sh" sin más
# también funciona, con valores por defecto seguros.
ensure_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    info "Creado .env a partir de .env.example."
  fi
  [[ -n "$(env_get DB_PASSWORD)" ]] || { env_set DB_PASSWORD "$(random_secret 32)"; info "DB_PASSWORD generada."; }
  [[ "$(env_get APP_KEY)" == base64:* ]] || { env_set APP_KEY "base64:$(head -c 32 /dev/urandom | base64)"; info "APP_KEY generada."; }
  [[ -n "$(env_get KEYME_SETUP_TOKEN)" ]] || env_set KEYME_SETUP_TOKEN "$(new_setup_token)"
  [[ -n "$(env_get KEYME_PORT)" ]] || env_set KEYME_PORT 8470
  [[ "$(env_get HOST_UID)" == "$(id -u)" ]] || { env_set HOST_UID "$(id -u)"; env_set HOST_GID "$(id -g)"; }
  mkdir -p "$(backup_dir)"
}

new_setup_token() {
  echo "km-setup-$(random_secret 6)-$(random_secret 6)-$(random_secret 6)"
}

backup_dir() {
  local d
  d="$(env_get BACKUP_DIR)"
  d="${d:-./backups}"
  [[ "$d" = /* ]] && echo "$d" || echo "$ROOT_DIR/${d#./}"
}

port() {
  local p
  p="$(env_get KEYME_PORT)"
  echo "${p:-8470}"
}

# -----------------------------------------------------------------------------
# Comprobaciones
# -----------------------------------------------------------------------------

check_docker() {
  command -v docker >/dev/null 2>&1 || fail "Docker no está instalado: https://docs.docker.com/get-docker/"
  docker compose version >/dev/null 2>&1 || fail "Falta Docker Compose v2 ('docker compose')."
  docker info >/dev/null 2>&1 || fail "El daemon de Docker no responde. ¿Está abierto Docker Desktop (o 'sudo service docker start')?"
}

api_status() {
  curl -fsS --max-time 5 "http://127.0.0.1:$(port)/api/v1/status" 2>/dev/null || true
}

vault_initialized() {
  [[ "$(api_status)" == *'"initialized":true'* ]]
}

wait_for_api() {
  local elapsed=0 state
  info "Esperando a la API (migraciones incluidas)..."
  while (( elapsed < WAIT_TIMEOUT )); do
    if [[ -n "$(api_status)" ]]; then
      ok "API lista en http://localhost:$(port)"
      return 0
    fi
    state="$(docker inspect -f '{{.State.Status}} {{.RestartCount}}' keyme-api 2>/dev/null || echo "missing 0")"
    if [[ "$state" == exited* || "${state#* }" -gt 2 ]]; then
      warn "keyme-api se detuvo o se reinicia ($state). Últimas líneas:"
      docker compose logs --tail 30 api >&2 || true
      return 1
    fi
    sleep 3
    elapsed=$(( elapsed + 3 ))
  done
  warn "La API no respondió en ${WAIT_TIMEOUT}s. Revisa: docker compose logs api web"
  return 1
}

# -----------------------------------------------------------------------------
# Tailscale
# -----------------------------------------------------------------------------

# En WSL se usa el Tailscale de Windows (Docker Desktop publica los puertos en
# el localhost de Windows); en Linux, el binario local.
tailscale_bin() {
  if [[ -x "/mnt/c/Program Files/Tailscale/tailscale.exe" ]]; then
    echo "/mnt/c/Program Files/Tailscale/tailscale.exe"
  elif command -v tailscale >/dev/null 2>&1; then
    command -v tailscale
  fi
}

ts() {
  local bin
  bin="$(tailscale_bin)"
  [[ -n "$bin" ]] || return 127
  "$bin" "$@"
}

json_field() {
  # json_field <python-expr sobre d> ; lee JSON de stdin
  python3 -c "import json,sys; d=json.load(sys.stdin); print($1)" 2>/dev/null
}

tailscale_dns() {
  ts status --json 2>/dev/null | json_field "d.get('Self',{}).get('DNSName','').rstrip('.')"
}

setup_tailscale() {
  step "Tailscale"
  if [[ -z "$(tailscale_bin)" ]]; then
    warn "No encontré Tailscale. Instálalo (https://tailscale.com/download) y vuelve a correr ./up.sh --tailscale"
    return 1
  fi
  local state
  state="$(ts status --json 2>/dev/null | json_field "d.get('BackendState','')" || true)"
  if [[ "$state" != "Running" ]]; then
    info "Tailscale no tiene sesión iniciada ($state). Abriendo el inicio de sesión..."
    ts up || { warn "No se pudo iniciar sesión en Tailscale."; return 1; }
  fi
  local dns
  dns="$(tailscale_dns)"
  [[ -n "$dns" ]] || { warn "No obtuve el nombre DNS del equipo. ¿MagicDNS está activo en tu tailnet?"; return 1; }

  info "Publicando http://localhost:$(port) como https://$dns (solo dentro del tailnet)..."
  if ! ts serve --bg --https=443 "http://localhost:$(port)" >/dev/null 2>&1; then
    warn "tailscale serve falló. Activa en https://login.tailscale.com/admin/dns: MagicDNS y 'HTTPS Certificates'."
    ts serve --bg --https=443 "http://localhost:$(port)" || true
    return 1
  fi
  env_set APP_URL "https://$dns"
  env_set KEYME_TAILNET_URL "https://$dns"
  ok "Keyme en tu tailnet: ${BOLD}https://$dns${RESET}"
  info "Nada de esto es público: 'serve' (no 'funnel') solo acepta equipos de tu red Tailscale."
}

# -----------------------------------------------------------------------------
# Asistente (--setup)
# -----------------------------------------------------------------------------

setup_env() {
  step "2/5 Configuración"
  local fresh=false
  [[ -f "$ENV_FILE" ]] || fresh=true
  ensure_env
  if ! $fresh; then
    info "Ya existe un .env."
    confirm "¿Revisar sus valores?" s || return 0
  fi
  cp "$ENV_FILE" "$ENV_FILE.backup" 2>/dev/null || true

  local old_db_password p dir retention hour password
  old_db_password="$(env_get DB_PASSWORD)"

  echo
  echo "  ${BOLD}Red${RESET}  ${DIM}(Keyme solo escucha en 127.0.0.1; Tailscale lo lleva a tus dispositivos)${RESET}"
  ask_port p "Puerto local" "$(port)"
  env_set KEYME_PORT "$p"
  [[ "$(env_get APP_URL)" == http://localhost:* || -z "$(env_get APP_URL)" ]] && env_set APP_URL "http://localhost:$p"

  echo
  echo "  ${BOLD}Base de datos${RESET}"
  if docker volume inspect "$DB_VOLUME" >/dev/null 2>&1; then
    info "La base ya existe: se conserva su contraseña (PostgreSQL no acepta cambiarla desde .env)."
  elif confirm "¿Usar una contraseña generada para PostgreSQL? (recomendado)" s; then
    : # ensure_env ya generó una
  else
    ask_secret password "Contraseña de PostgreSQL"
    env_set DB_PASSWORD "$password"
  fi

  echo
  echo "  ${BOLD}Respaldos${RESET}  ${DIM}(pg_dump + adjuntos; todo ya va cifrado)${RESET}"
  ask dir "Carpeta de respaldos" "$(env_get BACKUP_DIR)"
  env_set BACKUP_DIR "${dir:-./backups}"
  mkdir -p "$(backup_dir)"
  while true; do
    ask retention "Días que se conservan" "$(env_get BACKUP_RETENTION_DAYS)"
    [[ "$retention" =~ ^[0-9]+$ ]] && break || warn "Escribe un número."
  done
  env_set BACKUP_RETENTION_DAYS "$retention"
  while true; do
    ask hour "Hora del respaldo diario (00-23)" "$(env_get BACKUP_HOUR)"
    [[ "$hour" =~ ^([01][0-9]|2[0-3])$ ]] && break || warn "Usa dos dígitos, p. ej. 03."
  done
  env_set BACKUP_HOUR "$hour"

  echo
  echo "  ${BOLD}Adjuntos${RESET}"
  local mb
  ask mb "Tamaño máximo por adjunto (MB)" "$(env_get KEYME_ATTACHMENT_MAX_MB)"
  [[ "$mb" =~ ^[0-9]+$ ]] && env_set KEYME_ATTACHMENT_MAX_MB "$mb"

  [[ "$old_db_password" != "$(env_get DB_PASSWORD)" ]] && docker volume inspect "$DB_VOLUME" >/dev/null 2>&1 \
    && env_set DB_PASSWORD "$old_db_password"
  ok ".env guardado (permisos 600)."
}

print_setup_token() {
  if vault_initialized; then
    info "El vault ya existe: el token de instalación ya no sirve para nada."
    return
  fi
  local url
  url="$(env_get KEYME_TAILNET_URL)"
  echo
  echo "  ${BOLD}Crea tu vault${RESET}"
  echo "  1. Abre ${BOLD}${url:-http://localhost:$(port)}${RESET}"
  echo "  2. Cuando lo pida, pega este token de instalación:"
  echo
  echo "       ${AMBER}${BOLD}$(env_get KEYME_SETUP_TOKEN)${RESET}"
  echo
  echo "  3. Elige tu contraseña maestra en la PWA (nunca sale de tu dispositivo)."
  echo "  ${DIM}Para instalarla como app: menú del navegador → Instalar Keyme.${RESET}"
}

summary() {
  local url
  url="$(env_get KEYME_TAILNET_URL)"
  echo
  ok "${BOLD}Keyme está arriba.${RESET}"
  echo "    Local       http://localhost:$(port)"
  [[ -n "$url" ]] && echo "    Tailnet     $url"
  echo "    Respaldos   $(backup_dir)"
  echo
  echo "    ${DIM}./up.sh --status · --backup · --tailscale · --logs · --down${RESET}"
}

# -----------------------------------------------------------------------------
# Acciones
# -----------------------------------------------------------------------------

run_tests() {
  step "Pruebas: crypto y modelos"
  # Copia de solo lectura: no toca el node_modules del host.
  docker run --rm -v "$ROOT_DIR:/repo:ro" node:24-alpine sh -c '
    mkdir -p /k/apps/web && cd /k &&
    cp /repo/package.json /repo/package-lock.json . && cp -r /repo/packages . && cp /repo/apps/web/package.json apps/web/ &&
    rm -rf packages/*/node_modules &&
    npm ci --no-audit --no-fund --ignore-scripts >/dev/null && npm test -w @keyme/crypto && npm test -w @keyme/models'

  step "Pruebas: API"
  docker compose up -d db >/dev/null
  until docker compose exec -T db sh -c 'pg_isready -q -U "$POSTGRES_USER"' >/dev/null 2>&1; do sleep 1; done
  docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tc "SELECT 1 FROM pg_database WHERE datname = '"'"'keyme_test'"'"'" | grep -q 1 || psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE DATABASE keyme_test"' >/dev/null
  docker compose --profile test build api-test
  docker compose --profile test run --rm api-test
  ok "Todas las pruebas pasaron."
}

run_backup() {
  docker compose ps --status running backup | grep -q keyme-backup || docker compose up -d backup
  docker compose exec -T backup sh /backup/loop.sh now
  ok "Respaldo en $(backup_dir)"
}

run_restore() {
  local file="$1"
  [[ -f "$file" ]] || fail "No existe: $file"
  echo
  echo "  ${RED}${BOLD}Esto reemplaza la base y los adjuntos actuales por los del respaldo.${RESET}"
  echo "  ${DIM}Antes se hace un respaldo del estado actual por si acaso.${RESET}"
  local typed
  ask typed "Escribe 'restaurar' para continuar" ""
  [[ "$typed" == "restaurar" ]] || fail "Cancelado."

  run_backup || warn "No se pudo respaldar el estado actual."
  local tmp
  tmp="$(mktemp -d)"
  tar -C "$tmp" -xf "$file" || fail "El archivo no es un respaldo de Keyme."
  [[ -f "$tmp/db.dump" ]] || fail "El respaldo no trae db.dump."

  docker compose stop web scheduler api >/dev/null
  docker compose up -d db >/dev/null
  until docker compose exec -T db sh -c 'pg_isready -q -U "$POSTGRES_USER"' >/dev/null 2>&1; do sleep 1; done
  docker compose exec -T db sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$tmp/db.dump"
  if [[ -f "$tmp/attachments.tar.gz" ]]; then
    docker run --rm -v "$DATA_VOLUME:/data" -v "$tmp:/in:ro" alpine:3.20 sh -c 'rm -rf /data/* && tar -C /data -xzf /in/attachments.tar.gz'
  fi
  rm -rf "$tmp"
  docker compose up -d >/dev/null
  wait_for_api
  ok "Respaldo restaurado. Los dispositivos se resincronizan solos."
}

show_status() {
  docker compose ps
  echo
  local s
  s="$(api_status)"
  if [[ -z "$s" ]]; then
    warn "La API no responde en http://localhost:$(port)"
  elif [[ "$s" == *'"initialized":true'* ]]; then
    ok "Vault creado."
  else
    info "Vault sin crear todavía. Token: $(env_get KEYME_SETUP_TOKEN)"
  fi
  if [[ -n "$(tailscale_bin)" ]]; then
    local dns
    dns="$(tailscale_dns || true)"
    [[ -n "$dns" ]] && info "Tailnet: https://$dns" || info "Tailscale sin sesión."
  fi
  local last
  last="$(ls -1t "$(backup_dir)"/keyme-*.tar 2>/dev/null | head -n1 || true)"
  [[ -n "$last" ]] && info "Último respaldo: $(basename "$last")" || warn "Aún no hay respaldos."
}

# -----------------------------------------------------------------------------
# Argumentos
# -----------------------------------------------------------------------------

while (( $# )); do
  case "$1" in
    --build|-b)        BUILD=true ;;
    --no-cache)        BUILD=true; NO_CACHE=true ;;
    --setup|-s)        SETUP=true; BUILD=true; WAIT=true ;;
    --wait|-w)         WAIT=true ;;
    --logs|-f)         FOLLOW_LOGS=true ;;
    --tailscale)       ACTION=tailscale ;;
    --test)            ACTION=test ;;
    --backup)          ACTION=backup ;;
    --restore)         ACTION=restore; RESTORE_FILE="${2:-}"; shift || true ;;
    --new-setup-token) ACTION=token ;;
    --status)          ACTION=status ;;
    --down)            ACTION=down ;;
    -h|--help)         usage; exit 0 ;;
    *)                 fail "Opción desconocida: $1 (./up.sh --help)" ;;
  esac
  shift
done

if $SETUP && [[ ! -t 0 ]]; then
  fail "--setup es interactivo: ejecútalo desde una terminal."
fi

check_docker

case "$ACTION" in
  tailscale) ensure_env; setup_tailscale; exit $? ;;
  test)      ensure_env; run_tests; exit 0 ;;
  backup)    ensure_env; run_backup; exit 0 ;;
  restore)   [[ -n "$RESTORE_FILE" ]] || fail "Uso: ./up.sh --restore backups/keyme-AAAAMMDD-HHMMSS.tar"; ensure_env; run_restore "$RESTORE_FILE"; exit 0 ;;
  status)    ensure_env; show_status; exit 0 ;;
  down)      docker compose down; ok "Detenido. Los datos siguen en los volúmenes $DB_VOLUME y $DATA_VOLUME."; exit 0 ;;
  token)
    ensure_env
    vault_initialized && fail "El vault ya existe; no hace falta un token."
    env_set KEYME_SETUP_TOKEN "$(new_setup_token)"
    docker compose up -d --force-recreate api >/dev/null
    print_setup_token
    exit 0 ;;
esac

if $SETUP; then
  banner
  step "1/5 Requisitos"
  ok "Docker $(docker version --format '{{.Server.Version}}') y Compose $(docker compose version --short)."
  [[ -n "$(tailscale_bin)" ]] && ok "Tailscale encontrado." || warn "Tailscale no encontrado (opcional para usar Keyme solo en esta PC)."
  setup_env
  step "3/5 Build y arranque"
else
  ensure_env
fi

if $NO_CACHE; then
  docker compose build --no-cache
fi
UP_ARGS=(up -d --remove-orphans)
$BUILD && ! $NO_CACHE && UP_ARGS+=(--build)
info "docker compose ${UP_ARGS[*]}"
docker compose "${UP_ARGS[@]}"

if $WAIT || $SETUP; then
  $SETUP && step "4/5 Esperando a la API"
  if ! wait_for_api; then
    $SETUP && fail "La instalación no terminó. Corrige el error y vuelve a correr ./up.sh --setup"
    exit 1
  fi
fi

if $SETUP; then
  step "5/5 Acceso"
  if [[ -n "$(tailscale_bin)" ]] && confirm "¿Publicar Keyme en tu tailnet con HTTPS (para tu teléfono y otras PCs)?" s; then
    setup_tailscale || warn "Puedes reintentarlo luego con ./up.sh --tailscale"
  fi
  print_setup_token
fi

summary

if $FOLLOW_LOGS; then
  docker compose logs -f
fi
