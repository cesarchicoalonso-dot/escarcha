// Servidor — Node.js puro, sin npm packages
const http   = require('http');
const fs     = require('fs');
const fsPromises = require('fs').promises;
const path   = require('path');
const crypto = require('crypto');

const PORT      = 3001;
const ROOT      = __dirname;

// Cargar variables de entorno desde .env si existe
try {
  const envFile = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  });
} catch (e) {
  // Ignorar si no existe .env
}

const ADMIN_KEY = process.env.ADMIN_KEY || 'escarcha2025';

// ── Servicios 3rd Party (Cero Dependencias) ───────────────────────────────────
const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_1234_placeholder';
const TWILIO_ACCT_SID = process.env.TWILIO_ACCT_SID || 'AC_placeholder';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || 'AUTH_placeholder';
const TWILIO_FROM_NUM = process.env.TWILIO_FROM_NUM || '+123456789';

async function enviarEmailConfirmacion(reserva) {
  try {
    if (RESEND_API_KEY.includes('placeholder')) {
      console.log('✉️ [SIMULACRO EMAIL] Enviando confirmación a', reserva.email);
      return;
    }
    // Implementación Resend genérica vía fetch nativo
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Citas <hola@tudominio.com>',
        to: [reserva.email],
        subject: `Confirmación de cita - Escarcha Grooming`,
        html: `<h2>¡Cita Confirmada!</h2><p>Hola ${reserva.nombre}, tu cita para ${reserva.servicio} el día ${reserva.fecha} a las ${reserva.hora} está confirmada.</p>`
      })
    });
    console.log(`✉️ Email real enviado a ${reserva.email}`);
  } catch (error) {
    console.error('Error enviando Email:', error);
  }
}

async function enviarRecordatorioWhatsApp(reserva) {
  try {
    if (TWILIO_ACCT_SID.includes('placeholder')) {
      console.log('📱 [SIMULACRO WHATSAPP] Enviando recordatorio 24h a', reserva.telefono);
      return;
    }
    // Lógica Twilio WhatsApp vía fetch
    const auth = Buffer.from(`${TWILIO_ACCT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
    const params = new URLSearchParams();
    params.append('To', `whatsapp:${reserva.telefono}`);
    params.append('From', `whatsapp:${TWILIO_FROM_NUM}`);
    params.append('Body', `Hola ${reserva.nombre}, te recordamos tu cita de ${reserva.servicio} para mañana a las ${reserva.hora}.`);
    
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCT_SID}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    console.log(`📱 WhatsApp enviado a ${reserva.telefono}`);
  } catch (error) {
    console.error('Error enviando WhatsApp:', error);
  }
}

const DB_RESERVAS       = path.join(ROOT, 'reservas.json');
const DB_DISPONIBILIDAD = path.join(ROOT, 'disponibilidad.json');
const DB_BARBEROS       = path.join(ROOT, 'barberos.json');
const UPLOADS_DIR       = path.join(ROOT, 'uploads');

// Crear carpeta uploads si no existe
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Inicializar barberos por defecto si no existe el fichero
if (!fs.existsSync(DB_BARBEROS)) {
  fs.writeFileSync(DB_BARBEROS, JSON.stringify([
    { id: 'BARB01', nombre: 'Andrea', apellido: 'Escarcha', rol: 'Fundadora & Master Barber', descripcion: 'Apasionada del grooming clásico con más de 10 años de experiencia en el sector.', foto: '', activo: true },
    { id: 'BARB02', nombre: 'Carlos', apellido: '',          rol: 'Senior Barber',              descripcion: 'Especialista en fades y barbas de precisión.', foto: '', activo: true },
    { id: 'BARB03', nombre: 'Lucas',  apellido: '',          rol: 'Barber & Estilista',         descripcion: 'Fusiona técnicas clásicas con tendencias modernas.', foto: '', activo: true },
  ], null, 2), 'utf8');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

// ── Helpers de base de datos ──────────────────────────────────────────────────

async function readDB(file) {
  try { 
    const data = await fsPromises.readFile(file, 'utf8');
    return JSON.parse(data); 
  }
  catch { return []; }
}

async function writeDB(file, data) {
  await fsPromises.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

function genId() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ── Helpers HTTP ──────────────────────────────────────────────────────────────

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(raw || '{}'));
      } catch { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

function isAdmin(req) {
  return req.headers['x-admin-key'] === ADMIN_KEY;
}

// ── Router API ────────────────────────────────────────────────────────────────

async function handleAPI(method, pathname, query, req, res) {

  // POST /api/admin/login
  if (method === 'POST' && pathname === '/api/admin/login') {
    const body = await readBody(req);
    if (body.password === ADMIN_KEY) {
      return json(res, 200, { ok: true, key: ADMIN_KEY });
    }
    return json(res, 401, { ok: false, error: 'Contraseña incorrecta' });
  }

  // ── RESERVAS ────────────────────────────────────────────────────────────────

  if (method === 'POST' && pathname === '/api/reservas') {
    const body = await readBody(req);
    const { servicio, precio, barbero, fecha, hora, nombre, email, telefono } = body;
    if (!servicio || !barbero || !fecha || !hora || !nombre || !email || !telefono) {
      return json(res, 400, { ok: false, error: 'Faltan campos obligatorios' });
    }
    const reservas = await readDB(DB_RESERVAS);

    // Validación estricta anti-overbooking
    const ocupada = reservas.find(r => r.barbero === barbero && r.fecha === fecha && r.hora === hora && r.estado !== 'cancelada');
    if (ocupada) {
      return json(res, 409, { ok: false, error: 'Esta franja horaria ya ha sido reservada.' });
    }

    const reserva = {
      id: genId(), servicio, precio, barbero, fecha, hora,
      nombre, email, telefono, estado: 'pendiente',
      creadoEn: new Date().toISOString(),
      gdpr_aceptado: body.gdpr_aceptado || false,
      gdpr_timestamp: body.gdpr_aceptado ? new Date().toISOString() : null
    };
    reservas.push(reserva);
    await writeDB(DB_RESERVAS, reservas);
    // Marcar slot como ocupado — crearlo si no existe
    const disp = await readDB(DB_DISPONIBILIDAD);
    const slot = disp.find(s => s.barbero === barbero && s.fecha === fecha && s.hora === hora);
    if (slot) {
      slot.ocupado = true;
    } else {
      // El admin puede haber reservado sin slot previo — lo creamos ocupado
      disp.push({ id: genId(), barbero, fecha, hora, ocupado: true });
    }
    await writeDB(DB_DISPONIBILIDAD, disp);
    return json(res, 201, { ok: true, id: reserva.id });
  }

  if (method === 'GET' && pathname === '/api/reservas') {
    if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
    return json(res, 200, await readDB(DB_RESERVAS));
  }

  if (method === 'PATCH' && pathname.startsWith('/api/reservas/')) {
    if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
    const id = pathname.split('/')[3];
    const body = await readBody(req);
    const reservas = await readDB(DB_RESERVAS);
    const r = reservas.find(x => x.id === id);
    if (!r) return json(res, 404, { error: 'Reserva no encontrada' });
    if (body.estado) r.estado = body.estado;
    await writeDB(DB_RESERVAS, reservas);
    return json(res, 200, { ok: true, reserva: r });
  }

  if (method === 'DELETE' && pathname.startsWith('/api/reservas/')) {
    if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
    const id = pathname.split('/')[3];
    const reservas = await readDB(DB_RESERVAS);
    const idx = reservas.findIndex(x => x.id === id);
    if (idx === -1) return json(res, 404, { error: 'Reserva no encontrada' });
    const r = reservas[idx];
    const disp = await readDB(DB_DISPONIBILIDAD);
    const slot = disp.find(s => s.barbero === r.barbero && s.fecha === r.fecha && s.hora === r.hora);
    if (slot) slot.ocupado = false;
    await writeDB(DB_DISPONIBILIDAD, disp);
    reservas.splice(idx, 1);
    await writeDB(DB_RESERVAS, reservas);
    return json(res, 200, { ok: true });
  }

  // ── DISPONIBILIDAD ──────────────────────────────────────────────────────────

  if (method === 'GET' && pathname === '/api/disponibilidad') {
    const disp = await readDB(DB_DISPONIBILIDAD);
    let result = disp.filter(s => !s.ocupado);
    if (query.fecha)   result = result.filter(s => s.fecha   === query.fecha);
    if (query.barbero) result = result.filter(s => s.barbero === query.barbero);
    return json(res, 200, result);
  }

  if (method === 'GET' && pathname === '/api/disponibilidad/all') {
    if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
    let result = await readDB(DB_DISPONIBILIDAD);
    // Agregar nombre del cliente a los slots ocupados
    if (result.some(s => s.ocupado)) {
      const reservas = await readDB(DB_RESERVAS);
      result = result.map(s => {
        if (s.ocupado) {
          const reserva = reservas.find(r => r.barbero === s.barbero && r.fecha === s.fecha && r.hora === s.hora);
          if (reserva) {
            return { ...s, clienteNombre: reserva.nombre, servicio: reserva.servicio };
          }
        }
        return s;
      });
    }
    if (query.fecha)   result = result.filter(s => s.fecha   === query.fecha);
    if (query.barbero) result = result.filter(s => s.barbero === query.barbero);
    return json(res, 200, result);
  }

  if (method === 'POST' && pathname === '/api/disponibilidad') {
    if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
    const body = await readBody(req);
    const slots = Array.isArray(body) ? body : [body];
    const disp = await readDB(DB_DISPONIBILIDAD);
    let created = 0;
    for (const s of slots) {
      const { barbero, fecha, hora } = s;
      if (!barbero || !fecha || !hora) continue;
      if (!disp.find(x => x.barbero === barbero && x.fecha === fecha && x.hora === hora)) {
        disp.push({ id: genId(), barbero, fecha, hora, ocupado: false });
        created++;
      }
    }
    await writeDB(DB_DISPONIBILIDAD, disp);
    return json(res, 201, { ok: true, created });
  }

  if (method === 'DELETE' && pathname.startsWith('/api/disponibilidad/')) {
    if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
    const id = pathname.split('/')[3];
    const disp = await readDB(DB_DISPONIBILIDAD);
    const idx = disp.findIndex(x => x.id === id);
    if (idx === -1) return json(res, 404, { error: 'Slot no encontrado' });
    disp.splice(idx, 1);
    await writeDB(DB_DISPONIBILIDAD, disp);
    return json(res, 200, { ok: true });
  }

  // ── BARBEROS ────────────────────────────────────────────────────────────────

  // GET /api/barberos — público (solo activos); ?all=1 + admin → todos
  if (method === 'GET' && pathname === '/api/barberos') {
    const all = await readDB(DB_BARBEROS);
    const result = (query.all === '1' && isAdmin(req)) ? all : all.filter(b => b.activo !== false);
    return json(res, 200, result);
  }

  // POST /api/barberos — crear (admin), soporta fotoBase64 + fotoExt
  if (method === 'POST' && pathname === '/api/barberos') {
    if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
    const body = await readBody(req);
    let foto = '';
    if (body.fotoBase64) {
      const ext = (body.fotoExt || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5);
      const filename = `barbero_${genId()}.${ext}`;
      await fsPromises.writeFile(path.join(UPLOADS_DIR, filename), Buffer.from(body.fotoBase64, 'base64'));
      foto = `/uploads/${filename}`;
    }
    const barberos = await readDB(DB_BARBEROS);
    const b = {
      id:          genId(),
      nombre:      body.nombre      || '',
      apellido:    body.apellido    || '',
      rol:         body.rol         || '',
      descripcion: body.descripcion || '',
      foto,
      activo: true,
    };
    barberos.push(b);
    await writeDB(DB_BARBEROS, barberos);
    return json(res, 201, { ok: true, barbero: b });
  }

  // PATCH /api/barberos/:id — editar (admin)
  if (method === 'PATCH' && pathname.startsWith('/api/barberos/')) {
    if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
    const id = pathname.split('/')[3];
    const body = await readBody(req);
    const barberos = await readDB(DB_BARBEROS);
    const b = barberos.find(x => x.id === id);
    if (!b) return json(res, 404, { error: 'Barbero no encontrado' });
    ['nombre','apellido','rol','descripcion','activo'].forEach(k => {
      if (body[k] !== undefined) b[k] = body[k];
    });
    if (body.fotoBase64) {
      if (b.foto && b.foto.startsWith('/uploads/')) {
        try { await fsPromises.unlink(path.join(ROOT, b.foto.slice(1))); } catch {}
      }
      const ext = (body.fotoExt || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5);
      const filename = `barbero_${genId()}.${ext}`;
      await fsPromises.writeFile(path.join(UPLOADS_DIR, filename), Buffer.from(body.fotoBase64, 'base64'));
      b.foto = `/uploads/${filename}`;
    }
    await writeDB(DB_BARBEROS, barberos);
    return json(res, 200, { ok: true, barbero: b });
  }

  // DELETE /api/barberos/:id — desactivar (admin, no borra físicamente)
  if (method === 'DELETE' && pathname.startsWith('/api/barberos/')) {
    if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
    const id = pathname.split('/')[3];
    const barberos = await readDB(DB_BARBEROS);
    const b = barberos.find(x => x.id === id);
    if (!b) return json(res, 404, { error: 'Barbero no encontrado' });
    b.activo = false;
    await writeDB(DB_BARBEROS, barberos);
    return json(res, 200, { ok: true });
  }

  // ── PAGO (placeholder) ──────────────────────────────────────────────────────
  if (method === 'POST' && pathname.startsWith('/api/pago/')) {
    return json(res, 501, { ok: false, error: 'Pasarela de pago no configurada aún' });
  }

  return null;
}

// ── Servidor principal ────────────────────────────────────────────────────────

// ── Scheduler 24H (WhatsApp / NodeJS nativo) ───────────────────────────────
async function cronJobRecordatorios() {
  try {
    const reservas = await readDB(DB_RESERVAS);
    const ahora = new Date();
    let modificado = false;
    
    for (const r of reservas) {
      if (r.estado !== 'confirmada' || r.notificado_24h) continue;
      
      const rDate = new Date(`${r.fecha}T${r.hora}`);
      const horasParaCita = (rDate - ahora) / (1000 * 60 * 60);
      
      // Si faltan 24 horas o menos (pero más de 0)
      if (horasParaCita > 0 && horasParaCita <= 24) {
        r.notificado_24h = true;
        modificado = true;
        enviarRecordatorioWhatsApp(r).catch(err => console.error(err));
      }
    }
    
    if (modificado) await writeDB(DB_RESERVAS, reservas);
  } catch (err) {
    console.error('Error en el cron de recordatorios:', err);
  }
}
// Ejecutar cron cada hora (3600000 ms)
setInterval(cronJobRecordatorios, 60 * 60 * 1000);
setTimeout(cronJobRecordatorios, 10000); // Primer check al vuelo

http.createServer(async (req, res) => {
  const parsed   = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsed.pathname;
  const query    = Object.fromEntries(parsed.searchParams);
  const method   = req.method.toUpperCase();

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Key',
    });
    return res.end();
  }

  if (pathname.startsWith('/api/')) {
    try {
      const handled = await handleAPI(method, pathname, query, req, res);
      if (handled === null) return json(res, 404, { error: 'Ruta API no encontrada' });
    } catch (err) {
      return json(res, 500, { error: err.message });
    }
    return;
  }

  let url = pathname;
  if (url === '/') url = '/index.html';
  
  // SOLUCION PATH TRAVERSAL: Usando path.normalize y asegurar que está en ROOT
  const safePathname = decodeURIComponent(url).replace(/\0/g, ''); // Evitar null byte attacks
  let filePath = path.join(ROOT, safePathname);
  
  // Evitamos Path Traversal
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access denied.');
    return;
  }

  const ext      = path.extname(filePath).toLowerCase();
  const mime     = MIME[ext] || 'application/octet-stream';

  try {
    const data = await fsPromises.readFile(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }); 
    res.end('Not found');
  }

}).listen(PORT, () => {
  console.log(`Escarcha Grooming — http://localhost:${PORT}`);
  console.log(`Admin panel     — http://localhost:${PORT}/admin.html`);
});
