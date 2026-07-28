FROM php:8.2-cli

# Librerías de sistema que la extensión gd necesita para compilar
# (zlib es justo la que venía fallando con Railpack).
RUN apt-get update && apt-get install -y --no-install-recommends \
        zlib1g-dev \
        libpng-dev \
        libjpeg62-turbo-dev \
        libwebp-dev \
        libfreetype6-dev \
    && docker-php-ext-configure gd --with-jpeg --with-webp --with-freetype \
    && docker-php-ext-install -j"$(nproc)" gd pdo pdo_mysql \
    && apt-get purge -y --auto-remove \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . /app

# Railway asigna el puerto público en la variable de entorno PORT.
CMD ["sh", "-c", "php -S 0.0.0.0:${PORT:-8080} -t /app"]