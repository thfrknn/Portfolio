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
    return json({ error: 'Geçersiz JSON' }, 400);
  }

  const { name, email, subject, message } = body;

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return json({ error: 'Ad, e-posta ve mesaj alanları zorunludur' }, 400);
  }

  // Basit e-posta format kontrolü
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Geçerli bir e-posta adresi girin' }, 400);
  }

  // Mesajı D1'e kaydet
  await env.DB.prepare(
    `INSERT INTO messages (name, email, subject, message) VALUES (?, ?, ?, ?)`
  ).bind(
    name.trim().slice(0, 100),
    email.trim().slice(0, 100),
    (subject || '').trim().slice(0, 200),
    message.trim().slice(0, 5000)
  ).run();

  return json({ success: true, message: 'Mesajınız iletildi!' });
}
