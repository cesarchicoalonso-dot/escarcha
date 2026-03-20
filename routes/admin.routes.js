const crypto = require('crypto');
const { isAdmin, SESSIONS, SESSION_DURATION, LOGIN_ATTEMPTS, MAX_LOGIN_ATTEMPTS, LOGIN_WINDOW } = require('../server_context'); // Temporalmente hasta BA-05
const { json, genId, readBody } = require('../lib/utils');
const Reservas = require('../repositories/reservas.repository');
const Disponibilidad = require('../repositories/disponibilidad.repository');
const Barberos = require('../repositories/barberos.repository');
const Email = require('../services/email.service');
const WhatsApp = require('../services/whatsapp.service');
const fsPromises = require('fs').promises;
const path = require('path');
const { UPLOADS_DIR, ADMIN_KEY } = require('../lib/config');

async function handle(method, pathname, query, req, res) {
  // POST /api/admin/login
  if (method === 'POST' && pathname === '/api/admin/login') {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const ahora = Date.now();
    
    // Validar Rate Limit
    const intentos = LOGIN_ATTEMPTS.get(ip);
    if (intentos && ahora - intentos.lastAttempt < LOGIN_WINDOW) {
      if (intentos.count >= MAX_LOGIN_ATTEMPTS) {
        return json(res, 429, { ok: false, error: 'Demasiados intentos. Inténtalo de nuevo en 15 minutos.' });
      }
    }

    if (!ADMIN_KEY) {
      return json(res, 500, { ok: false, error: 'Acceso administrativo no configurado en el servidor.' });
    }

    const body = await readBody(req);
    if (body.password === ADMIN_KEY) {
      LOGIN_ATTEMPTS.delete(ip);
      const token = crypto.randomBytes(32).toString('hex');
      SESSIONS.set(token, { expires: ahora + SESSION_DURATION });
      return json(res, 200, { ok: true, token });
    } else {
      const entry = intentos && (ahora - intentos.lastAttempt < LOGIN_WINDOW)
        ? { count: intentos.count + 1, lastAttempt: ahora }
        : { count: 1, lastAttempt: ahora };
      LOGIN_ATTEMPTS.set(ip, entry);
      return json(res, 401, { ok: false, error: 'Contraseña incorrecta' });
    }
  }

  // --- RUTAS PROTEGIDAS ---
  const isProtected = pathname.startsWith('/api/admin') || 
                      pathname.startsWith('/api/reservas') || 
                      pathname.startsWith('/api/disponibilidad') || 
                      pathname.startsWith('/api/barberos');

  if (!isProtected) {
      if (method === 'GET' && pathname === '/api/reservas') { /* Continua abajo */ }
      else return false; 
  }

  // GET /api/admin/facturacion
  if (method === 'GET' && pathname === '/api/admin/facturacion') {
    if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
    let reservas = await Reservas.getAll();
    
    const qBarbero = query.get('barbero');
    const qDesde = query.get('desde');
    const qHasta = query.get('hasta');

    // Filtrar por barbero y fecha (independiente del estado para la tabla operativa)
    let filtered = reservas;
    if (qBarbero && qBarbero !== 'all' && qBarbero !== '') {
      filtered = filtered.filter(r => r.barbero === qBarbero);
    }
    if (qDesde) filtered = filtered.filter(r => r.fecha >= qDesde);
    if (qHasta) filtered = filtered.filter(r => r.fecha <= qHasta);

    // Cálculos de KPIs
    // 1. Ingresos Totales: Confirmadas, Pagadas o Pendientes (asumimos que todas suman al total del periodo si no están canceladas)
    const estadosFacturables = ['confirmada', 'pagada', 'pendiente'];
    const facturables = filtered.filter(r => estadosFacturables.includes(r.estado));
    
    // Función auxiliar para obtener precio fiable
    const getPrecio = (r) => {
      if (typeof r.precio === 'number') return r.precio;
      const match = (r.servicio || '').match(/(\d+(?:\.\d+)?)/);
      return match ? parseFloat(match[1]) : 0;
    };

    const totalIngresos = facturables.reduce((acc, r) => acc + getPrecio(r), 0);
    
    // 2. Pendiente de Facturar: Solo "pagada" y que NO tenga invoice_id
    const pendientes = filtered.filter(r => r.estado === 'pagada' && !r.invoice_id);
    const totalPendiente = pendientes.reduce((acc, r) => acc + getPrecio(r), 0);

    // 3. Métricas para gráficos (Top Servicios y Barberos)
    const srvMap = {};
    const barbMap = {};
    facturables.forEach(r => {
      const p = getPrecio(r);
      // Por servicio
      const srvs = (r.servicio || 'Sin servicio').split(',').map(s => s.trim());
      srvs.forEach(s => {
        if (!srvMap[s]) srvMap[s] = { total: 0, count: 0 };
        srvMap[s].total += p / srvs.length; // Repartimos el precio si hay varios
        srvMap[s].count++;
      });
      // Por barbero
      if (!barbMap[r.barbero]) barbMap[r.barbero] = { total: 0, count: 0 };
      barbMap[r.barbero].total += p;
      barbMap[r.barbero].count++;
    });

    const topServicios = Object.entries(srvMap)
      .map(([servicio, d]) => ({ servicio, ...d }))
      .sort((a, b) => b.total - a.total);

    const porBarbero = Object.entries(barbMap)
      .map(([barbero, d]) => ({ barbero, ...d }))
      .sort((a, b) => b.total - a.total);

    return json(res, 200, {
      ok: true,
      totalIngresos,
      totalReservas: facturables.length,
      totalPendiente,
      reservas: filtered, // Enviamos las filtradas para la tabla operativa
      topServicios,
      porBarbero
    });
  }

  // POST /api/admin/facturacion/emitir
  if (method === 'POST' && pathname === '/api/admin/facturacion/emitir') {
    if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
    const body = await readBody(req);
    const { id } = body;
    if (!id) return json(res, 400, { error: 'Falta ID de reserva' });

    const reservas = await Reservas.getAll();
    const r = reservas.find(x => x.id === id);
    if (!r) return json(res, 404, { error: 'Reserva no encontrada' });
    if (r.estado !== 'pagada') return json(res, 400, { error: 'Solo se pueden facturar citas pagadas' });
    if (r.invoice_id) return json(res, 400, { error: 'Ya tiene factura emitida', invoice_id: r.invoice_id });

    // Generar ID Secuencial: FAC-YYYY-NNNN
    const year = new Date().getFullYear();
    const prefix = `FAC-${year}-`;
    
    // Buscar el numero más alto de este año
    let max = 0;
    reservas.forEach(x => {
      if (x.invoice_id && x.invoice_id.startsWith(prefix)) {
        const num = parseInt(x.invoice_id.split('-')[2]);
        if (!isNaN(num) && num > max) max = num;
      }
    });

    const nextNum = (max + 1).toString().padStart(4, '0');
    r.invoice_id = `${prefix}${nextNum}`;
    r.invoiced = true;
    r.fechaFactura = new Date().toISOString();

    await Reservas.saveAll(reservas);
    return json(res, 200, { ok: true, invoice_id: r.invoice_id });
  }

  // POST /api/admin/reservas — reserva manual admin
  if (method === 'POST' && pathname === '/api/admin/reservas') {
    if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
    const body = await readBody(req);
    const { servicio, barbero, fecha, hora, nombre } = body;
    if (!servicio || !barbero || !fecha || !hora || !nombre) {
      return json(res, 400, { error: 'Faltan campos obligatorios' });
    }
    const reservas = await Reservas.getAll();
    const ocupada = reservas.find(r => r.barbero === barbero && r.fecha === fecha && r.hora === hora && r.estado !== 'cancelada');
    if (ocupada) return json(res, 409, { ok: false, error: 'Esa franja ya está ocupada.' });
    const reserva = {
      id: genId(), servicio, barbero, fecha, hora, nombre,
      email: body.email || '', telefono: body.telefono || '',
      estado: 'confirmada', creadoEn: new Date().toISOString(),
      gdpr_aceptado: false,
    };
    reservas.push(reserva);
    await Reservas.saveAll(reservas);
    return json(res, 201, { ok: true, id: reserva.id });
  }

  // POST /api/admin/reservas/:id/notificar/:tipo
  if (method === 'POST' && pathname.startsWith('/api/admin/reservas/') && pathname.includes('/notificar/')) {
    if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
    const parts = pathname.split('/');
    const id = parts[4]; const tipo = parts[6];
    const reservas = await Reservas.getAll();
    const r = reservas.find(x => x.id === id);
    if (!r) return json(res, 404, { error: 'Reserva no encontrada' });
    if (tipo === 'email') {
      await Email.sendConfirmationEmail(r);
      r.email_confirmacion_enviado = true;
    } else if (tipo === 'whatsapp') {
      await WhatsApp.sendWhatsAppReminder(r);
      r.notificado_24h = true;
    } else if (tipo === 'fidelizacion') {
      r.fidelizacion_enviada = true;
    }
    await Reservas.saveAll(reservas);
    return json(res, 200, { ok: true });
  }

  // GET /api/reservas 
  if (method === 'GET' && pathname === '/api/reservas') {
    if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
    return json(res, 200, await Reservas.getAll());
  }

  // PATCH /api/reservas/:id
  if (method === 'PATCH' && pathname.startsWith('/api/reservas/')) {
    if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
    const id = pathname.split('/')[3];
    if (!id) return false;
    const body = await readBody(req);
    const reservas = await Reservas.getAll();
    const r = reservas.find(x => x.id === id);
    if (!r) return json(res, 404, { error: 'Reserva no encontrada' });
    
    if (body.estado) {
      const oldEstado = r.estado;
      r.estado = body.estado;
      if (body.estado === 'cancelada' && oldEstado !== 'cancelada') {
        // La ocupación se liberará dinámicamente al no encontrar la reserva
      }
    }
    await Reservas.saveAll(reservas);
    return json(res, 200, { ok: true, reserva: r });
  }

  // DELETE /api/reservas/:id
  if (method === 'DELETE' && pathname.startsWith('/api/reservas/')) {
    if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
    const id = pathname.split('/')[3];
    if (!id) return false;
    const reservas = await Reservas.getAll();
    const idx = reservas.findIndex(x => x.id === id);
    if (idx === -1) return json(res, 404, { error: 'Reserva no encontrada' });
    const r = reservas[idx];
    reservas.splice(idx, 1);
    await Reservas.saveAll(reservas);
    return json(res, 200, { ok: true });
  }

  // GET /api/disponibilidad/all
  if (method === 'GET' && pathname === '/api/disponibilidad/all') {
    if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
    const barbId = query.get('barbero');
    const disp = await Disponibilidad.getAll();
    const reservas = await Reservas.getAll();
    
    // Filtrar solo los slots del barbero solicitado (si se pide uno)
    let filteredDisp = disp;
    if (barbId && barbId !== 'all') {
      filteredDisp = disp.filter(s => s.barbero === barbId);
    }

    let result = filteredDisp.map(s => {
      // Solo consideramos reservado si existe una reserva y NO está cancelada o no-show
      const r = reservas.find(res => res.barbero === s.barbero && res.fecha === s.fecha && res.hora === s.hora && !['cancelada', 'no-show'].includes(res.estado));
      return { 
        ...s, 
        reservado: !!r, 
        clienteNombre: r ? r.nombre : null, 
        servicio: r ? r.servicio : null 
      };
    });
    return json(res, 200, result);
  }

  // POST /api/disponibilidad
  if (method === 'POST' && pathname === '/api/disponibilidad') {
    if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
    const body = await readBody(req);
    const slots = Array.isArray(body) ? body : [body];
    const disp = await Disponibilidad.getAll();
    let created = 0;
    for (const s of slots) {
      const { barbero, fecha, hora } = s;
      if (!disp.some(x => x.barbero === barbero && x.fecha === fecha && x.hora === hora)) {
        disp.push({ id: genId(), barbero, fecha, hora, ocupado: false });
        created++;
      }
    }
    await Disponibilidad.saveAll(disp);
    return json(res, 201, { ok: true, created });
  }

  // DELETE /api/disponibilidad/:id
  if (method === 'DELETE' && pathname.startsWith('/api/disponibilidad/')) {
    if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
    const id = pathname.split('/')[3];
    const disp = await Disponibilidad.getAll();
    const idx = disp.findIndex(x => x.id === id);
    if (idx === -1) return json(res, 404, { error: 'Slot no encontrado' });
    disp.splice(idx, 1);
    await Disponibilidad.saveAll(disp);
    return json(res, 200, { ok: true });
  }

  // POST /api/barberos
  if (method === 'POST' && pathname === '/api/barberos') {
    if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
    const body = await readBody(req);
    let foto = '';
    if (body.fotoBase64) {
      const filename = `barbero_${Date.now()}.jpg`;
      await fsPromises.writeFile(path.join(UPLOADS_DIR, filename), Buffer.from(body.fotoBase64, 'base64'));
      foto = `/uploads/${filename}`;
    }
    const barberos = await Barberos.getAll();
    const b = { id: genId(), nombre: body.nombre || '', apellido: body.apellido || '', rol: body.rol || '', descripcion: body.descripcion || '', foto, activo: true };
    barberos.push(b);
    await Barberos.saveAll(barberos);
    return json(res, 201, { ok: true, barbero: b });
  }

  // PATCH /api/barberos/:id
  if (method === 'PATCH' && pathname.startsWith('/api/barberos/')) {
    if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
    const id = pathname.split('/')[3];
    const body = await readBody(req);
    const barberos = await Barberos.getAll();
    const b = barberos.find(x => x.id === id);
    if (!b) return json(res, 404, { error: 'Barbero no encontrado' });
    ['nombre','apellido','rol','descripcion','activo'].forEach(k => { if (body[k] !== undefined) b[k] = body[k]; });
    if (body.fotoBase64) {
      const filename = `barbero_${Date.now()}.jpg`;
      await fsPromises.writeFile(path.join(UPLOADS_DIR, filename), Buffer.from(body.fotoBase64, 'base64'));
      b.foto = `/uploads/${filename}`;
    }
    await Barberos.saveAll(barberos);
    return json(res, 200, { ok: true, barbero: b });
  }

  // DELETE /api/barberos/:id
  if (method === 'DELETE' && pathname.startsWith('/api/barberos/')) {
    if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
    const id = pathname.split('/')[3];
    const barberos = await Barberos.getAll();
    const b = barberos.find(x => x.id === id);
    if (!b) return json(res, 404, { error: 'Barbero no encontrado' });
    b.activo = false;
    await Barberos.saveAll(barberos);
    return json(res, 200, { ok: true });
  }

  return false; // No se manejó en este módulo
}

module.exports = { handle };
