const { DB_BARBEROS } = require('../lib/config');
const { readJSON, writeJSON } = require('./base');

const BarberosRepository = {
  getAll: () => readJSON(DB_BARBEROS),
  saveAll: (data) => writeJSON(DB_BARBEROS, data)
};

module.exports = BarberosRepository;
