#!/bin/sh
# Respaldo diario: pg_dump (formato custom) + tar de adjuntos. Todo lo que hay
# dentro ya está cifrado en el cliente; aun así, guarda los respaldos fuera de
# esta máquina (regla 3-2-1: ver README).
set -eu

backup() {
  stamp="$(date +%Y%m%d-%H%M%S)"
  tmp="/backups/.keyme-$stamp"
  mkdir -p "$tmp"
  pg_dump -Fc -f "$tmp/db.dump"
  tar -C /data -czf "$tmp/attachments.tar.gz" .
  tar -C "$tmp" -cf "/backups/keyme-$stamp.tar" db.dump attachments.tar.gz
  rm -rf "$tmp"
  echo "[backup] keyme-$stamp.tar"
  find /backups -maxdepth 1 -name 'keyme-*.tar' -mtime "+${BACKUP_RETENTION_DAYS:-14}" -print -delete
}

if [ "${1:-}" = "now" ]; then
  backup
  exit 0
fi

until pg_isready -q; do sleep 2; done
last=""
while true; do
  today="$(date +%Y%m%d)"
  hour="$(date +%H)"
  if [ "$hour" = "${BACKUP_HOUR:-03}" ] && [ "$last" != "$today" ]; then
    backup || echo "[backup] falló" >&2
    last="$today"
  fi
  # Primer arranque sin ningún respaldo: hacer uno de inmediato.
  if [ -z "$(ls /backups/keyme-*.tar 2>/dev/null)" ]; then
    backup || true
    last="$today"
  fi
  sleep 600
done
