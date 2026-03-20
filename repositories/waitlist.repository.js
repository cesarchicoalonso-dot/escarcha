const { DB_WAITLIST } = require('../lib/config');
const { readJSON, writeJSON } = require('./base');

const WaitlistRepository = {
  getAll: () => readJSON(DB_WAITLIST),
  saveAll: (data) => writeJSON(DB_WAITLIST, data)
};

module.exports = WaitlistRepository;
