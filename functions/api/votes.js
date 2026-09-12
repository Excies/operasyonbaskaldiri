function badgeFor(rank) {
  if (rank <= 10) return { text: 'İLK 10', cls: 'gold' };
  const milestones = [25, 50, 100, 250, 500, 1000, 2000, 5000];
  if (milestones.includes(rank)) return { text: rank + '. DİRENİŞÇİ', cls: 'milestone' };
  return null;
}

export async function onRequestGet(context) {
  const { env } = context;

  const count = await env.DB.prepare('SELECT COUNT(*) as n FROM votes').first();
  const rows = await env.DB.prepare(`
    SELECT name, created_at,
      ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) as rnk
    FROM votes ORDER BY created_at DESC LIMIT 200
  `).all();

  return Response.json({
    votes: count.n,
    voters: rows.results.map(r => ({
      name: r.name,
      time: r.created_at,
      badge: badgeFor(r.rnk)
    }))
  });
}