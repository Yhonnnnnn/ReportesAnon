// ===== URL base del backend =====
// Cambia SOLO esta línea cuando cambies de entorno:
//
//   - En desarrollo local (XAMPP/WAMP), debe apuntar a la carpeta real
//     donde tengas el proyecto dentro de htdocs. Ojo: el nombre de la
//     carpeta debe coincidir exactamente (mayúsculas incluidas).
//   - En producción (Railway), debe ser la URL pública que Railway te
//     asigna al servicio del backend, por ejemplo:
//     https://reportesanon-backend-production.up.railway.app
//
// Todos los servicios (auth, reportes, votos) arman su URL a partir de
// esta base, así que nunca quedan desincronizados entre sí.
export const API_URL = 'http://localhost/ReportesAnon/backend/api';
