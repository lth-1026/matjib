export default async function handler(req, res) {
  const setCors = (res) => {
    res.setHeader('Access-Control-Allow-Credentials', true)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
    res.setHeader(
      'Access-Control-Allow-Headers',
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    )
  }

  if (req.method === 'OPTIONS') {
    setCors(res)
    res.status(200).end()
    return
  }

  if (req.method === 'GET') {
    setCors(res)
    const { id } = req.query; // automatic query parsing
    const parsedId = parseInt(id) || 1;
    const accessKey = process.env.UNSPLASH_ACCESS_KEY;

    if (!accessKey) {
      return res.status(500).json({ error: "Unsplash API Key not configured" });
    }

    const query = "apartment interior living room bedroom home";
    const unsplashUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=50&page=1&orientation=landscape&content_filter=high&order_by=relevant&client_id=${accessKey}`;

    try {
      const fetchRes = await fetch(unsplashUrl);
      if (!fetchRes.ok) {
        return res.status(200).json([]); // Fallback empty
      }

      const data = await fetchRes.json();
      const results = data.results || [];

      // Filtering logic
      const ngWords = ['3d', 'render', 'rendering', 'illustration', 'cartoon', 'isometric', 'minimalist illustration', 'abstract', 'graphic'];
      const ceilingNgWords = ['ceiling', 'corner', 'wall texture', 'close up', 'door frame'];
      const mustWords = ['interior', 'apartment', 'living room', 'bedroom', 'room', 'sofa', 'couch', 'home', 'apartment interior'];

      const good = results.filter(photo => {
        if (!photo.urls || !photo.urls.small) return false;

        const texts = [
          photo.description,
          photo.alt_description,
          ...(photo.tags || []).map(t => t.title)
        ].filter(Boolean).map(t => t.toLowerCase());

        if (texts.length === 0) return false;

        const hasNg = ngWords.some(ng => texts.some(t => t.includes(ng)));
        if (hasNg) return false;

        const hasCeilingNg = ceilingNgWords.some(ng => texts.some(t => t.includes(ng)));
        if (hasCeilingNg) return false;

        const hasMust = mustWords.some(mw => texts.some(t => t.includes(mw)));
        if (!hasMust) return false;

        return true;
      });

      const pool = good.length > 0 ? good : results;
      if (pool.length === 0) {
        return res.status(200).json([]);
      }

      // Seeded random selection
      const chosen = [];
      const seed = parsedId * 7919;
      const n = pool.length;

      for (let i = 0; i < 3; i++) {
        const idx = (seed + i) % n;
        chosen.push(pool[idx].urls.small);
      }

      return res.status(200).json(chosen);

    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  setCors(res)
  return res.status(405).send("Method Not Allowed");
}
