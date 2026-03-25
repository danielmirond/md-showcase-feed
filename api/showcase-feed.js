const RSS_URL = 'https://www.mundodeportivo.com/feed/rss/home';

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function trunc(s, n) {
  s = String(s || '').trim();
  return s.length > n ? s.slice(0, n - 1) + '...' : s;
}

function cleanText(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseDate(s) {
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}

function makeBullets(description, title, category) {
  const cleanTitle = cleanText(title);
  const cleanDesc = cleanText(description);
  const cleanCat = cleanText(category);

  if (cleanDesc.length > 30) {
    const sentences = cleanDesc.match(/[^.!?]{10,}[.!?]+/g) || [];
    const b1 = trunc(sentences[0] || cleanTitle, 86);
    const b2 = trunc(sentences[1] || cleanTitle, 86);
    const b3 = trunc(sentences[2] || cleanTitle, 86);
    return [b1, b2, b3];
  }

  const words = cleanTitle.split(' ');
  const half = Math.ceil(words.length / 2);
  const b1 = trunc(cleanTitle, 86);
  const b2 = trunc((cleanCat ? cleanCat + ': ' : '') + cleanTitle, 86);
  const b3 = trunc(words.slice(0, half).join(' ') + '...', 86);
  return [b1, b2, b3];
}

function getTag(block, tag) {
  const cd = block.match(new RegExp('<' + tag + '[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/' + tag + '>', 'i'));
  if (cd) return cd[1].trim();
  const tx = block.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
  if (tx) return tx[1].trim();
  return '';
}

function getAttr(block, tag, attr) {
  const r = block.match(new RegExp('<' + tag + '[^>]+' + attr + '=["\']([^"\']+)["\']', 'i'));
  return r ? r[1].trim() : '';
}

function parseItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1];
    let image = getAttr(b, 'media:content', 'url') || getAttr(b, 'media:thumbnail', 'url');
    if (!image) {
      const enc = b.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i) ||
                  b.match(/<enclosure[^>]+type=["']image[^"']*["'][^>]+url=["']([^"']+)["']/i);
      if (enc) image = enc[1];
    }
    const link = getTag(b, 'link') || getTag(b, 'guid');
    const title = getTag(b, 'title');
    if (!link || !title) continue;
    const description = getTag(b, 'description') || getTag(b, 'content:encoded') || '';
    items.push({
      guid: link,
      title: cleanText(title),
      link: link,
      pubDate: parseDate(getTag(b, 'pubDate') || getTag(b, 'dc:date')),
      category: cleanText(getTag(b, 'category')),
      description: description,
      image: image,
    });
  }
  return items;
}

function buildFeed(items) {
  const panels = items.slice(0, 50).map(function(item, idx) {
    const overline = item.category ? trunc(item.category, 30) : '';
    const overlineTag = overline ? '<g:overline>' + esc(overline) + '</g:overline>' : '';
    const imageTag = item.image ? '<media:content url="' + esc(item.image) + '" medium="image"/>' : '';
    const bullets = makeBullets(item.description, item.title, item.category);
    const bulletTags = bullets.map(function(b) {
      return '      <g:list_item>' + esc(b) + '</g:list_item>';
    }).join('\n');
    const bulletList = '    <g:bullet_list>\n' + bulletTags + '\n    </g:bullet_list>';

    return '  <item>\n' +
      '    <guid isPermaLink="true">' + esc(item.guid) + '</guid>\n' +
      '    <pubDate>' + item.pubDate.toUTCString() + '</pubDate>\n' +
      '    <atom:updated>' + item.pubDate.toISOString() + '</atom:updated>\n' +
      '    <g:panel type="SINGLE_STORY">Panel ' + (idx + 1) + '</g:panel>\n' +
      (overlineTag ? '    ' + overlineTag + '\n' : '') +
      '    <title>' + esc(trunc(item.title, 86)) + '</title>\n' +
      '    <link>' + esc(item.link) + '</link>\n' +
      (imageTag ? '    ' + imageTag + '\n' : '') +
      bulletList + '\n' +
      '  </item>';
  });

  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0"\n' +
    '  xmlns:media="http://search.yahoo.com/mrss/"\n' +
    '  xmlns:g="http://schemas.google.com/pcn/2020"\n' +
    '  xmlns:atom="http://www.w3.org/2005/Atom">\n' +
    '  <channel>\n' +
    '    <title>Mundo Deportivo - Google News Showcase</title>\n' +
    '    <link>https://www.mundodeportivo.com</link>\n' +
    '    <description>Noticias deportivas seleccionadas por la redaccion de Mundo Deportivo</description>\n' +
    '    <language>es</language>\n' +
    '    <lastBuildDate>' + new Date().toUTCString() + '</lastBuildDate>\n' +
    '    <atom:link href="https://md-showcase-feed.vercel.app/api/showcase-feed" rel="self" type="application/rss+xml"/>\n' +
    panels.join('\n') + '\n' +
    '  </channel>\n</rss>';
}

export default async function handler(req, res) {
  try {
    const r = await fetch(RSS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'es-ES,es;q=0.9',
        'Referer': 'https://www.mundodeportivo.com/',
      },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const xml = await r.text();
    const items = parseItems(xml);
    if (!items.length) throw new Error('Sin articulos');
    res.setHeader('Content-Type', 'application/rss+xml; charset=UTF-8');
    res.setHeader('Cache-Control', 'public, max-age=1200, stale-while-revalidate=2400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(buildFeed(items));
  } catch (err) {
    console.error('Showcase feed error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
