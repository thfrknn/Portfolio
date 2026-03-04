function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// GET /api/posts/:id
export async function onRequestGet(context) {
  const { env, params } = context;
  const id = parseInt(params.id);
  if (!id) return json({ error: 'Geçersiz ID' }, 400);

  const post = await env.DB.prepare(`SELECT * FROM posts WHERE id = ?`).bind(id).first();
  if (!post) return json({ error: 'Yazı bulunamadı' }, 404);

  return json({ post });
}

// PUT /api/posts/:id - yazıyı güncelle
export async function onRequestPut(context) {
  const { request, env, params } = context;
  const id = parseInt(params.id);
  if (!id) return json({ error: 'Geçersiz ID' }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Geçersiz JSON' }, 400); }

  const { title, content, excerpt, published } = body;
  if (!title?.trim()) return json({ error: 'Başlık zorunludur' }, 400);

  await env.DB.prepare(
    `UPDATE posts SET title = ?, content = ?, excerpt = ?, published = ?,
     updated_at = datetime('now') WHERE id = ?`
  ).bind(title.trim(), content || '', excerpt || '', published ? 1 : 0, id).run();

  return json({ success: true });
}

// DELETE /api/posts/:id
export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = parseInt(params.id);
  if (!id) return json({ error: 'Geçersiz ID' }, 400);

  await env.DB.prepare(`DELETE FROM posts WHERE id = ?`).bind(id).run();
  return json({ success: true });
}
