FROM php:8.2-cli

# Instalar extensiones necesarias
RUN docker-php-ext-install pdo pdo_mysql

# Copiar archivos
COPY . /app
WORKDIR /app

# Asegurar permisos en uploads
RUN chown -R www-data:www-data /app/uploads && \
    chmod -R 755 /app/uploads

# El puerto lo asigna Railway via $PORT
EXPOSE $PORT

# Servir con PHP embebido (usa el puerto que Railway asigne)
CMD php -S 0.0.0.0:${PORT:-80} -t /app
