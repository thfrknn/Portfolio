function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// GET /api/content - tüm içerikleri getir (korumalı)
export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare(`SELECT * FROM site_content`).all();

  const content = {};
  results.forEach(row => { content[row.key] = row.value; });

  return json({ content });
}

// PUT /api/content - içerik güncelle (korumalı)
// Body: { key: "bio", value: "yeni değer" }
// veya birden fazla: { updates: [{ key, value }, ...] }
export async function onRequestPut(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Geçersiz JSON' }, 400); }

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
