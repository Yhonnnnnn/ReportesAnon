FROM php:8.2-apache

# Instalar extensiones necesarias
RUN docker-php-ext-install pdo pdo_mysql && \
    a2enmod rewrite

# Copiar todos los archivos del backend al directorio web
COPY . /var/www/html/

# Configurar el DocumentRoot (opcional, por defecto ya es /var/www/html)
# y asegurar que .htaccess funcione
RUN chown -R www-data:www-data /var/www/html/uploads && \
    chmod -R 755 /var/www/html/uploads

EXPOSE 80

CMD ["apache2-foreground"]