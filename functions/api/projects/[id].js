function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// PUT /api/projects/:id - projeyi güncelle
export async function onRequestPut(context) {
  const { request, env, params } = context;
  const id = parseInt(params.id);
  if (!id) return json({ error: 'Geçersiz ID' }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Geçersiz JSON' }, 400); }

  const { title, description, url, github_url, tech_stack, featured, order_index } = body;
  if (!title?.trim()) return json({ error: 'Başlık zorunludur' }, 400);

  await env.DB.prepare(
    `UPDATE projects SET title = ?, description = ?, url = ?, github_url = ?,
     tech_stack = ?, featured = ?, order_index = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).bind(
    title.trim(),
    description || '',
    url || '',
    github_url || '',
    JSON.stringify(Array.isArray(tech_stack) ? tech_stack : []),
    featured ? 1 : 0,
    order_index ?? 0,
    id
  ).run();

  return json({ success: true });
}

// DELETE /api/projects/:id
export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = parseInt(params.id);
  if (!id) return json({ error: 'Geçersiz ID' }, 400);

  await env.DB.prepare(`DELETE FROM projects WHERE id = ?`).bind(id).run();
  return json({ success: true });
}
