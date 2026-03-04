function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// PATCH /api/messages/:id - okundu olarak işaretle
export async function onRequestPatch(context) {
  const { env, params } = context;
  const id = parseInt(params.id);
  if (!id) return json({ error: 'Geçersiz ID' }, 400);

  await env.DB.prepare(`UPDATE messages SET is_read = 1 WHERE id = ?`).bind(id).run();
  return json({ success: true });
}

// DELETE /api/messages/:id - mesajı sil
export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = parseInt(params.id);
  if (!id) return json({ error: 'Geçersiz ID' }, 400);

  await env.DB.prepare(`DELETE FROM messages WHERE id = ?`).bind(id).run();
  return json({ success: true });
}
