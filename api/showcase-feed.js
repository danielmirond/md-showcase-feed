export default async function handler(req, res) {
  const RSS_URL = 'https://www.mundodeportivo.com/feed/rss/home';

  try {
    const response = await fetch(RSS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'es-ES,es;q=0.9',
        'Referer': 'https://www.mundodeportivo.com/',
      },
    });

    if (!response.ok) {
      throw new Error(`RSS fetch failed: HTTP ${response.status}`);
    }

    const xml = await response.text();

    res.setHeader('Content-Type', 'application/rss+xml; charset=UTF-8');
    res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=1800');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(xml);

  } catch (err) {
    console.error('Error fetching RSS:', err.message);
    res.status(500).json({ error: err.message });
  }
}
