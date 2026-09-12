const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'votes.json');
const RATE = new Map();
const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || 'baskaldiri-ops-2026';

function signCaptcha(parts) {
  return crypto.createHmac('sha256', CAPTCHA_SECRET).update(parts).digest('hex');
}

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
  const windowStart = now - 60 * 60 * 1000;
  const hits = (RATE.get(ip) || []).filter(t => t > windowStart);
  if (hits.length >= 1) return false;
  hits.push(now);
  RATE.set(ip, hits);
  return true;
}

function badgeFor(rank) {
  if (rank <= 10) return { text: 'İLK 10', cls: 'gold' };
  const milestones = [25, 50, 100, 250, 500, 1000, 2000, 5000];
  if (milestones.includes(rank)) return { text: rank + '. DİRENİŞÇİ', cls: 'milestone' };
  return null;
}

function purge() {
  const now = Date.now();
  for (const [k, v] of CHALLENGES.getInstance) {
    if (now - v.ts > 10 * 60 * 1000) CHALLENGES.delete(k);
  }
}

app.get('/api/captcha', (req, res) => {
  const ts = String(Date.now());
  const isAdd = Math.random() < 0.5;
  const a = 1 + Math.floor(Math.random() * 20);
  const b = isAdd ? 1 + Math.floor(Math.random() * 9) : 2 + Math.floor(Math.random() * 8);
  const op = isAdd ? '+' : '×';
  const ans = isAdd ? a + b : a * b;
  const id = crypto.randomUUID();
  const sig = signCaptcha(`${ts}:${ans}`);
  res.json({ id, q: `${a} ${op} ${b} = ?`, ts, sig });
});

function verifyCaptcha(req, body) {
  const ts = parseInt(String(body.captchaTs || ''), 10);
  const sig = String(body.captchaSig || '');
  const ans = String(body.captchaAnswer || '').trim();
  if (!ts || isNaN(ts) || !sig) return { ok: false };
  if (signCaptcha(`${ts}:${ans}`) !== sig) return { ok: false };
  const now = Date.now();
  if (now - ts > 10 * 60 * 1000) return { ok: false };
  return { ok: true, tooFast: now - ts < 1500 };
}

function sanitize(voters) {
  return voters.map(v => ({
    name: v.name,
    time: v.time,
    badge: badgeFor(v.rank)
  }));
}

app.get('/api/votes', (req, res) => {
  const data = loadData();
  data.voters.forEach((v, i) => { v.rank = data.voters.length - i; });
  res.json({ votes: data.votes, voters: sanitize(data.voters) });
});

app.post('/api/vote', async (req, res) => {
  const username = (req.body.username || '').trim().replace(/^u\//i, '');
  const hp = (req.body.hp || '').toString();

  if (hp) {
    return res.status(400).json({ error: 'Bot tespit edildi. Direnişe insanlar katılır.' });
  }

  const nameValid = /^[a-zA-Z0-9_\-]{3,20}$/.test(username);
  const nameRepeated = /(.)\1{4,}/.test(username);
  const allSame = username && username.split('').every(c => c.toLowerCase() === username[0].toLowerCase());

  if (!nameValid || nameRepeated || allSame) {
    return res.status(400).json({ error: 'Geçersiz Reddit kullanıcı adı. 3-20 karakter, harf/rakam/_/- kullan ve anlamlı bir ad seç.' });
  }

  const ip = getClientIp(req);

  const captchaCheck = verifyCaptcha(req, req.body);
  if (!captchaCheck.ok) {
    return res.status(400).json({ error: 'Doğrulama cevabı yanlış veya süresi doldu. Yeni soruda cevabı yaz.' });
  }
  if (captchaCheck.tooFast) {
    return res.status(400).json({ error: 'Çok hızlısın. Soruyu gerçekten hesaplaman gerekiyor.' });
  }

  if (!rateAllowed(ip)) {
    return res.status(429).json({ error: 'Zaten oy kullandın. Saatte yalnızca 1 oy hakkın var.' });
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

  data.voters.forEach((v, i) => { v.rank = data.voters.length - i; });

  res.json({
    success: true,
    votes: data.votes,
    yourBadge: badgeFor(data.voters.length),
    voters: sanitize(data.voters)
  });
});

app.listen(PORT, () => {
  console.log(`Operasyon: Başkaldırı çalışıyor → http://localhost:${PORT}`);
});