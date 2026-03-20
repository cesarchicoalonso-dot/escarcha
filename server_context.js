const { SESSIONS, SESSION_DURATION, LOGIN_ATTEMPTS, MAX_LOGIN_ATTEMPTS, LOGIN_WINDOW } = require('./server'); // Importamos del server para no romper la sesión global todavía
const { isAdmin } = require('./server');

module.exports = {
  isAdmin,
  SESSIONS,
  SESSION_DURATION,
  LOGIN_ATTEMPTS,
  MAX_LOGIN_ATTEMPTS,
  LOGIN_WINDOW
};
