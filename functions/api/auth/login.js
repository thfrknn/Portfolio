async function signJWT(payload, secret) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const body = btoa(JSON.stringify(payload))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const data = `${header}.${body}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${data}.${sigB64}`;
}

// Timing-safe string karşılaştırması (HMAC trick)
async function safeCompare(a, b, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const [ha, hb] = await Promise.all([
    crypto.subtle.sign('HMAC', key, new TextEncoder().encode(a)),
    crypto.subtle.sign('HMAC', key, new TextEncoder().encode(b))
  ]);
  const ua = new Uint8Array(ha), ub = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Geçersiz istek' }, 400);
  }

  const { username, password } = body;
  if (!username || !password) {
    return json({ error: 'Kullanıcı adı ve şifre gerekli' }, 400);
  }

  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD || !env.JWT_SECRET) {
    return json({ error: 'Sunucu yapılandırma hatası' }, 500);
  }

  const userOk = await safeCompare(username, env.ADMIN_USERNAME, env.JWT_SECRET);
  const passOk = await safeCompare(password, env.ADMIN_PASSWORD, env.JWT_SECRET);

  if (!userOk || !passOk) {
    // Brute force'a karşı hafif gecikme
    await new Promise(r => setTimeout(r, 300));
    return json({ error: 'Kullanıcı adı veya şifre hatalı' }, 401);
  }

  const token = await signJWT(
    {
      sub: username,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 // 7 gün
    },
    env.JWT_SECRET
  );

  return json({ token, username });
}
