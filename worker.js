// ─────────────────────────────────────────────
// Cloudflare Worker — Portfolio Backend
// Tüm API route'ları burada, statik dosyalar
// env.ASSETS üzerinden otomatik servis edilir
// ─────────────────────────────────────────────

// ─── JWT ───
async function signJWT(payload, secret) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const body = btoa(JSON.stringify(payload))
    .replace(/=/g, '').replace(/\//g, '_').replace(/\+/g, '-');
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${data}.${sigB64}`;
}

async function verifyJWT(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Geçersiz token');
  const [header, payload, sig] = parts;
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  const sigBytes = Uint8Array.from(
    atob(sig.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)
  );
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
  if (!valid) throw new Error('Geçersiz imza');
  const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) throw new Error('Token süresi dolmuş');
  return decoded;
}

async function safeCompare(a, b, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
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

// ─── Yardımcılar ───
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function requireAuth(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return json({ error: 'Yetkisiz erişim' }, 401);
  try {
    await verifyJWT(auth.slice(7), env.JWT_SECRET);
    return null;
  } catch {
    return json({ error: 'Geçersiz veya süresi dolmuş token' }, 401);
  }
}

// ─── LOGIN ───
async function handleLogin(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Geçersiz istek' }, 400); }
  const { username, password } = body;
  if (!username || !password) return json({ error: 'Kullanıcı adı ve şifre gerekli' }, 400);
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD || !env.JWT_SECRET)
    return json({ error: 'Sunucu yapılandırma hatası — env variables eksik' }, 500);
  const userOk = await safeCompare(username, env.ADMIN_USERNAME, env.JWT_SECRET);
  const passOk = await safeCompare(password, env.ADMIN_PASSWORD, env.JWT_SECRET);
  if (!userOk || !passOk) {
    await new Promise(r => setTimeout(r, 300));
    return json({ error: 'Kullanıcı adı veya şifre hatalı' }, 401);
  }
  const token = await signJWT(
    { sub: username, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 604800 },
    env.JWT_SECRET
  );
  return json({ token, username });
}

// ─── CONTACT ───
async function handleContact(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Geçersiz JSON' }, 400); }
  const { name, email, subject, message } = body;
  if (!name?.trim() || !email?.trim() || !message?.trim())
    return json({ error: 'Ad, e-posta ve mesaj zorunludur' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return json({ error: 'Geçerli bir e-posta girin' }, 400);
  await env.DB.prepare(
    `INSERT INTO messages (name, email, subject, message) VALUES (?, ?, ?, ?)`
  ).bind(name.trim().slice(0, 100), email.trim().slice(0, 100),
    (subject || '').trim().slice(0, 200), message.trim().slice(0, 5000)).run();
  return json({ success: true, message: 'Mesajınız iletildi!' });
}

// ─── MESSAGES ───
async function handleMessages(request, env, path) {
  const err = await requireAuth(request, env);
  if (err) return err;
  const m = path.match(/\/api\/messages\/(\d+)/);
  const id = m ? parseInt(m[1]) : null;
  if (!id && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM messages ORDER BY created_at DESC`
    ).all();
    return json({ messages: results });
  }
  if (id && request.method === 'PATCH') {
    await env.DB.prepare(`UPDATE messages SET is_read = 1 WHERE id = ?`).bind(id).run();
    return json({ success: true });
  }
  if (id && request.method === 'DELETE') {
    await env.DB.prepare(`DELETE FROM messages WHERE id = ?`).bind(id).run();
    return json({ success: true });
  }
  return json({ error: 'Not found' }, 404);
}

// ─── POSTS ───
function slugify(t) {
  return t.toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
}

async function handlePosts(request, env, path) {
  const m = path.match(/\/api\/posts\/(\d+)/);
  const id = m ? parseInt(m[1]) : null;
  const method = request.method;

  if (method === 'GET') {
    if (!id) {
      const hasAuth = !!request.headers.get('Authorization');
      const where = hasAuth ? '' : 'WHERE published = 1';
      const { results } = await env.DB.prepare(
        `SELECT id, title, slug, excerpt, published, created_at, updated_at FROM posts ${where} ORDER BY created_at DESC`
      ).all();
      return json({ posts: results });
    }
    const post = await env.DB.prepare(`SELECT * FROM posts WHERE id = ?`).bind(id).first();
    if (!post) return json({ error: 'Yazı bulunamadı' }, 404);
    return json({ post });
  }

  const err = await requireAuth(request, env);
  if (err) return err;

  if (!id && method === 'POST') {
    let body; try { body = await request.json(); } catch { return json({ error: 'Geçersiz JSON' }, 400); }
    if (!body.title?.trim()) return json({ error: 'Başlık zorunludur' }, 400);
    const slug = slugify(body.title) + '-' + Date.now().toString(36);
    const r = await env.DB.prepare(
      `INSERT INTO posts (title, slug, content, excerpt, published) VALUES (?, ?, ?, ?, ?)`
    ).bind(body.title.trim(), slug, body.content || '', body.excerpt || '', body.published ? 1 : 0).run();
    return json({ success: true, id: r.meta.last_row_id, slug }, 201);
  }
  if (id && method === 'PUT') {
    let body; try { body = await request.json(); } catch { return json({ error: 'Geçersiz JSON' }, 400); }
    if (!body.title?.trim()) return json({ error: 'Başlık zorunludur' }, 400);
    await env.DB.prepare(
      `UPDATE posts SET title=?, content=?, excerpt=?, published=?, updated_at=datetime('now') WHERE id=?`
    ).bind(body.title.trim(), body.content || '', body.excerpt || '', body.published ? 1 : 0, id).run();
    return json({ success: true });
  }
  if (id && method === 'DELETE') {
    await env.DB.prepare(`DELETE FROM posts WHERE id = ?`).bind(id).run();
    return json({ success: true });
  }
  return json({ error: 'Not found' }, 404);
}

// ─── PROJECTS ───
async function handleProjects(request, env, path) {
  const m = path.match(/\/api\/projects\/(\d+)/);
  const id = m ? parseInt(m[1]) : null;
  const method = request.method;

  if (method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM projects ORDER BY order_index ASC, created_at DESC`
    ).all();
    return json({ projects: results.map(p => ({ ...p, tech_stack: JSON.parse(p.tech_stack || '[]') })) });
  }

  const err = await requireAuth(request, env);
  if (err) return err;

  if (!id && method === 'POST') {
    let body; try { body = await request.json(); } catch { return json({ error: 'Geçersiz JSON' }, 400); }
    if (!body.title?.trim()) return json({ error: 'Başlık zorunludur' }, 400);
    const r = await env.DB.prepare(
      `INSERT INTO projects (title, description, url, github_url, tech_stack, featured, order_index) VALUES (?,?,?,?,?,?,?)`
    ).bind(body.title.trim(), body.description || '', body.url || '', body.github_url || '',
      JSON.stringify(Array.isArray(body.tech_stack) ? body.tech_stack : []),
      body.featured ? 1 : 0, body.order_index ?? 0).run();
    return json({ success: true, id: r.meta.last_row_id }, 201);
  }
  if (id && method === 'PUT') {
    let body; try { body = await request.json(); } catch { return json({ error: 'Geçersiz JSON' }, 400); }
    if (!body.title?.trim()) return json({ error: 'Başlık zorunludur' }, 400);
    await env.DB.prepare(
      `UPDATE projects SET title=?,description=?,url=?,github_url=?,tech_stack=?,featured=?,order_index=?,updated_at=datetime('now') WHERE id=?`
    ).bind(body.title.trim(), body.description || '', body.url || '', body.github_url || '',
      JSON.stringify(Array.isArray(body.tech_stack) ? body.tech_stack : []),
      body.featured ? 1 : 0, body.order_index ?? 0, id).run();
    return json({ success: true });
  }
  if (id && method === 'DELETE') {
    await env.DB.prepare(`DELETE FROM projects WHERE id = ?`).bind(id).run();
    return json({ success: true });
  }
  return json({ error: 'Not found' }, 404);
}

// ─── CONTENT ───
async function handleContent(request, env) {
  const err = await requireAuth(request, env);
  if (err) return err;
  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT * FROM site_content`).all();
    const content = {};
    results.forEach(r => { content[r.key] = r.value; });
    return json({ content });
  }
  if (request.method === 'PUT') {
    let body; try { body = await request.json(); } catch { return json({ error: 'Geçersiz JSON' }, 400); }
    const updates = body.updates || [{ key: body.key, value: body.value }];
    for (const { key, value } of updates) {
      if (!key) continue;
      await env.DB.prepare(
        `INSERT INTO site_content (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).bind(key, value ?? '').run();
    }
    return json({ success: true });
  }
  return json({ error: 'Not found' }, 404);
}

// ─── ANA ROUTER ───
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (path === '/contact' && method === 'POST')      return handleContact(request, env);
      if (path === '/api/auth/login' && method === 'POST') return handleLogin(request, env);
      if (path.startsWith('/api/messages'))               return handleMessages(request, env, path);
      if (path.startsWith('/api/posts'))                  return handlePosts(request, env, path);
      if (path.startsWith('/api/projects'))               return handleProjects(request, env, path);
      if (path.startsWith('/api/content'))                return handleContent(request, env);

      // Statik dosyaları sun (index.html, görseller, admin/index.html)
      return env.ASSETS.fetch(request);
    } catch (err) {
      return json({ error: 'Sunucu hatası: ' + err.message }, 500);
    }
  }
};
