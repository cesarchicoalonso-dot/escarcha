const { DB_RESERVAS } = require('../lib/config');
const { readJSON, writeJSON } = require('./base');

const ReservasRepository = {
  getAll: () => readJSON(DB_RESERVAS),
  saveAll: (data) => writeJSON(DB_RESERVAS, data)
};

module.exports = ReservasRepository;
