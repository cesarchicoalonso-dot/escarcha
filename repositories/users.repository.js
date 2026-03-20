const { DB_USERS } = require('../lib/config');
const { readJSON, writeJSON } = require('./base');

const UsersRepository = {
  getAll: () => readJSON(DB_USERS),
  saveAll: (data) => writeJSON(DB_USERS, data)
};

module.exports = UsersRepository;
