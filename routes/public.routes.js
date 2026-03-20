const { json, genId, readBody } = require('../lib/utils');
const Reservas = require('../repositories/reservas.repository');
const Disponibilidad = require('../repositories/disponibilidad.repository');
const Barberos = require('../repositories/barberos.repository');
const Users = require('../repositories/users.repository');
const Waitlist = require('../repositories/waitlist.repository');
const Email = require('../services/email.service');

async function handle(method, pathname, query, req, res) {
  // POST /api/reservas
  if (method === 'POST' && pathname === '/api/reservas') {
    const body = await readBody(req);
    const { servicio, barbero: barberoSolicitado, fecha, hora, nombre, email, telefono, precio } = body;
    
    if (!servicio || !barberoSolicitado || !fecha || !hora || !nombre || !email || !telefono) {
      console.error('[Error] Faltan campos obligatorios en el payload:', { servicio, barbero: barberoSolicitado, fecha, hora, nombre, email, telefono });
      return json(res, 400, { ok: false, error: 'Faltan campos obligatorios (incluyendo barbero)' });
    }

    const reservas = await Reservas.getAll();
    const barberosActivos = (await Barberos.getAll()).filter(b => b.activo !== false);
    
    let barberoAsignado = null;

    console.log(`[Reserva] Buscando hueco para: ${fecha} ${hora}. Solicitado: ${barberoSolicitado}`);

    if (barberoSolicitado !== 'any') {
      const ocupado = reservas.some(r => r.barbero === barberoSolicitado && r.fecha === fecha && r.hora === hora && r.estado !== 'cancelada');
      if (!ocupado) {
        barberoAsignado = barberoSolicitado;
      }
    } else {
      for (const b of barberosActivos) {
        const ocupado = reservas.some(r => r.barbero === b.id && r.fecha === fecha && r.hora === hora && r.estado !== 'cancelada');
        if (!ocupado) {
          barberoAsignado = b.id;
          console.log(`[Reserva] Asignado automáticamente a: ${b.nombre} (ID: ${b.id})`);
          break;
        }
      }
    }

    if (barberoAsignado && barberoAsignado !== 'any') {
      const reserva = {
        id: genId(),
        servicio,
        precio: precio || 0,
        barbero: barberoAsignado,
        fecha,
        hora,
        nombre,
        email,
        telefono,
        estado: 'pendiente',
        creadoEn: new Date().toISOString(),
        gdpr_aceptado: body.gdpr_aceptado || false,
        gdpr_timestamp: body.gdpr_aceptado ? new Date().toISOString() : null
      };

      reservas.push(reserva);
      await Reservas.saveAll(reservas);
      console.log(`[Reserva] Creada con éxito: ${reserva.id} para ${barberoAsignado}. Precio: ${reserva.precio}`);

      // Enviar email (no bloqueante)
      Email.sendConfirmationEmail(reserva).catch(err => console.error('Email confirmación:', err));

      // Actualizar base de usuarios
      const users = await Users.getAll();
      const userIdx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
      const userData = { nombre, email, telefono, actualizadoEn: new Date().toISOString() };
      if (userIdx === -1) {
        users.push({ ...userData, creadoEn: new Date().toISOString() });
      } else {
        users[userIdx] = { ...users[userIdx], ...userData };
      }
      await Users.saveAll(users);

      return json(res, 201, { ok: true, id: reserva.id });
    } 
    
    // Si NO hay hueco, derivamos a Waitlist automáticamente
    const waitlist = await Waitlist.getAll();
    const entry = {
      id: genId(),
      nombre,
      email,
      telefono,
      fecha,
      hora,
      servicio,
      barberoSolicitado,
      barbero: null, // No hay barbero asignado aún
      creadoEn: new Date().toISOString(),
      notificado: false
    };
    waitlist.push(entry);
    await Waitlist.saveAll(waitlist);

    return json(res, 201, {
      ok: true,
      waitlist: true,
      message: "No hay profesionales libres para esa hora. Te hemos añadido a la lista de espera correctamente."
    });
  }

  // POST /api/waitlist
  if (method === 'POST' && pathname === '/api/waitlist') {
    const body = await readBody(req);
    const { nombre, email, telefono, fecha } = body;
    if (!nombre || !email || !telefono || !fecha) {
      return json(res, 400, { error: 'Faltan campos obligatorios' });
    }
    const waitlist = await Waitlist.getAll();
    const barberoSolicitado = body.barbero || 'any';
    const entry = { 
      id: genId(), 
      nombre, 
      email, 
      telefono, 
      fecha, 
      hora: body.hora || 'any', 
      barberoSolicitado,
      barbero: barberoSolicitado === 'any' ? null : barberoSolicitado,
      creadoEn: new Date().toISOString(), 
      notificado: false 
    };
    waitlist.push(entry);
    await Waitlist.saveAll(waitlist);
    return json(res, 201, { ok: true, id: entry.id });
  }

  // GET /api/disponibilidad
  if (method === 'GET' && pathname === '/api/disponibilidad') {
    let disp = await Disponibilidad.getAll();
    let reservasArr = await Reservas.getAll();
    const qFecha = query.get('fecha');
    const qBarbero = query.get('barbero');
    if (qFecha) { disp = disp.filter(s => s.fecha === qFecha); }
    if (qBarbero && qBarbero !== 'any') { disp = disp.filter(s => s.barbero === qBarbero); }
    const result = disp.filter(s => {
      if (s.ocupado) return false;
      const tieneReserva = reservasArr.some(r => r.barbero === s.barbero && r.fecha === s.fecha && r.hora === s.hora && r.estado !== 'cancelada');
      return !tieneReserva;
    });
    return json(res, 200, result);
  }

  // GET /api/barberos
  if (method === 'GET' && pathname === '/api/barberos') {
    const all = await Barberos.getAll();
    const result = all.filter(b => b.activo !== false);
    return json(res, 200, result);
  }


  // GET /api/barberos
  if (method === 'GET' && pathname === '/api/barberos') {
    const barberos = await Barberos.getAll();
    return json(res, 200, barberos.filter(b => b.activo !== false));
  }

  // GET /api/auth?email=...
  if (method === 'GET' && pathname === '/api/auth') {
    const email = (query.get('email') || '').trim().toLowerCase();
    if (!email) return json(res, 400, { error: 'Email obligatorio' });
    const users = await Users.getAll();
    const user = users.find(u => (u.email || '').trim().toLowerCase() === email);
    if (!user) return json(res, 404, { error: 'Usuario no encontrado' });
    return json(res, 200, { ok: true, user });
  }

  return false;
}

module.exports = { handle };
