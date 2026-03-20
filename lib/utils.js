const crypto = require('crypto');

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

function genId() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

module.exports = {
  json,
  readBody,
  genId
};
