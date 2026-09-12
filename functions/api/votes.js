export async function onRequestGet(context) {
  const { env } = context;

  const count = await env.DB.prepare('SELECT COUNT(*) as n FROM votes').first();
  const rows = await env.DB.prepare('SELECT name, created_at FROM votes ORDER BY created_at DESC LIMIT 200').all();

  return Response.json({
    votes: count.n,
    voters: rows.results.map(r => ({ name: r.name, time: r.created_at }))
  });
}