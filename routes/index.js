const adminRoutes = require('./admin.routes');
const publicRoutes = require('./public.routes');

async function handleAPI(method, pathname, query, req, res) {
  // Intentar con rutas de administrador primero
  let handled = await adminRoutes.handle(method, pathname, query, req, res);
  if (handled !== false) return true;

  // Intentar con rutas públicas
  handled = await publicRoutes.handle(method, pathname, query, req, res);
  if (handled !== false) return true;

  return false; // Ninguna ruta manejada
}

module.exports = { handleAPI };
