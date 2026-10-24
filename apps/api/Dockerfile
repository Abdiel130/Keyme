# syntax=docker/dockerfile:1
FROM php:8.5-fpm-alpine AS base
# OPcache ya viene compilado en PHP 8.5

RUN apk add --no-cache libpq postgresql-client \
    && apk add --no-cache --virtual .build postgresql-dev $PHPIZE_DEPS \
    && docker-php-ext-install pdo_pgsql \
    && apk del .build

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY docker/php.ini /usr/local/etc/php/conf.d/keyme.ini
COPY docker/fpm.conf /usr/local/etc/php-fpm.d/zz-keyme.conf

WORKDIR /var/www/html

COPY composer.json composer.lock ./
RUN composer install --no-interaction --prefer-dist --no-dev --no-scripts --no-autoloader

COPY . .
RUN touch .env && mkdir -p storage/framework/cache/data storage/framework/views storage/logs bootstrap/cache /data \
    && composer dump-autoload --optimize --no-dev \
    && chown -R www-data:www-data storage bootstrap/cache /data

ENTRYPOINT ["/var/www/html/docker/entrypoint.sh"]
CMD ["php-fpm"]

# Imagen de pruebas: mismas capas + dependencias de desarrollo (PHPUnit)
FROM base AS test
RUN composer install --no-interaction --prefer-dist
CMD ["php", "artisan", "test"]
