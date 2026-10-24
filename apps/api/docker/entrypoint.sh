#!/bin/sh
# Entrypoint de keyme-api (y del programador de tareas, que usa la misma imagen).
set -e
cd /var/www/html

if [ -z "$APP_KEY" ]; then
  echo "[keyme] Falta APP_KEY. Corre ./up.sh --setup" >&2
  exit 1
fi

echo "[keyme] Esperando a PostgreSQL en ${DB_HOST}:${DB_PORT}..."
until pg_isready -q -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME"; do sleep 1; done

mkdir -p "${KEYME_DATA_PATH:-/data}/attachments"
chown -R www-data:www-data "${KEYME_DATA_PATH:-/data}" storage bootstrap/cache 2>/dev/null || true

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  php artisan migrate --force --no-interaction
fi
if [ "$APP_ENV" = "production" ]; then
  php artisan config:cache >/dev/null
  php artisan route:cache >/dev/null
fi

exec "$@"
