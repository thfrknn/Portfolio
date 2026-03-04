function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// GET /api/messages - tüm mesajları listele
export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare(
    `SELECT * FROM messages ORDER BY created_at DESC`
  ).all();
  return json({ messages: results });
}
