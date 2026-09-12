const RATE = new Map();

async function rateAllowed(ip) {
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

  if (!(await rateAllowed(ip))) {
    return Response.json({ error: 'Çok hızlı deniyorsun. Dakikada 5 deneme hakkın var.' }, { status: 429 });
  }

  const nameTaken = await env.DB.prepare('SELECT 1 FROM votes WHERE name = ? COLLATE NOCASE LIMIT 1').bind(username).first();
  if (nameTaken) {
    return Response.json({ error: 'Bu Reddit hesabı zaten oy kullanmış.' }, { status: 409 });
  }

  try {
    await env.DB.prepare('INSERT INTO votes (name, created_at) VALUES (?, ?)')
      .bind(username, Date.now())
      .run();
  } catch (e) {
    return Response.json({ error: 'Bu Reddit hesabı zaten oy kullanmış.' }, { status: 409 });
  }

  const count = await env.DB.prepare('SELECT COUNT(*) as n FROM votes').first();
  const rows = await env.DB.prepare('SELECT name, created_at FROM votes ORDER BY created_at DESC LIMIT 200').all();

  return Response.json({
    success: true,
    votes: count.n,
    voters: rows.results.map(r => ({ name: r.name, time: r.created_at }))
  });
}