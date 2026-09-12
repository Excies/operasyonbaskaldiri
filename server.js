const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'votes.json');
const RATE = new Map();

app.set('trust proxy', true);
app.use(express.json({ limit: '10kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return { votes: 0, voters: [] };
  }
}

function saveData(data) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

function getClientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  const xff = req.headers['x-forwarded-for'];
  let ip = (cf && typeof cf === 'string' && cf.trim()) ||
           (xff ? xff.split(',')[0].trim() : '') ||
           req.socket.remoteAddress || req.ip || '';
  return ip.replace(/^::ffff:/, '').replace(/^::1$/, '127.0.0.1');
}

function rateAllowed(ip) {
  const now = Date.now();
  const windowStart = now - 60 * 1000;
  const hits = (RATE.get(ip) || []).filter(t => t > windowStart);
  if (hits.length >= 5) return false;
  hits.push(now);
  RATE.set(ip, hits);
  return true;
}

function sanitize(voters) {
  return voters.map(v => ({
    name: v.name,
    time: v.time
  }));
}

app.get('/api/votes', (req, res) => {
  const data = loadData();
  res.json({ votes: data.votes, voters: sanitize(data.voters) });
});

app.post('/api/vote', async (req, res) => {
  const username = (req.body.username || '').trim().replace(/^u\//i, '');

  const nameValid = /^[a-zA-Z0-9_\-]{3,20}$/.test(username);
  const nameRepeated = /(.)\1{4,}/.test(username);
  const allSame = username && username.split('').every(c => c === username[0].toLowerCase() || c.toLowerCase() === username[0].toLowerCase());

  if (!nameValid || nameRepeated || allSame) {
    return res.status(400).json({ error: 'Geçersiz Reddit kullanıcı adı. 3-20 karakter, harf/rakam/_/- kullan ve anlamlı bir ad seç.' });
  }

  const ip = getClientIp(req);

  if (!rateAllowed(ip)) {
    return res.status(429).json({ error: 'Çok hızlı deniyorsun. Dakikada 5 deneme hakkın var.' });
  }

  const data = loadData();

  const nameTaken = data.voters.find(v => v.name.toLowerCase() === username.toLowerCase());
  if (nameTaken) {
    return res.status(409).json({ error: 'Bu Reddit hesabı zaten oy kullanmış.' });
  }

  data.voters.unshift({
    name: username,
    time: Date.now()
  });
  data.votes = data.voters.length;
  saveData(data);

  res.json({ success: true, votes: data.votes, voters: sanitize(data.voters) });
});

app.listen(PORT, () => {
  console.log(`Operasyon: Başkaldırı çalışıyor → http://localhost:${PORT}`);
});