const RSS_URL = 'https://www.mundodeportivo.com/feed/rss/home';

const ALLOWED_SECTIONS = [
  '/actualidad/',
  '/elotromundo/',
  '/pulso/',
  '/tressesenta/',
  '/foodie/',
  '/futbol/fc-barcelona/',
  '/futbol/real-madrid/',
  '/tenis/',
];

const MAX_ITEMS = 50;
const BULLET_MAX = 118;
const TITLE_MAX = 70;

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safeTrunc(s, n) {
  s = String(s || '').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 3);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + '...';
}

function truncTitle(s, n) {
  s = String(s || '').trim();
  if (esc(s).length <= n) return s;

  // Presupuesto real en chars crudos: cada " cuenta 6 escapado, 1 crudo.
  // Iterar reduciendo hasta que esc(candidate).length <= n
  for (let budget = n; budget >= 20; budget--) {
    let cut = s.slice(0, budget);
    const colonIdx = cut.lastIndexOf(':');
    const commaIdx = cut.lastIndexOf(',');
    const spaceIdx = cut.lastIndexOf(' ');
    let cutIdx = spaceIdx;
    if (colonIdx > budget * 0.5) cutIdx = colonIdx;
    else if (commaIdx > budget * 0.5) cutIdx = commaIdx;
    if (cutIdx < 15) continue;
    cut = s.slice(0, cutIdx).replace(/[,;:\s"']+$/, '').trim();
    // Balancear comillas: si quedan impares, descartar esta opción y acortar más
    const dq = (cut.match(/"/g) || []).length;
    if (dq % 2 !== 0) continue;
    if (esc(cut).length <= n) return cut;
  }
  // Fallback duro: recortar a ojo y quitar comillas abiertas
  return s.slice(0, Math.min(n, 50)).replace(/"/g, '').trim();
}

function cleanText(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/wf_cms\.rss\.read_more/gi, '')
    .replace(/read_more/gi, '')
    .replace(/\bLeer más\b/gi, '')
    .replace(/\bRead more\b/gi, '')
    .replace(/\s+/g, ' ').trim();
}

function parseDate(s) {
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}

function getSectionLabel(url) {
  if (url.includes('/futbol/fc-barcelona/')) return 'FC Barcelona';
  if (url.includes('/futbol/real-madrid/')) return 'Real Madrid';
  if (url.includes('/actualidad/')) return 'Actualidad';
  if (url.includes('/elotromundo/')) return 'El Otro Mundo';
  if (url.includes('/pulso/')) return 'Pulso';
  if (url.includes('/tressesenta/')) return 'Tres Sesenta';
  if (url.includes('/foodie/')) return 'Foodie';
  if (url.includes('/tenis/')) return 'Tenis';
  return '';
}

function fallbackBullets(category) {
  if (!category) {
    return [
      'Mundo Deportivo ofrece la última hora y análisis de la actualidad deportiva.',
      'Consulta la cobertura completa con crónicas, reportajes y opinión de nuestros redactores.',
    ];
  }
  return [
    'Sigue toda la actualidad de ' + category + ' con la cobertura de Mundo Deportivo.',
    'Crónicas, análisis y reacciones firmadas por nuestros redactores especializados.',
  ];
}

function escLen(s) { return esc(s).length; }

function fitBullet(s, n) {
  if (escLen(s) <= n) return s;
  // Truncar en límite logico: ; , luego espacio — siempre dentro de n-1 para dejar sitio al punto
  const cut = s.slice(0, n - 1);
  const semi = cut.lastIndexOf(';');
  const comma = cut.lastIndexOf(',');
  const space = cut.lastIndexOf(' ');
  let idx = space;
  if (semi > n * 0.5) idx = semi;
  else if (comma > n * 0.5) idx = comma;
  if (idx < 30) return null; // no hay punto de corte razonable
  let out = s.slice(0, idx).replace(/[,;:\s]+$/, '').trim();
  // Terminar con punto si no hay puntuación final
  if (!/[.!?]$/.test(out)) out += '.';
  return escLen(out) <= n ? out : fitBullet(out, n - 5);
}

function extractSentences(text) {
  const parts = text.split(/(?<=[.!?])\s+/);
  const sentences = [];
  for (var i = 0; i < parts.length; i++) {
    const s = parts[i].trim();
    if (s.length < 25) continue;
    if (s === s.toUpperCase()) continue;
    const dq = (s.match(/"/g) || []).length;
    if (dq % 2 !== 0) continue;
    if (escLen(s) <= BULLET_MAX) {
      sentences.push(s);
    } else {
      const fit = fitBullet(s, BULLET_MAX);
      if (fit) sentences.push(fit);
    }
  }
  return sentences;
}

function makeBullets(description, title, category) {
  const cleanCat = category || '';
  const text = cleanText(description);

  const seen = new Set();
  seen.add(cleanText(title).toLowerCase().slice(0, 25));

  const unique = [];

  if (text.length > 10) {
    const sentences = extractSentences(text);
    for (var i = 0; i < sentences.length; i++) {
      const s = sentences[i];
      if (s.length < 25) continue;
      // Descartar frases en mayusculas (artefactos del CMS)
      if (s === s.toUpperCase()) continue;
      const key = s.toLowerCase().slice(0, 25);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(s);
      }
      if (unique.length === 3) break;
    }
  }

  if (unique.length >= 2) return unique;

  // Garantizar minimo 2 bullets (requisito Google News Showcase)
  const fb = fallbackBullets(cleanCat);
  while (unique.length < 2) {
    const next = fb.shift();
    if (!next) break;
    const key = next.toLowerCase().slice(0, 25);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(next);
  }
  return unique;
}

function parseItems(xml) {
  const items = [];
  const normalized = xml.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;

  while ((m = itemRe.exec(normalized)) !== null) {
    const block = m[1];

    const getVal = function(tag) {
      const cdRe = new RegExp('<' + tag + '[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/' + tag + '>', 'i');
      const cd = block.match(cdRe);
      if (cd) return cd[1].trim();
      const txRe = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i');
      const tx = block.match(txRe);
      if (tx) return tx[1].trim();
      return '';
    };

    const getAttrVal = function(tag, attr) {
      const r = block.match(new RegExp('<' + tag + '[^>]+' + attr + '=["\']([^"\']+)["\']', 'i'));
      return r ? r[1].trim() : '';
    };

    const link = getVal('link') || getVal('guid');
    const title = getVal('title');
    if (!link || !title) continue;

    const inSection = ALLOWED_SECTIONS.some(function(s) { return link.includes(s); });
    if (!inSection) continue;

    let image = getAttrVal('media:content', 'url') || getAttrVal('media:thumbnail', 'url');
    if (!image) {
      const enc = block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i) ||
                  block.match(/<enclosure[^>]+type=["']image[^"']*["'][^>]+url=["']([^"']+)["']/i);
      if (enc) image = enc[1];
    }

    // Preferir content:encoded (cuerpo más largo) sobre description
    const description = getVal('content:encoded') || getVal('description') || '';

    items.push({
      guid: link,
      title: cleanText(title),
      link: link,
      pubDate: parseDate(getVal('pubDate') || getVal('dc:date')),
      category: getSectionLabel(link),
      description: description,
      image: image,
    });

    if (items.length >= MAX_ITEMS) break;
  }

  return items;
}

function buildFeed(items) {
  const panels = items.map(function(item, idx) {
    const overline = item.category ? item.category.slice(0, 30) : '';
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
      '    <title>' + esc(truncTitle(item.title, TITLE_MAX)) + '</title>\n' +
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
    res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=1800');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(buildFeed(items));
  } catch (err) {
    console.error('Showcase feed error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
