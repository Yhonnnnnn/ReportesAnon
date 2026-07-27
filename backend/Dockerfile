FROM php:8.2-apache

# Instalar extensiones necesarias
RUN docker-php-ext-install pdo pdo_mysql

# Deshabilitar mpm_event y habilitar mpm_prefork (necesario para mod_rewrite)
RUN a2dismod mpm_event && \
    a2enmod mpm_prefork && \
    a2enmod rewrite

# Copiar todos los archivos del backend al directorio web
COPY . /var/www/html/

# Asegurar permisos en uploads
RUN chown -R www-data:www-data /var/www/html/uploads && \
    chmod -R 755 /var/www/html/uploads

EXPOSE 80

CMD ["apache2-foreground"]