const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3001;

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

const ADMIN_KEY = process.env.ADMIN_KEY;

// ── Servicios 3rd Party (Cero Dependencias) ───────────────────────────────────
const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_1234_placeholder';
const TWILIO_ACCT_SID = process.env.TWILIO_ACCT_SID || 'AC_placeholder';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || 'AUTH_placeholder';
const TWILIO_FROM_NUM = process.env.TWILIO_FROM_NUM || '+123456789';
const GOOGLE_REVIEWS_URL = process.env.GOOGLE_REVIEWS_URL || 'https://g.page/r/XXXXXX/review';
const EMAIL_FROM = process.env.EMAIL_FROM || 'citas@escarchagroomingclub.com';

const DB_RESERVAS       = path.join(ROOT, 'reservas.json');
const DB_DISPONIBILIDAD = path.join(ROOT, 'disponibilidad.json');
const DB_BARBEROS       = path.join(ROOT, 'barberos.json');
const DB_WAITLIST       = path.join(ROOT, 'waitlist.json');
const DB_USERS          = path.join(ROOT, 'users.json');
const UPLOADS_DIR       = path.join(ROOT, 'uploads');

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
  '.txt':  'text/plain; charset=utf-8',
  '.xml':  'application/xml; charset=utf-8',
};

module.exports = {
  PORT,
  ROOT,
  ADMIN_KEY,
  RESEND_API_KEY,
  TWILIO_ACCT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUM,
  GOOGLE_REVIEWS_URL,
  EMAIL_FROM,
  DB_RESERVAS,
  DB_DISPONIBILIDAD,
  DB_BARBEROS,
  DB_WAITLIST,
  DB_USERS,
  UPLOADS_DIR,
  MIME
};
