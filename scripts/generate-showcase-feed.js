/**
 * generate-showcase-feed.js
 * 
 * Consume los RSS de MundoDeportivo, los fusiona, elimina duplicados
 * y genera un feed XML válido para Google News Showcase.
 * 
 * Requisitos del feed Showcase:
 * - Formato RSS 2.0 o Atom
 * - <title>, <link>, <description>, <pubDate> en cada ítem
 * - <media:content> o <enclosure> para imagen destacada
 * - Máx. 1000 artículos, mín. últimas 48h recomendado
 * - URL del feed registrada en Google Publisher Center
 */

import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import fetch from 'node-fetch';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'public');
const OUTPUT_FILE = join(OUTPUT_DIR, 'showcase-feed.xml');
const LOG_FILE = join(OUTPUT_DIR, 'last-build.json');

// ─────────────────────────────────────────────
// CONFIGURACIÓN — editar aquí las URLs de RSS
// ─────────────────────────────────────────────
const CONFIG = {
  publication: {
    title: 'Mundo Deportivo',
    link: 'https://www.mundodeportivo.com',
    description: 'Diario deportivo digital líder en España',
    language: 'es',
    managingEditor: 'redaccion@mundodeportivo.com',
    copyright: `© ${new Date().getFullYear()} Mundo Deportivo`,
  },

  // Añadir/quitar RSS aquí. El script los fusiona automáticamente.
  // Patrón de URLs: https://www.mundodeportivo.com/feed/rss/{seccion}
  rssFeeds: [
    'https://www.mundodeportivo.com/feed/rss/home',
    // Descomentar y verificar según secciones disponibles en el CMS:
    // 'https://www.mundodeportivo.com/feed/rss/futbol',
    // 'https://www.mundodeportivo.com/feed/rss/fcbarcelona',
    // 'https://www.mundodeportivo.com/feed/rss/real-madrid',
    // 'https://www.mundodeportivo.com/feed/rss/baloncesto',
    // 'https://www.mundodeportivo.com/feed/rss/tenis',
    // 'https://www.mundodeportivo.com/feed/rss/motor',
    // 'https://www.mundodeportivo.com/feed/rss/ciclismo',
  ],

  output: {
    maxItems: 500,          // Google Showcase soporta hasta 1000
    maxAgeHours: 72,        // Filtrar artículos más antiguos de N horas
    filename: 'showcase-feed.xml',
  },

  fetch: {
    timeoutMs: 10000,
    userAgent: 'MundoDeportivo-ShowcaseBot/1.0 (+https://www.mundodeportivo.com)',
  },
};

// ─────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: true,
  allowBooleanAttributes: true,
  parseTagValue: true,
  trimValues: true,
  cdataPropName: '__cdata',
});

function log(level, message, data = null) {
  const entry = { ts: new Date().toISOString(), level, message, ...(data && { data }) };
  console.log(JSON.stringify(entry));
  return entry;
}

function safeText(val) {
  if (!val) return '';
  if (typeof val === 'object' && val.__cdata) return val.__cdata.trim();
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val).trim();
}

function parseDate(val) {
  if (!val) return null;
  const d = new Date(safeText(val));
  return isNaN(d.getTime()) ? null : d;
}

function getImageFromItem(item) {
  // 1. media:content
  const mediaContent = item['media:content'] || item['media:thumbnail'];
  if (mediaContent) {
    const url = mediaContent['@_url'] || (Array.isArray(mediaContent) && mediaContent[0]?.['@_url']);
    if (url) return { url, width: mediaContent['@_width'] || 1200, height: mediaContent['@_height'] || 675 };
  }

  // 2. enclosure
  if (item.enclosure?.['@_url'] && item.enclosure?.['@_type']?.startsWith('image/')) {
    return { url: item.enclosure['@_url'] };
  }

  // 3. og:image dentro de content:encoded
  const content = safeText(item['content:encoded'] || item.description || '');
  const ogMatch = content.match(/src=["']([^"']+\.(jpg|jpeg|webp|png)[^"']*)/i);
  if (ogMatch) return { url: ogMatch[1] };

  return null;
}

function normalizeItem(item, sourceFeed) {
  const link = safeText(item.link || item.guid);
  const title = safeText(item.title);
  const pubDate = parseDate(item.pubDate || item['dc:date'] || item.updated);
  const description = safeText(item.description || item.summary || '');
  const author = safeText(item['dc:creator'] || item.author || '');
  const categories = [item.category]
    .flat()
    .filter(Boolean)
    .map(safeText);

  const image = getImageFromItem(item);

  return {
    guid: link,                     // URL como GUID único
    title,
    link,
    description: description.replace(/<[^>]+>/g, '').slice(0, 300),  // strip HTML, max 300
    pubDate,
    author,
    categories,
    image,
    sourceFeed,
  };
}

// ─────────────────────────────────────────────
// FETCH Y PARSEO DE FEEDS
// ─────────────────────────────────────────────

async function fetchFeed(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.fetch.timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': CONFIG.fetch.userAgent,
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const parsed = parser.parse(xml);

    // Soporte RSS 2.0 y Atom
    const channel = parsed?.rss?.channel || parsed?.feed;
    if (!channel) throw new Error('Formato de feed no reconocido');

    const rawItems = channel.item || channel.entry || [];
    const items = Array.isArray(rawItems) ? rawItems : [rawItems];

    log('info', `✓ Feed OK: ${url}`, { items: items.length });
    return items.map(i => normalizeItem(i, url));

  } catch (err) {
    log('error', `✗ Error fetching ${url}: ${err.message}`);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// ─────────────────────────────────────────────
// GENERACIÓN DEL XML DE SHOWCASE
// ─────────────────────────────────────────────

function buildShowcaseXML(items) {
  const { publication } = CONFIG;
  const buildDate = new Date().toUTCString();

  const rssItems = items.map(item => {
    const el = {
      title: { '#text': item.title },
      link: item.link,
      guid: { '@_isPermaLink': 'true', '#text': item.guid },
      description: { '#text': item.description },
      pubDate: item.pubDate.toUTCString(),
    };

    if (item.author) el['dc:creator'] = item.author;

    if (item.categories.length > 0) {
      el.category = item.categories;
    }

    // Imagen como media:content (requerido para cards ricas en Showcase)
    if (item.image?.url) {
      el['media:content'] = {
        '@_url': item.image.url,
        '@_medium': 'image',
        ...(item.image.width && { '@_width': item.image.width }),
        ...(item.image.height && { '@_height': item.image.height }),
      };
    }

    return { item: el };
  });

  const feed = {
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
    rss: {
      '@_version': '2.0',
      '@_xmlns:dc': 'http://purl.org/dc/elements/1.1/',
      '@_xmlns:media': 'http://search.yahoo.com/mrss/',
      '@_xmlns:atom': 'http://www.w3.org/2005/Atom',
      channel: {
        title: publication.title,
        link: publication.link,
        description: publication.description,
        language: publication.language,
        copyright: publication.copyright,
        managingEditor: publication.managingEditor,
        lastBuildDate: buildDate,
        'atom:link': {
          '@_href': `${publication.link}/showcase-feed.xml`,
          '@_rel': 'self',
          '@_type': 'application/rss+xml',
        },
        ...Object.fromEntries(rssItems.flatMap((obj, i) => [[`item_${i}`, obj.item]])),
      },
    },
  };

  // XMLBuilder con configuración para output limpio
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
    indentBy: '  ',
    suppressEmptyNode: true,
    cdataPropName: '__cdata',
  });

  // Build manual para control total del XML
  return buildXMLManual(items, publication, buildDate);
}

function buildXMLManual(items, pub, buildDate) {
  const esc = s => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const itemsXML = items.map(item => {
    const image = item.image?.url
      ? `    <media:content url="${esc(item.image.url)}" medium="image"${item.image.width ? ` width="${item.image.width}"` : ''}${item.image.height ? ` height="${item.image.height}"` : ''}/>`
      : '';

    const categories = item.categories
      .map(c => `    <category><![CDATA[${c}]]></category>`)
      .join('\n');

    const author = item.author
      ? `    <dc:creator><![CDATA[${item.author}]]></dc:creator>`
      : '';

    return `  <item>
    <title><![CDATA[${item.title}]]></title>
    <link>${esc(item.link)}</link>
    <guid isPermaLink="true">${esc(item.guid)}</guid>
    <description><![CDATA[${item.description}]]></description>
    <pubDate>${item.pubDate.toUTCString()}</pubDate>
${author}
${categories}
${image}
  </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:media="http://search.yahoo.com/mrss/"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(pub.title)}</title>
    <link>${esc(pub.link)}</link>
    <description>${esc(pub.description)}</description>
    <language>${pub.language}</language>
    <copyright>${esc(pub.copyright)}</copyright>
    <managingEditor>${esc(pub.managingEditor)}</managingEditor>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <atom:link href="${pub.link}/showcase-feed.xml" rel="self" type="application/rss+xml"/>

${itemsXML}
  </channel>
</rss>`;
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  const logs = [];

  logs.push(log('info', '🚀 Iniciando generación del feed Showcase', {
    feeds: CONFIG.rssFeeds.length,
    maxItems: CONFIG.output.maxItems,
  }));

  // 1. Fetch en paralelo de todos los RSS
  const results = await Promise.allSettled(
    CONFIG.rssFeeds.map(url => fetchFeed(url))
  );

  const allItems = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  logs.push(log('info', `Total artículos brutos: ${allItems.length}`));

  // 2. Deduplicar por URL (guid)
  const seen = new Set();
  const unique = allItems.filter(item => {
    if (!item.link || !item.title || !item.pubDate) return false;
    if (seen.has(item.guid)) return false;
    seen.add(item.guid);
    return true;
  });
  logs.push(log('info', `Después de deduplicar: ${unique.length}`));

  // 3. Filtrar por antigüedad
  const cutoff = new Date(Date.now() - CONFIG.output.maxAgeHours * 3600 * 1000);
  const recent = unique.filter(item => item.pubDate > cutoff);
  logs.push(log('info', `Dentro de ${CONFIG.output.maxAgeHours}h: ${recent.length}`));

  // 4. Ordenar por fecha desc y limitar
  const sorted = recent
    .sort((a, b) => b.pubDate - a.pubDate)
    .slice(0, CONFIG.output.maxItems);

  logs.push(log('info', `Artículos en el feed final: ${sorted.length}`));

  if (sorted.length === 0) {
    logs.push(log('warn', '⚠️ No hay artículos para incluir en el feed'));
  }

  // 5. Generar XML
  const xml = buildShowcaseXML(sorted);

  // 6. Escribir archivos
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, xml, 'utf8');

  const buildInfo = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    feedsProcessed: CONFIG.rssFeeds.length,
    itemsRaw: allItems.length,
    itemsAfterDedup: unique.length,
    itemsAfterFilter: recent.length,
    itemsInFeed: sorted.length,
    oldestItem: sorted.at(-1)?.pubDate?.toISOString() || null,
    newestItem: sorted[0]?.pubDate?.toISOString() || null,
  };

  writeFileSync(LOG_FILE, JSON.stringify(buildInfo, null, 2), 'utf8');

  logs.push(log('info', '✅ Feed generado correctamente', buildInfo));
  console.log('\n📄 Output:', OUTPUT_FILE);
  console.log('📊 Build info:', JSON.stringify(buildInfo, null, 2));
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
