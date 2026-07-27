FROM php:8.2-cli

# Instalar extensiones necesarias (GD para procesar imagenes)
RUN docker-php-ext-install pdo pdo_mysql gd

# Copiar archivos
COPY . /app
WORKDIR /app

# Asegurar permisos en uploads
RUN chown -R www-data:www-data /app/uploads && \
    chmod -R 755 /app/uploads

# Configurar PHP para permitir subida de archivos grandes
RUN echo "upload_max_filesize = 10M" >> /usr/local/etc/php/php.ini && \
    echo "post_max_size = 12M" >> /usr/local/etc/php/php.ini && \
    echo "max_execution_time = 60" >> /usr/local/etc/php/php.ini

# El puerto lo asigna Railway via $PORT
EXPOSE $PORT

# Servir con PHP embebido (usa el puerto que Railway asigne)
CMD php -S 0.0.0.0:${PORT:-80} -t /app
