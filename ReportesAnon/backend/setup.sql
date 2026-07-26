CREATE DATABASE IF NOT EXISTS reportes_anonimos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE reportes_anonimos;

CREATE TABLE IF NOT EXISTS reportes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    categoria VARCHAR(50) NOT NULL,
    descripcion TEXT NOT NULL,
    latitud DECIMAL(10, 7) NOT NULL,
    longitud DECIMAL(10, 7) NOT NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    anonimo TINYINT(1) NOT NULL DEFAULT 1,
    evidencia_path VARCHAR(255) NULL,
    confirmaciones INT NOT NULL DEFAULT 0,
    marcas_falso INT NOT NULL DEFAULT 0,
    estado ENUM('activo', 'oculto') NOT NULL DEFAULT 'activo'
    -- OJO: esta tabla NO tiene (ni debe tener) una columna que apunte al usuario
    -- que creo el reporte. Asi el reporte queda desligado de cualquier cuenta
    -- desde el momento en que se guarda, incluso si el usuario inicio sesion
    -- (que ahora es obligatorio para poder reportar).
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===== USUARIOS (cuentas para el perfil, separadas de los reportes) =====
-- Las cuentas usan correo + contraseña. El correo se guarda como email_hash
-- para que nunca quede almacenado en texto plano:
-- email_hash es un hash HMAC-SHA256 de un solo sentido (no se puede revertir),
-- usado para detectar y autenticar la cuenta. El alias se genera automáticamente.
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    alias VARCHAR(30) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NULL,
    proveedor ENUM('local') NOT NULL DEFAULT 'local',
    email_hash CHAR(64) NULL UNIQUE,
    avatar_color VARCHAR(7) NOT NULL DEFAULT '#e53935',
    creado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tokens de sesion (equivalente simple a JWT). Se puede borrar una fila
-- para cerrar esa sesion sin afectar la cuenta.
CREATE TABLE IF NOT EXISTS sesiones (
    token CHAR(64) PRIMARY KEY,
    usuario_id INT NOT NULL,
    creado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira DATETIME NOT NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===== CONTROL DE REPORTES FALSOS =====

-- Un voto por usuario por reporte (evita votar varias veces). Guardar quién
-- vota NO revela quién escribió el reporte: son cosas independientes.
CREATE TABLE IF NOT EXISTS reportes_votos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reporte_id INT NOT NULL,
    usuario_id INT NOT NULL,
    tipo ENUM('confirma', 'falso') NOT NULL,
    creado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unico_voto (reporte_id, usuario_id),
    FOREIGN KEY (reporte_id) REFERENCES reportes(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Límite de envíos por día y por cuenta (anti-spam). Solo cuenta cuántos
-- reportes envió cada usuario ese día; NO guarda cuáles son esos reportes,
-- así que sigue sin poder ligarse un reporte concreto a una cuenta.
CREATE TABLE IF NOT EXISTS limite_envios (
    usuario_id INT NOT NULL,
    fecha DATE NOT NULL,
    contador INT NOT NULL DEFAULT 0,
    PRIMARY KEY (usuario_id, fecha),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
