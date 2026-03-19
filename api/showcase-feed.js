/**
 * showcase-feed.js — Vercel Serverless Function
 *
 * Feed RSS para Google News Showcase según requisitos oficiales:
 * https://support.google.com/news/publisher-center/answer/10042611
 *
 * Namespace requerido: xmlns:g="http://schemas.google.com/pcn/2020"
 * Tipos de panel: SINGLE_STORY y RUNDOWN (3 artículos)
 */

const RSS_URL = 'https://www.mundodeportivo.com/feed/rss/home';

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function cdata(str) {
  return `<![CDATA[${String(str||'').replace(/\]\]>/g,']]]]><![CDATA[>')}]]>`;
}
function truncate(str, max) {
  const s = String(str||'').trim();
  return s.length > max ? s.slice(0,max-1)+'…' : s;
}
function parseDate(str) {
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date() : d;
}
function toISO(d) { return d.toISOString(); }
function toRFC(d) { return d.toUTCString(); }

function parseItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1];
    const get = (tag) => {
      const cd = b.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i'));
      if (cd) return cd[1].trim();
      const tx = b.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i'));
      return tx ? tx[1].trim() : '';
    };
    const getAttr = (tag, attr) => {
      const r = b.match(new RegExp(`<${tag}[^>]+${attr}=["']([^"']+)["']`, 'i'));
      return r ? r[1].trim() : '';
    };
    let image = getAttr('media:content','url') || getAttr('media:thumbnail','url') || getAttr('enclosure','url');
    if (!image) {
      const desc = get('description') || get('content:encoded') || '';
      const im = desc.match(/src=["']([^"']+\.(?:jpg|jpeg|webp|png)[^"']*)/i);
      if (im) image = im[1];
    }
    const link = get('link') || get('guid');
    const title = get('title');
    if (!link || !title) continue;
    items.push({
      guid: link,
      title: title.replace(/\s+/g,' ').trim(),
      link,
      pubDate: parseDate(get('pubDate') || get('dc:date')),
      author: (get('dc:creator') || get('author') || '').trim(),
      category: (get('category') || '').trim(),
      image,
    });
  }
  return items;
}

function singleStory(item, idx) {
  const overline = item.category ? truncate(item.category, 30) : '';
  return `
  <item>
    <guid isPermaLink="true">${esc(item.guid)}</guid>
    <pubDate>${toRFC(item.pubDate)}</pubDate>
    <atom:updated>${toISO(item.pubDate)}</atom:updated>
    <g:panel type="SINGLE_STORY">Panel ${idx+1}</g:panel>
    ${overline ? `<g:overline>${cdata(overline)}</g:overline>` : ''}
    <title>${cdata(truncate(item.title,86))}</title>
    ${item.author ? `<author>${cdata(truncate(item.author,42))}</author>` : ''}
    <link>${esc(item.link)}</link>
    ${item.image ? `<media:content url="${esc(item.image)}" medium="image"/>` : ''}
  </item>`;
}

function rundown(trio, idx) {
  const gitem = (item) => {
    const overline = item.category ? truncate(item.category,30) : 'Mundo Deportivo';
    return `
      <g:item>
        <guid>${esc(item.guid)}</guid>
        <atom:published>${toISO(item.pubDate)}</atom:published>
        <atom:updated>${toISO(item.pubDate)}</atom:updated>
        <g:overline>${cdata(overline)}</g:overline>
        <title>${cdata(truncate(item.title,64))}</title>
        <link>${esc(item.link)}</link>
        ${item.image ? `<media:content url="${esc(item.image)}" medium="image"/>` : ''}
      </g:item>`;
  };
  return `
  <item>
    <guid isPermaLink="false">urn:rundown:md-${idx}-${trio[0].pubDate.getTime()}</guid>
    <pubDate>${toRFC(trio[0].pubDate)}</pubDate>
    <atom:updated>${toISO(trio[0].pubDate)}</atom:updated>
    <g:panel type="RUNDOWN">Resumen deportivo ${idx+1}</g:panel>
    <g:panel_title>${cdata('Lo más destacado de Mundo Deportivo')}</g:panel_title>
    <title></title>
    <g:article_group role="RUNDOWN">
      ${gitem(trio[0])}
      ${gitem(trio[1])}
      ${gitem(trio[2])}
    </g:article_group>
  </item>`;
}

function buildFeed(items) {
  const panels = [];
  let si = 0, ri = 0, i = 0;

  // Primer panel: RUNDOWN con los 3 artículos más recientes
  if (items.length >= 3) {
    panels.push(rundown(items.slice(0,3), ri++));
    i = 3;
  }
  // Resto: SINGLE_STORY (máx 47 más = 50 total)
  while (i < items.length && panels.length < 50) {
    panels.push(singleStory(items[i], si++));
    i++;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:media="http://search.yahoo.com/mrss/"
  xmlns:g="http://schemas.google.com/pcn/2020"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Mundo Deportivo — Google News Showcase</title>
    <link>https://www.mundodeportivo.com</link>
    <description>Noticias deportivas seleccionadas por la redacción de Mundo Deportivo</description>
    <language>es</language>
    <lastBuildDate>${toRFC(new Date())}</lastBuildDate>
    <atom:link href="https://md-showcase-feed.vercel.app/showcase-feed.xml" rel="self" type="application/rss+xml"/>
${panels.join('\n')}
  </channel>
</rss>`;
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
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const xml = await r.text();
    const items = parseItems(xml);
    if (!items.length) throw new Error('Sin artículos en el RSS fuente');
    res.setHeader('Content-Type','application/rss+xml; charset=UTF-8');
    res.setHeader('Cache-Control','public, max-age=1200, stale-while-revalidate=2400');
    res.setHeader('Access-Control-Allow-Origin','*');
    res.status(200).send(buildFeed(items));
  } catch(err) {
    console.error('Showcase feed error:',err.message);
    res.status(500).json({error:err.message});
  }
}
