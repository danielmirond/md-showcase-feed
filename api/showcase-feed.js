const RSS_URL = 'https://www.mundodeportivo.com/feed/rss/home';
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function cdata(s){return `<![CDATA[${String(s||'').replace(/\]\]>/g,']]]]><![CDATA[>')}]]>`}
function trunc(s,n){s=String(s||'').trim();return s.length>n?s.slice(0,n-1)+'…':s}
function pd(s){const d=new Date(s);return isNaN(d)?new Date():d}
function parseItems(xml){
  const items=[],re=/<item>([\s\S]*?)<\/item>/gi;let m;
  while((m=re.exec(xml))!==null){
    const b=m[1];
    const get=t=>{const cd=b.match(new RegExp(`<${t}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${t}>`,'i'));if(cd)return cd[1].trim();const tx=b.match(new RegExp(`<${t}[^>]*>([^<]*)<\\/${t}>`,'i'));return tx?tx[1].trim():''};
    const ga=(t,a)=>{const r=b.match(new RegExp(`<${t}[^>]+${a}=["']([^"']+)["']`,'i'));return r?r[1].trim():''};
    let image=ga('media:content','url')||ga('media:thumbnail','url')||ga('enclosure','url');
    if(!image){const d=get('description')||get('content:encoded')||'';const im=d.match(/src=["']([^"']+\.(?:jpg|jpeg|webp|png)[^"']*)/i);if(im)image=im[1]}
    const link=get('link')||get('guid'),title=get('title');
    if(!link||!title)continue;
    items.push({guid:link,title:title.replace(/\s+/g,' ').trim(),link,pubDate:pd(get('pubDate')||get('dc:date')),author:(get('dc:creator')||get('author')||'').trim(),category:(get('category')||'').trim(),image});
  }
  return items;
}
function buildFeed(items){
  const panels=items.slice(0,50).map((item,idx)=>{
    const overline=item.category?trunc(item.category,30):'';
    const author=item.author?trunc(item.author.replace(/^Autor\s*/i,''),42):'';
    return `\n  <item>\n    <guid isPermaLink="true">${esc(item.guid)}</guid>\n    <pubDate>${item.pubDate.toUTCString()}</pubDate>\n    <atom:updated>${item.pubDate.toISOString()}</atom:updated>\n    <g:panel type="SINGLE_STORY">Panel ${idx+1}</g:panel>\n    ${overline?`<g:overline>${cdata(overline)}</g:ove
cd ~/Desktop/showcase-clean
git fetch origin
git reset --hard origin/main

cat > api/showcase-feed.js << 'ENDOFFILE'
const RSS_URL = 'https://www.mundodeportivo.com/feed/rss/home';
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function cdata(s){return `<![CDATA[${String(s||'').replace(/\]\]>/g,']]]]><![CDATA[>')}]]>`}
function trunc(s,n){s=String(s||'').trim();return s.length>n?s.slice(0,n-1)+'…':s}
function pd(s){const d=new Date(s);return isNaN(d)?new Date():d}
function parseItems(xml){
  const items=[],re=/<item>([\s\S]*?)<\/item>/gi;let m;
  while((m=re.exec(xml))!==null){
    const b=m[1];
    const get=t=>{const cd=b.match(new RegExp(`<${t}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${t}>`,'i'));if(cd)return cd[1].trim();const tx=b.match(new RegExp(`<${t}[^>]*>([^<]*)<\\/${t}>`,'i'));return tx?tx[1].trim():''};
    const ga=(t,a)=>{const r=b.match(new RegExp(`<${t}[^>]+${a}=["']([^"']+)["']`,'i'));return r?r[1].trim():''};
    let image=ga('media:content','url')||ga('media:thumbnail','url')||ga('enclosure','url');
    if(!image){const d=get('description')||get('content:encoded')||'';const im=d.match(/src=["']([^"']+\.(?:jpg|jpeg|webp|png)[^"']*)/i);if(im)image=im[1]}
    const link=get('link')||get('guid'),title=get('title');
    if(!link||!title)continue;
    items.push({guid:link,title:title.replace(/\s+/g,' ').trim(),link,pubDate:pd(get('pubDate')||get('dc:date')),author:(get('dc:creator')||get('author')||'').trim(),category:(get('category')||'').trim(),image});
  }
  return items;
}
function buildFeed(items){
  const panels=items.slice(0,50).map((item,idx)=>{
    const overline=item.category?trunc(item.category,30):'';
    const author=item.author?trunc(item.author.replace(/^Autor\s*/i,''),42):'';
    return `\n  <item>\n    <guid isPermaLink="true">${esc(item.guid)}</guid>\n    <pubDate>${item.pubDate.toUTCString()}</pubDate>\n    <atom:updated>${item.pubDate.toISOString()}</atom:updated>\n    <g:panel type="SINGLE_STORY">Panel ${idx+1}</g:panel>\n    ${overline?`<g:overline>${cdata(overline)}</g:overline>`:''}\n    <title>${cdata(trunc(item.title,86))}</title>\n    ${author?`<author>${cdata(author)}</author>`:''}\n    <link>${esc(item.link)}</link>\n    ${item.image?`<media:content url="${esc(item.image)}" medium="image"/>`:''}  </item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"\n  xmlns:media="http://search.yahoo.com/mrss/"\n  xmlns:g="http://schemas.google.com/pcn/2020"\n  xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>Mundo Deportivo — Google News Showcase</title>\n    <link>https://www.mundodeportivo.com</link>\n    <description>Noticias deportivas seleccionadas por la redacción de Mundo Deportivo</description>\n    <language>es</language>\n    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n    <atom:link href="https://md-showcase-feed.vercel.app/api/showcase-feed" rel="self" type="application/rss+xml"/>\n${panels.join('\n')}\n  </channel>\n</rss>`;
}
export default async function handler(req,res){
  try{
    const r=await fetch(RSS_URL,{headers:{'User-Agent':'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)','Accept':'application/rss+xml, application/xml, text/xml, */*','Accept-Language':'es-ES,es;q=0.9','Referer':'https://www.mundodeportivo.com/'}});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const xml=await r.text();
    const items=parseItems(xml);
    if(!items.length)throw new Error('Sin artículos');
    res.setHeader('Content-Type','application/rss+xml; charset=UTF-8');
    res.setHeader('Cache-Control','public, max-age=1200, stale-while-revalidate=2400');
    res.setHeader('Access-Control-Allow-Origin','*');
    res.status(200).send(buildFeed(items));
  }catch(err){
    console.error(err.message);
    res.status(500).json({error:err.message});
  }
}
