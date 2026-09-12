const DEFAULT_SECRET = 'baskaldiri-ops-2026';

function buf2hex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function signCaptcha(secret, parts) {
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

export async function onRequestGet(context) {
  const ts = String(Date.now());
  const isAdd = Math.random() < 0.5;
  const a = 1 + Math.floor(Math.random() * 20);
  const b = isAdd ? 1 + Math.floor(Math.random() * 9) : 2 + Math.floor(Math.random() * 8);
  const op = isAdd ? '+' : '×';
  const ans = isAdd ? a + b : a * b;
  const id = crypto.randomUUID();
  const sig = await signCaptcha(context.env.CAPTCHA_SECRET, `${ts}:${ans}`);
  return Response.json({ id, q: `${a} ${op} ${b} = ?`, ts, sig });
}