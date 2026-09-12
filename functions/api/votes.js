function badgeFor(rank) {
  if (rank <= 10) return { text: 'İLK 10', cls: 'gold' };
  if (rank <= 20) return { text: 'İLK 20', cls: 'silver' };
  if (rank <= 50) return { text: 'İLK 50', cls: 'bronze' };
  if (rank <= 100) return { text: 'İLK 100', cls: 'steel' };
  if (rank <= 500) return { text: 'İLK 500', cls: 'royal' };
  if (rank <= 1000) return { text: 'İLK 1000', cls: 'crimson' };
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