// JWT yardımcı fonksiyonları (Web Crypto API - CF Workers'da native çalışır)
async function verifyJWT(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Geçersiz token formatı');

  const [header, payload, sig] = parts;
  const data = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const sigBytes = Uint8Array.from(
    atob(sig.replace(/-/g, '+').replace(/_/g, '/')),
    c => c.charCodeAt(0)
  );

  const valid = await crypto.subtle.verify(
    'HMAC', key, sigBytes, new TextEncoder().encode(data)
  );
  if (!valid) throw new Error('Geçersiz imza');

  const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token süresi dolmuş');
  }
  return decoded;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Korumasız rotalar
const PUBLIC_PATHS = ['/contact', '/api/auth/login'];
const PUBLIC_GET_PREFIXES = ['/api/posts', '/api/projects'];

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Sadece /api/ ve /contact rotalarını kontrol et
  if (!path.startsWith('/api/') && !path.startsWith('/contact')) {
    return next();
  }

  // Tamamen açık rotalar
  if (PUBLIC_PATHS.includes(path)) {
    return next();
  }

  // GET metoduyla açık prefixler
  if (request.method === 'GET') {
    const isPublicGet = PUBLIC_GET_PREFIXES.some(p => path.startsWith(p));
    if (isPublicGet) return next();
  }

  // JWT kontrolü
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return json({ error: 'Yetkisiz erişim' }, 401);
  }

  try {
    const token = authHeader.slice(7);
    const payload = await verifyJWT(token, env.JWT_SECRET);
    context.data = { user: payload };
    return next();
  } catch (err) {
    return json({ error: 'Geçersiz veya süresi dolmuş token' }, 401);
  }
}
