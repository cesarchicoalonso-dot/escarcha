const fsPromises = require('fs').promises;

async function readJSON(file) {
  try { 
    const data = await fsPromises.readFile(file, 'utf8');
    return JSON.parse(data); 
  }
  catch { return []; }
}

async function writeJSON(file, data) {
  await fsPromises.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = { readJSON, writeJSON };
