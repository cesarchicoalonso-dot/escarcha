const { DB_DISPONIBILIDAD } = require('../lib/config');
const { readJSON, writeJSON } = require('./base');

const DisponibilidadRepository = {
  getAll: () => readJSON(DB_DISPONIBILIDAD),
  saveAll: (data) => writeJSON(DB_DISPONIBILIDAD, data)
};

module.exports = DisponibilidadRepository;
