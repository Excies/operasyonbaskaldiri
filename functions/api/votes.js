function badgeFor(rank) {
  const bands = [[10, 'İLK 10'], [20, 'İLK 20'], [50, 'İLK 50'], [100, 'İLK 100'], [500, 'İLK 500'], [1000, 'İLK 1000']];
  for (const [b, label] of bands) {
    if (rank <= b) return { text: label, cls: 'gold' };
  }
  const milestones = [25, 250, 1500, 2000, 2500, 5000, 10000, 25000, 50000];
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