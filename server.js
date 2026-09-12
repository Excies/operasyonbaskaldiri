const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'votes.json');
const PROXY_CACHE = new Map();
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

function hashIp(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex');
}

function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('fe80:')) return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('100.64.')) return true;
  if (ip.startsWith('172.')) {
    const b = parseInt(ip.split('.')[1], 10);
    if (b >= 16 && b <= 31) return true;
  }
  return false;
}

function checkProxy(ip) {
  return new Promise((resolve) => {
    const cached = PROXY_CACHE.get(ip);
    if (cached && Date.now() - cached.ts < 24 * 60 * 60 * 1000) {
      return resolve(cached);
    }

    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,proxy,hosting,query`;
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const result = data.status === 'success'
            ? { proxy: !!data.proxy, hosting: !!data.hosting, ts: Date.now() }
            : { proxy: false, hosting: false, unknown: true, ts: Date.now() };
          PROXY_CACHE.set(ip, result);
          resolve(result);
        } catch (e) {
          resolve({ proxy: false, hosting: false });
        }
      });
    });
    req.setTimeout(4000, () => { req.destroy(); resolve({ proxy: false, hosting: false }); });
    req.on('error', () => resolve({ proxy: false, hosting: false }));
  });
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
  const ipHash = hashIp(ip);

  if (!rateAllowed(ip)) {
    return res.status(429).json({ error: 'Çok hızlı deniyorsun. Dakikada 5 deneme hakkın var.' });
  }

  const data = loadData();

  const nameTaken = data.voters.find(v => v.name.toLowerCase() === username.toLowerCase());
  if (nameTaken) {
    return res.status(409).json({ error: 'Bu Reddit hesabı zaten oy kullanmış.' });
  }

  const ipTaken = data.voters.find(v => v.ipHash === ipHash);
  if (ipTaken) {
    return res.status(409).json({ error: 'Bu IP/cihaz zaten oy kullandı. Bir IP tek oy.' });
  }

  if (!isPrivateIp(ip)) {
    const info = await checkProxy(ip);
    if (info.proxy || info.hosting) {
      return res.status(409).json({ error: 'VPN/proxy/veri merkezi IP\'si tespit edildi. Oy engellendi.' });
    }
  }

  data.voters.unshift({
    name: username,
    masked: username[0] + username.slice(1).replace(/./g, '*'),
    ipHash,
    time: Date.now()
  });
  data.votes = data.voters.length;
  saveData(data);

  res.json({ success: true, votes: data.votes, voters: sanitize(data.voters) });
});

app.listen(PORT, () => {
  console.log(`Operasyon: Başkaldırı çalışıyor → http://localhost:${PORT}`);
});