function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// GET /api/projects - projeleri listele (herkese açık)
export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare(
    `SELECT * FROM projects ORDER BY order_index ASC, created_at DESC`
  ).all();

  const projects = results.map(p => ({
    ...p,
    tech_stack: JSON.parse(p.tech_stack || '[]')
  }));

  return json({ projects });
}

// POST /api/projects - yeni proje ekle (korumalı)
export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Geçersiz JSON' }, 400); }

  const { title, description, url, github_url, tech_stack, featured, order_index } = body;
  if (!title?.trim()) return json({ error: 'Başlık zorunludur' }, 400);

  const result = await env.DB.prepare(
    `INSERT INTO projects (title, description, url, github_url, tech_stack, featured, order_index)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    title.trim(),
    description || '',
    url || '',
    github_url || '',
    JSON.stringify(Array.isArray(tech_stack) ? tech_stack : []),
    featured ? 1 : 0,
    order_index ?? 0
  ).run();

  return json({ success: true, id: result.meta.last_row_id }, 201);
}
