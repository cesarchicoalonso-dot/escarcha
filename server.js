// Servidor — Node.js puro, sin npm packages
const http   = require('http');
const fs     = require('fs');
const fsPromises = require('fs').promises;
const path   = require('path');
const crypto = require('crypto');

// Configuración y Utilidades
const config = require('./lib/config');
const utils  = require('./lib/utils');

const {
  PORT, ROOT, ADMIN_KEY,
  RESEND_API_KEY, TWILIO_ACCT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUM,
  GOOGLE_REVIEWS_URL, EMAIL_FROM,
  DB_RESERVAS, DB_DISPONIBILIDAD, DB_BARBEROS, DB_WAITLIST, DB_USERS,
  UPLOADS_DIR, MIME
} = config;

const { json, readBody, genId } = utils;

// Repositorios
const Reservas       = require('./repositories/reservas.repository');
const Disponibilidad = require('./repositories/disponibilidad.repository');
const Barberos       = require('./repositories/barberos.repository');
const Users          = require('./repositories/users.repository');
const Waitlist       = require('./repositories/waitlist.repository');

// Servicios
const Email    = require('./services/email.service');
const WhatsApp = require('./services/whatsapp.service');
// apiRouter se importará más abajo para evitar circularidad

// ── Sistema de Sesiones Admin (En Memoria) ──────────────────────────────────
const SESSIONS = new Map(); // token -> { expires: timestamp }
const SESSION_DURATION = 30 * 60 * 1000; // 30 minutos

// ── Rate Limiting Admin Login (En Memoria) ───────────────────────────────────
const LOGIN_ATTEMPTS = new Map(); // ip -> { count: number, lastAttempt: timestamp }
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW = 15 * 60 * 1000; // 15 minutos

// Limpieza automática cada 10 min
setInterval(() => {
  const ahora = Date.now();
  for (const [token, data] of SESSIONS.entries()) {
    if (ahora > data.expires) SESSIONS.delete(token);
  }
  for (const [ip, data] of LOGIN_ATTEMPTS.entries()) {
    if (ahora - data.lastAttempt > LOGIN_WINDOW) LOGIN_ATTEMPTS.delete(ip);
  }
}, 10 * 60 * 1000);

// (Lógica de notificación movida a /services)

// (Rutas de DB movidas a config.js)

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
if (!fs.existsSync(DB_WAITLIST)) fs.writeFileSync(DB_WAITLIST, '[]', 'utf8');
if (!fs.existsSync(DB_USERS)) fs.writeFileSync(DB_USERS, '[]', 'utf8');

// (MIME movido a config.js)

// ── Helpers de base de datos ──────────────────────────────────────────────────

// (Helpers de base de datos movidos a /repositories)

// (Helpers json, readBody y genId movidos a utils.js)

function isAdmin(req) {
  const token = req.headers['x-admin-token'];
  if (!token) return false;
  
  const sesion = SESSIONS.get(token);
  if (!sesion) return false;
  
  if (Date.now() > sesion.expires) {
    SESSIONS.delete(token);
    return false;
  }
  
  // Refrescar sesión en cada uso (opcional, pero mejora UX)
  sesion.expires = Date.now() + SESSION_DURATION;
  return true;
}

// Exportar contexto antes de importar el router para romper circularidad
module.exports = {
  isAdmin,
  SESSIONS,
  SESSION_DURATION,
  LOGIN_ATTEMPTS,
  MAX_LOGIN_ATTEMPTS,
  LOGIN_WINDOW
};

const apiRouter = require('./routes/index');

// ── Router API (Modularizado en /routes) ───────────────────────────────────────
// La lógica se ha movido a routes/index.js, routes/public.routes.js y routes/admin.routes.js

// ── Servidor principal ────────────────────────────────────────────────────────

async function procesarListaEspera(fecha, barbero, hora) {
  const waitlist = await Waitlist.getAll();
  const interesados = waitlist.filter(w => !w.notificado && w.fecha === fecha && (w.barbero === 'any' || w.barbero === barbero));
  
  if (interesados.length === 0) return;

  console.log(`🔔 Notificando a ${interesados.length} interesados en la lista de espera para el ${fecha} a las ${hora}`);
  
  for (const user of interesados) {
    // Simulamos notificación
    console.log(`✉️ [SIMULACRO] Notificando a ${user.nombre} (${user.email}) que hay un hueco el ${fecha} a las ${hora}`);
    user.notificado = true;
    user.notificadoEn = new Date().toISOString();
  }
  
  await Waitlist.saveAll(waitlist);
}

// ── Scheduler 24H (WhatsApp / NodeJS nativo) ───────────────────────────────
async function cronJobRecordatorios() {
  try {
    const reservas = await Reservas.getAll();
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
        WhatsApp.sendWhatsAppReminder(r).catch(err => console.error(err));
      }
    }
    
    if (modificado) await Reservas.saveAll(reservas);
  } catch (err) {
    console.error('Error en el cron de recordatorios:', err);
  }
}
// Ejecutar cron cada hora (3600000 ms)
setInterval(cronJobRecordatorios, 60 * 60 * 1000);
setTimeout(cronJobRecordatorios, 10000); // Primer check al vuelo

// ── Cron de Fidelización (Email post-cita) ────────────────────────────────────────
async function cronJobFidelizacion() {
  try {
    const reservas = await Reservas.getAll();
    const ahora = new Date();
    // Fecha de ayer en formato YYYY-MM-DD
    const ayer = new Date(ahora);
    ayer.setDate(ayer.getDate() - 1);
    const ayerStr = ayer.toISOString().slice(0, 10);
    let modificado = false;

    for (const r of reservas) {
      if (r.fidelizacion_enviada || r.estado === 'cancelada') continue;
      if (r.fecha !== ayerStr) continue;

      r.fidelizacion_enviada = true;
      modificado = true;

      // Enviar email solicitar reseña
      if (RESEND_API_KEY.includes('placeholder')) {
        console.log(`⭐ [SIMULACRO FIDELIZACIÓN] Enviando email de satisfacción a ${r.email} (cita del ${r.fecha})`);
      } else {
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `Escarcha Grooming Club <${EMAIL_FROM}>`,
            to: [r.email],
            subject: `¿Qué tal tu experiencia en Escarcha Grooming Club?`,
            html: `
              <div style="background:#0a0a0a;padding:32px;font-family:sans-serif;color:#fff;max-width:600px;margin:auto">
                <h1 style="color:#C9A96E;font-size:1.4rem;margin-bottom:8px">Hola, ${r.nombre} — ¿cómo fue tu visita?</h1>
                <p style="color:#aaa;margin-bottom:24px">Ayer visitaste Escarcha Grooming Club. Esperamos que tu experiencia haya sido excelente.</p>
                <p style="color:#aaa;margin-bottom:32px">Si tienes un momento, nos ayudaría mucho que compartieras tu opinión en Google. Solo te llevará un minuto.</p>
                <a href="${GOOGLE_REVIEWS_URL}" target="_blank" style="display:inline-block;background:#C9A96E;color:#000;text-decoration:none;padding:14px 28px;font-weight:700;font-size:0.95rem;border-radius:4px">
                  Dejar una reseña en Google ⭐
                </a>
                <p style="color:#555;font-size:0.78rem;margin-top:32px">Escarcha Grooming Club — C/ Rosario Pino, 18, Madrid</p>
              </div>`
          })
        }).catch(err => console.error('Error email fidelización:', err));
      }
    }

    if (modificado) await Reservas.saveAll(reservas);
  } catch (err) {
    console.error('Error en el cron de fidelización:', err);
  }
}
// Ejecutar fidelización una vez al día (86400000 ms) y al arrancar con 30s de delay
setInterval(cronJobFidelizacion, 24 * 60 * 60 * 1000);
setTimeout(cronJobFidelizacion, 30000);

http.createServer(async (req, res) => {
  const parsed   = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsed.pathname;
  const query    = parsed.searchParams;
  const method   = req.method.toUpperCase();

  // CORS (Opcional, pero recomendado si el front va por otro puerto)
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
    });
    return res.end();
  }

  // Rutas API delegadas al router modular
  if (pathname.startsWith('/api/')) {
    try {
      const handled = await apiRouter.handleAPI(method, pathname, query, req, res);
      if (handled) return;
      return json(res, 404, { error: 'Endpoint no encontrado' });
    } catch (err) {
      console.error('API Error:', err);
      return json(res, 500, { error: 'Error interno del servidor' });
    }
  }

  // Servidor Estático
  try {
    let filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
    
    // Seguridad: evitar path traversal
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    // Rewrite admin/login to admin.html
    if (pathname === '/admin' || pathname === '/admin/login' || pathname === '/admin/') {
      filePath = path.join(ROOT, 'admin.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    
    // Bloquear acceso a archivos JSON confidenciales
    if (pathname.endsWith('.json')) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Forbidden: Acceso restringido a archivos de configuración.');
    }

    const contentType = MIME[ext] || 'application/octet-stream';

    const data = await fsPromises.readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }); 
    res.end('Not found');
  }

}).listen(PORT, () => {
  console.log(`Escarcha Grooming — http://localhost:${PORT}`);
  console.log(`Admin panel     — http://localhost:${PORT}/admin.html`);
});
