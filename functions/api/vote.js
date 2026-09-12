const PROXY_CACHE = new Map();
const RATE = new Map();

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

async function hashIp(ip) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkProxy(ip) {
  const cached = PROXY_CACHE.get(ip);
  if (cached && Date.now() - cached.ts < 24 * 60 * 60 * 1000) return cached;
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,proxy,hosting`,
      { signal: AbortSignal.timeout(4000) }
    );
    const data = await res.json();
    const result = data.status === 'success'
      ? { proxy: !!data.proxy, hosting: !!data.hosting, ts: Date.now() }
      : { proxy: false, hosting: false, unknown: true, ts: Date.now() };
    PROXY_CACHE.set(ip, result);
    return result;
  } catch (e) {
    return { proxy: false, hosting: false };
  }
}

function rateAllowed(ip) {
  const now = Date.now();
  const hits = (RATE.get(ip) || []).filter(t => t > now - 60 * 1000);
  if (hits.length >= 5) return false;
  hits.push(now);
  RATE.set(ip, hits);
  return true;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || '';

  let username = '';
  try {
    const body = await request.json();
    username = (body.username || '').toString().trim().replace(/^u\//i, '');
  } catch (e) {
    return Response.json({ error: 'Geçersiz istek.' }, { status: 400 });
  }

  const nameValid = /^[a-zA-Z0-9_\-]{3,20}$/.test(username);
  const nameRepeated = /(.)\1{4,}/.test(username);
  const allSame = username.length > 0 && [...new Set(username.toLowerCase())].length === 1;

  if (!nameValid || nameRepeated || allSame) {
    return Response.json({ error: 'Geçersiz Reddit kullanıcı adı. 3-20 karakter, harf/rakam/_/- kullan ve anlamlı bir ad seç.' }, { status: 400 });
  }

  if (!rateAllowed(ip)) {
    return Response.json({ error: 'Çok hızlı deniyorsun. Dakikada 5 deneme hakkın var.' }, { status: 429 });
  }

  const ipHash = await hashIp(ip);

  const nameTaken = await env.DB.prepare('SELECT 1 FROM votes WHERE name = ? COLLATE NOCASE LIMIT 1').bind(username).first();
  if (nameTaken) {
    return Response.json({ error: 'Bu Reddit hesabı zaten oy kullanmış.' }, { status: 409 });
  }

  const ipTaken = await env.DB.prepare('SELECT 1 FROM votes WHERE ip_hash = ? LIMIT 1').bind(ipHash).first();
  if (ipTaken) {
    return Response.json({ error: 'Bu IP/cihaz zaten oy kullandı. Bir IP tek oy.' }, { status: 409 });
  }

  if (!isPrivateIp(ip)) {
    const info = await checkProxy(ip);
    if (info.proxy || info.hosting) {
      return Response.json({ error: "VPN/proxy/veri merkezi IP'si tespit edildi. Oy engellendi." }, { status: 409 });
    }
  }

  try {
    await env.DB.prepare('INSERT INTO votes (name, ip_hash, created_at) VALUES (?, ?, ?)')
      .bind(username, ipHash, Date.now())
      .run();
  } catch (e) {
    return Response.json({ error: 'Bu IP/cihaz zaten oy kullandı. Bir IP tek oy.' }, { status: 409 });
  }

  const count = await env.DB.prepare('SELECT COUNT(*) as n FROM votes').first();
  const rows = await env.DB.prepare('SELECT name, created_at FROM votes ORDER BY created_at DESC LIMIT 200').all();

  return Response.json({
    success: true,
    votes: count.n,
    voters: rows.results.map(r => ({ name: r.name, time: r.created_at }))
  });
}