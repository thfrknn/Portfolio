function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-').replace(/-+/g, '-');
}

// GET /api/posts - yayınlanmış yazıları listele (herkese açık)
export async function onRequestGet(context) {
  const { env, request } = context;
  const authHeader = request.headers.get('Authorization');

  // Admin tüm yazıları, ziyaretçi sadece yayınlananları görür
  const whereClause = authHeader ? '' : 'WHERE published = 1';

  const { results } = await env.DB.prepare(
    `SELECT id, title, slug, excerpt, published, created_at, updated_at
     FROM posts ${whereClause} ORDER BY created_at DESC`
  ).all();

  return json({ posts: results });
}

// POST /api/posts - yeni yazı oluştur (korumalı)
export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Geçersiz JSON' }, 400); }

  const { title, content, excerpt, published } = body;
  if (!title?.trim()) return json({ error: 'Başlık zorunludur' }, 400);

  const slug = slugify(title) + '-' + Date.now().toString(36);

  const result = await env.DB.prepare(
    `INSERT INTO posts (title, slug, content, excerpt, published) VALUES (?, ?, ?, ?, ?)`
  ).bind(
    title.trim(),
    slug,
    content || '',
    excerpt || '',
    published ? 1 : 0
  ).run();

  return json({ success: true, id: result.meta.last_row_id, slug }, 201);
}
