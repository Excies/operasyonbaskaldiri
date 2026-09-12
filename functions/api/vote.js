const RATE = new Map();
const DEFAULT_SECRET = 'baskaldiri-ops-2026';

function buf2hex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function signCaptcha(secret, parts) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret || DEFAULT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(parts));
  return buf2hex(sig);
}

function rateAllowed(ip) {
  const now = Date.now();
  const hits = (RATE.get(ip) || []).filter(t => t > now - 60 * 60 * 1000);
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

async function verifyCaptcha(context, body) {
  const ts = parseInt(String(body.captchaTs || ''), 10);
  const sig = String(body.captchaSig || '');
  const ans = String(body.captchaAnswer || '').trim();
  if (!ts || isNaN(ts) || !sig) return { ok: false };

  const expected = await signCaptcha(context.env.CAPTCHA_SECRET, `${ts}:${ans}`);
  if (expected !== sig) return { ok: false };

  const now = Date.now();
  if (now - ts > 10 * 60 * 1000) return { ok: false };
  return { ok: true, tooFast: now - ts < 1500 };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || '';

  let username = '', captchaId = '', captchaAnswer = '', captchaSig = '', captchaTs = '', hp = '';
  try {
    const body = await request.json();
    username = (body.username || '').toString().trim().replace(/^u\//i, '');
    captchaId = (body.captchaId || '').toString();
    captchaAnswer = (body.captchaAnswer || '').toString().trim();
    captchaSig = (body.captchaSig || '').toString();
    captchaTs = (body.captchaTs || '').toString();
    hp = (body.hp || '').toString();

    const check = await verifyCaptcha(context, {
      captchaTs,
      captchaSig,
      captchaAnswer
    });
    if (!check.ok) {
      return Response.json({ error: 'Doğrulama cevabı yanlış veya süresi doldu. Yeni soruda cevabı yaz.' }, { status: 400 });
    }
    if (check.tooFast) {
      return Response.json({ error: 'Çok hızlısın. Soruyu gerçekten hesaplaman gerekiyor.' }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ error: 'Geçersiz istek.' }, { status: 400 });
  }

  if (hp) {
    return Response.json({ error: 'Bot tespit edildi. Direnişe insanlar katılır.' }, { status: 400 });
  }

  const nameValid = /^[a-zA-Z0-9_\-]{3,20}$/.test(username);
  const nameRepeated = /(.)\1{4,}/.test(username);
  const allSame = username.length > 0 && [...new Set(username.toLowerCase())].length === 1;

  if (!nameValid || nameRepeated || allSame) {
    return Response.json({ error: 'Geçersiz Reddit kullanıcı adı. 3-20 karakter, harf/rakam/_/- kullan ve anlamlı bir ad seç.' }, { status: 400 });
  }

  if (!rateAllowed(ip)) {
    return Response.json({ error: 'Zaten oy kullandın. Saatte yalnızca 1 oy hakkın var.' }, { status: 429 });
  }

  const nameTaken = await env.DB.prepare('SELECT 1 FROM votes WHERE name = ? COLLATE NOCASE LIMIT 1').bind(username).first();
  if (nameTaken) {
    return Response.json({ error: 'Bu Reddit hesabı zaten oy kullanmış.' }, { status: 409 });
  }

  const before = await env.DB.prepare('SELECT COUNT(*) as n FROM votes').first();
  const rank = before.n + 1;

  try {
    await env.DB.prepare('INSERT INTO votes (name, created_at) VALUES (?, ?)')
      .bind(username, Date.now())
      .run();
  } catch (e) {
    return Response.json({ error: 'Bu Reddit hesabı zaten oy kullanmış.' }, { status: 409 });
  }

  const count = await env.DB.prepare('SELECT COUNT(*) as n FROM votes').first();
  const rows = await env.DB.prepare(`
    SELECT name, created_at,
      ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) as rnk
    FROM votes ORDER BY created_at DESC LIMIT 200
  `).all();

  return Response.json({
    success: true,
    votes: count.n,
    yourBadge: badgeFor(rank),
    voters: rows.results.map(r => ({
      name: r.name,
      time: r.created_at,
      badge: badgeFor(r.rnk)
    }))
  });
}