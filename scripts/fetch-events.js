const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dataPath = path.join(root, 'data.json');
const previous = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const year = Number(today.slice(0, 4));
const month = Number(today.slice(5, 7));
const months = [{ y: year, m: month }, month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 }];
const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const strip = s => (s || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&times;/g, '×').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
const time = (s, key) => { const m = new RegExp(`(?:${key})\\D{0,4}(\\d{1,2})[:：](\\d{2})|(\\d{1,2})[:：](\\d{2})\\s*(?:${key})`, 'i').exec(s || ''); return m ? `${Number(m[1] || m[3])}:${m[2] || m[4]}` : '公式で確認'; };
const price = s => (/(?:[¥￥]\s?[\d,]{3,}|[\d,]{3,}\s?円)/.exec(s || '') || ['公式で確認'])[0].replace(/\s/g, '');
const absolute = (u, base) => { try { return new URL(u, base).href; } catch { return u; } };

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 jazz-near-tsunashima/1.0', accept: 'text/html' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function reserve(html, ctx, origin) {
  const out = []; const re = /<a[^>]+href=["']([^"']*\/reserve\/schedule\/exec\/\d+)["'][^>]*>[\s\S]*?(?=<a[^>]+href=["'][^"']*\/reserve\/schedule\/exec\/\d+["']|$)/gi; let m;
  while ((m = re.exec(html))) {
    const text = strip(m[0]); const dm = new RegExp(`${ctx.y}\\s*[./年 ]\\s*${ctx.m}\\s*[./月 ]\\s*(\\d{1,2})`).exec(text) || new RegExp(`${ctx.m}[./月](\\d{1,2})`).exec(text); if (!dm) continue;
    let open = time(text, 'open|開場'), start = time(text, 'start|開演');
    const to24 = t => { const x = /^(\d{1,2}):(\d{2})$/.exec(t); if (!x) return t; let h = +x[1]; if (h < 12) h += 12; return `${h}:${x[2]}`; };
    const day = Number(dm[1]);
    const title = text.replace(/^.*?<\/a>/, '').replace(/Music charge[\s\S]*$/i, '').trim() || text.split(/Music charge/i)[0].trim();
    out.push({ date: iso(ctx.y, ctx.m, day), open: to24(open), start: to24(start), artist: title.slice(0, 200), price: price(text), image: null, media: [], source: absolute(m[1], origin) });
  }
  return out;
}

const sources = {
  dolphy: (y,m) => [m === month ? 'https://dolphy-jazzspot.com/live_schedule.html' : `https://dolphy-jazzspot.com/live_schedule${y}_${m}.html`],
  bluenote: (y,m) => [`https://reserve.bluenote.co.jp/reserve/schedule/move/${y}${pad(m)}/`],
  cottonclub: (y,m) => [`https://reserve.cottonclubjapan.co.jp/reserve/schedule/move/${y}${pad(m)}/`],
  kingsbar: (y,m) => [`https://livebar.net/kingsbar/schedule?year=${y}&month=${m}`],
  swing: (y,m) => [`https://ginzaswing.jp/schedules/?month=${y}-${pad(m)}`],
  first: (y,m) => [`https://naniaru.com/events/schedule?ba=off&be=off&bp=off&month=${m}&period=0&pid=1000002305&year=${y}`],
};

function parse(id, html, ctx) {
  if (id === 'bluenote') return reserve(html, ctx, 'https://reserve.bluenote.co.jp');
  if (id === 'cottonclub') return reserve(html, ctx, 'https://reserve.cottonclubjapan.co.jp');
  if (id === 'dolphy') {
    const out = [];
    for (const row of html.split(/<tr[^>]*>/i).slice(1)) { const text = strip(row), dm = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*[（(]/.exec(text); if (!dm) continue; const artist = text.replace(/^.*?[）)]/, '').replace(/\d{1,2}[:：]\d{2}\s*(?:open|start)/gi, ' ').replace(/(?:前|当|チャージ).*$/, '').trim(); if (artist && !/^(休演|休み|CLOSE)/.test(artist)) out.push({ date: iso(ctx.y,+dm[1],+dm[2]), open:time(text,'open|開場'), start:time(text,'start|開演'), artist:artist.slice(0,200), price:price(text), image:null, media:[], source:ctx.url }); }
    return out;
  }
  if (id === 'barbarbar') {
    const out=[]; for(const cell of html.split(/<td[^>]*>/i).slice(1)){const dm=/^\s*(?:<[^>]+>\s*)*(\d{1,2})\b/.exec(cell);if(!dm)continue;const text=strip(cell.replace(/^\s*(?:<[^>]+>\s*)*\d{1,2}/,''));if(text)out.push({date:iso(ctx.y,ctx.m,+dm[1]),open:time(text,'open|開場'),start:time(text,'start|開演'),artist:text.slice(0,180),price:price(text),image:null,media:[],source:ctx.url});} return out;
  }
  if (id === 'kingsbar') {
    const out=[]; const re=/<a[^>]+href=["']([^"']*\/events\/\d+)["'][^>]*>([\s\S]{0,700}?)<\/a>/gi;let m;while((m=re.exec(html))){const text=strip(m[2]),dm=/(\d{1,2})[\/月](\d{1,2})/.exec(text);if(dm)out.push({date:iso(ctx.y,+dm[1],+dm[2]),open:time(text,'open|開場'),start:time(text,'start|開演'),artist:text.replace(/\d{1,2}[\/月]\d{1,2}日?/,'').slice(0,180),price:price(text),image:null,media:[],source:absolute(m[1],'https://livebar.net')});}return out;
  }
  if (id === 'swing') {
    const out=[];const re=/<h2[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]{0,3000}?(\d{4})\/(\d{2})\/(\d{2})([\s\S]{0,3000}?)(?=<h2|$)/gi;let m;while((m=re.exec(html))){const artist=strip(m[2]);if(artist&&!/スケジュール表|お知らせ/.test(artist))out.push({date:`${m[3]}-${m[4]}-${m[5]}`,open:time(strip(m[6]),'open|開場'),start:time(strip(m[6]),'start|開演|1st'),artist:artist.slice(0,200),price:price(strip(m[6])),image:null,media:[],source:absolute(m[1],'https://ginzaswing.jp')});}return out;
  }
  if (id === 'first') {
    const out=[]; const names={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
    for(const row of html.split(/<tr[^>]*>/i).slice(1)){
      const text=strip(row), dm=/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{4})\b/.exec(text); if(!dm||names[dm[1]]!==ctx.m)continue;
      const link=/<a[^>]+href=["']([^"']*\/events\/view\/\d+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(row); if(!link)continue;
      const artist=strip(link[2]); if(!artist)continue;
      out.push({date:iso(+dm[3],ctx.m,+dm[2]),open:time(text,'open|開場'),start:time(text,'start|開演'),artist:artist.slice(0,200),price:price(text),image:null,media:[],source:absolute(link[1],'https://naniaru.com')});
    } return out;
  }
  return [];
}

(async () => {
  const fresh = new Map(), reports = [];
  for (const [venueId, urls] of Object.entries(sources)) {
    const rows=[]; let failures=0;
    for (const ctx of months) for (const url of urls(ctx.y,ctx.m)) try { const html=await get(url); rows.push(...parse(venueId,html,{...ctx,url})); } catch(e) { failures++; console.error(venueId,url,e.message); }
    const clean=[...new Map(rows.filter(e=>e.date>=today&&e.artist).map(e=>[`${e.date}|${e.artist}`,e])).values()];
    let changed = false;
    const replacement = previous.events.filter(e => e.venueId === venueId && e.date >= today);
    for (const ctx of months) {
      const ym = `${ctx.y}-${pad(ctx.m)}`;
      const incoming = clean.filter(e => e.date.startsWith(ym));
      const existing = replacement.filter(e => e.date.startsWith(ym));
      const plausible = incoming.length > 0 && (existing.length === 0 || incoming.length >= Math.ceil(existing.length * 0.8));
      if (plausible) {
        for (let i = replacement.length - 1; i >= 0; i--) if (replacement[i].date.startsWith(ym)) replacement.splice(i, 1);
        replacement.push(...incoming); changed = true;
      }
      reports.push({venueId,month:ym,status:plausible ? (failures ? 'partial' : 'ok') : (incoming.length ? 'rejected' : 'empty'),count:incoming.length,kept:existing.length});
    }
    if (changed) fresh.set(venueId,replacement);
  }
  const untouched = previous.events.filter(e => !fresh.has(e.venueId) && e.date >= today);
  const events = [...untouched, ...[...fresh.entries()].flatMap(([venueId, rows]) => rows.map(e => ({venueId,...e})))].sort((a,b)=>a.date.localeCompare(b.date)||a.venueId.localeCompare(b.venueId));
  fs.writeFileSync(dataPath, JSON.stringify({...previous,updatedAt:fresh.size ? new Date().toISOString() : previous.updatedAt,events,crawlReports:reports},null,2)+'\n');
  console.log(`saved ${events.length} events`);
})().catch(e=>{console.error(e);process.exit(1)});
