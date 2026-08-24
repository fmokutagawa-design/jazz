const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dataPath = path.join(root, 'data.json');
const naruImageDir = path.join(root, 'assets', 'naru');
const previous = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const year = Number(today.slice(0, 4));
const month = Number(today.slice(5, 7));
const months = [{ y: year, m: month }, month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 }];
const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const strip = s => (s || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&yen;/gi, '¥').replace(/&quot;/g, '"').replace(/&times;/g, '×').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
const time = (s, key) => { const m = new RegExp(`(?:${key})\\D{0,4}(\\d{1,2})[:：](\\d{2})|(\\d{1,2})[:：](\\d{2})\\D{0,4}(?:${key})`, 'i').exec(s || ''); return m ? `${Number(m[1] || m[3])}:${m[2] || m[4]}` : '公式で確認'; };
const afterTime = (s, key) => { const m = new RegExp(`(?:${key})\\D{0,8}(\\d{1,2})[:：](\\d{2})`, 'i').exec(s || ''); return m ? `${Number(m[1])}:${m[2]}` : '公式で確認'; };
const price = s => (/(?:[¥￥]\s?[\d,]{3,}|[\d,]{3,}\s?円)/.exec(s || '') || ['公式で確認'])[0].replace(/\s/g, '');
const absolute = (u, base) => { try { return new URL(u, base).href; } catch { return u; } };
const pageImage = (html, base) => {
  const matches = [...String(html || '').matchAll(/<img[^>]+(?:data-lazy|data-src|src)=[^A-Za-z0-9]([^ >]+)/gi)];
  const urls = matches.map(m => absolute(m[1].replace(/[\"']/g, ''), base));
  return urls.find(u => !/(logo|icon|spinner|loading|calendar|common|header|footer|pickup|special|banner|undefined|svg)/i.test(u)) || null;
};
const detailImage = (html, base) => {
  const decoded = String(html || '').replace(/\\\//g, '/');
  const eventPath = /(?:https?:\/\/[^"' ]+)?\/public\/event_img\/[^"' ]+\.(?:jpe?g|png|webp)/i.exec(decoded)?.[0];
  if (eventPath) return absolute(eventPath, base);
  const a = /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)/i.exec(html)?.[1];
  const b = /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i.exec(html)?.[1];
  const meta = a || b;
  return meta && !/(undefined|null|common\/og-image)/i.test(meta) ? absolute(meta, base) : pageImage(html, base);
};
const youtubeMedia = html => {
  const id = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/i.exec(String(html || ''))?.[1];
  return id ? [{type:'youtube',url:`https://www.youtube.com/watch?v=${id}`}] : [];
};

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 jazz-near-tsunashima/1.0', accept: 'text/html' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const head = new TextDecoder('latin1').decode(buf.slice(0, 4096));
  const charset = /charset=["']?([\w-]+)/i.exec(head)?.[1] || res.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] || 'utf-8';
  const encoding = /shift[_-]?jis|sjis|windows-31j/i.test(charset) ? 'shift_jis' : /euc-?jp/i.test(charset) ? 'euc-jp' : 'utf-8';
  return new TextDecoder(encoding).decode(buf);
}

async function cacheNaruImages(rows) {
  fs.mkdirSync(naruImageDir, {recursive:true});
  for (const event of rows) {
    if (!event.image || !/^http:\/\/ocha-naru\.com\//i.test(event.image)) continue;
    const fullUrl = event.image.replace(/\/s_([^/]+)$/i, '/$1');
    const rawName = new URL(fullUrl).pathname.split('/').pop() || `${event.date}.jpg`;
    const fileName = rawName.replace(/[^A-Za-z0-9._-]/g, '_'), target = path.join(naruImageDir, fileName);
    try {
      const res = await fetch(fullUrl, {headers:{'user-agent':'Mozilla/5.0 jazz-live-guide/1.0'},signal:AbortSignal.timeout(20000)});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf=Buffer.from(await res.arrayBuffer());
      let width=0,height=0;
      for(let i=2;i<buf.length-9;){if(buf[i]!==0xff){i++;continue;}const marker=buf[i+1],len=buf.readUInt16BE(i+2);if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){height=buf.readUInt16BE(i+5);width=buf.readUInt16BE(i+7);break;}i+=2+len;}
      if(Math.max(width,height)<300)throw new Error(`small ${width}x${height}`);
      fs.writeFileSync(target,buf); event.image=`assets/naru/${fileName}`;
    } catch (e) { event.image=null; console.error('naru full image', fullUrl, e.message); }
  }
  return rows;
}

async function enrichSwing(rows) {
  const enriched = [];
  for (let i = 0; i < rows.length; i += 5) {
    const batch = rows.slice(i, i + 5);
    const results = await Promise.all(batch.map(async event => {
      try {
        const html = await get(event.source), text = strip(html);
        const open = time(text, 'open|開場|開店');
        const start = time(text, 'start|開演|1st');
        const secondStart = time(text, '2nd');
        return {...event,
          open: open !== '公式で確認' ? open : event.open,
          start: start !== '公式で確認' ? start : event.start,
          secondStart: secondStart !== '公式で確認' ? secondStart : undefined,
          price: price(text),
          image: detailImage(html, event.source) || event.image,
          media: youtubeMedia(html)
        };
      } catch (e) {
        console.error('swing detail', event.source, e.message);
        return event;
      }
    }));
    enriched.push(...results);
  }
  return enriched;
}

async function enrichWonderwall(rows) {
  const enriched=[];
  for(let i=0;i<rows.length;i+=5){
    const results=await Promise.all(rows.slice(i,i+5).map(async event=>{
      try{
        const html=await get(event.source);
        const detail=/<div class=["']normalText["']>([\s\S]*?)<\/div>/i.exec(html)?.[1]||html;
        const text=strip(detail), slot=k=>{const m=new RegExp(`\\b${k}(?:\\s*SET)?\\D{0,5}(\\d{1,2})[:：](\\d{2})`,'i').exec(text);return m?`${Number(m[1])}:${m[2]}`:'公式で確認';}, first=slot('1st'), second=slot('2nd');
        const lineup=strip(detail.split(/\bOPEN\b|\b1st\b|\bSTART\b|開場|開演/i)[0]).slice(0,240);
        const notices=[...detail.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(m=>strip(m[1])).filter(Boolean).join(' ');
        const reservation=/<p[^>]+class=["']rsrvBtn["'][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)/i.exec(html)?.[1]?.replace(/&#038;/g,'&')||null;
        const eventImage=/<div[^>]+class=["'][^"']*(?:slider|mainVisual)[^"']*["'][\s\S]*?<img[^>]+(?:data-lazy|data-src|src)=["']([^"']+)/i.exec(html)?.[1]||null;
        return {...event,open:time(text,'open|開場'),start:first,secondStart:second!=='公式で確認'?second:undefined,lineup:lineup||undefined,note:notices||undefined,price:price(text),image:eventImage?absolute(eventImage,event.source):(detailImage(html,event.source)||event.image),media:youtubeMedia(html),reservationUrl:reservation,detailUrl:event.source,reservationStatus:reservation?'web':'check'};
      }catch(e){console.error('wonderwall detail',event.source,e.message);return event;}
    }));
    enriched.push(...results);
  }
  return enriched;
}

function reserve(html, ctx, origin) {
  const out=[]; const re=/<table class=["']later["']>([\s\S]*?)(?=<table class=["']later["']>|$)/gi; let m;
  const to24=t=>{const x=/^(\d{1,2}):(\d{2})$/.exec(t);if(!x)return t;let h=+x[1];if(h<12)h+=12;return `${h}:${x[2]}`;};
  while((m=re.exec(html))){
    const block=m[1], text=strip(block);
    const title=strip(/<span class=["']title["']>([\s\S]*?)<\/span>/i.exec(block)?.[1]||'');
    const reservationPath=/<a[^>]+href=["']([^"']*\/reserve\/schedule\/exec\/\d+)["']/i.exec(block)?.[1]||null;
    const detailPath=/<a[^>]+href=["']([^"']*\/jp\/(?:sp\/)?artists\/[^"']+)["']/i.exec(block)?.[1]||null;
    if(!title||(!reservationPath&&!detailPath))continue;
    const reservationUrl=reservationPath?absolute(reservationPath,origin):null;
    const detailUrl=detailPath?absolute(detailPath,origin):null;
    const days=[...block.matchAll(/<span class=["']day["']>\s*(\d{1,2})\s*<\/span>/gi)].map(x=>+x[1]);
    const open=to24(time(text,'open|開場')), start=to24(time(text,'start|開演'));
    const img=/<img[^>]+src=["']([^"']*\/web_mainte\/img\/event\/[^"']+)["']/i.exec(block)?.[1]||null;
    for(const day of days)out.push({date:iso(ctx.y,ctx.m,day),open,start,artist:title.slice(0,200),price:price(text),image:img?absolute(img,origin):null,media:[],source:reservationUrl||detailUrl,reservationUrl,detailUrl,reservationStatus:reservationUrl?'web':'check'});
  }
  return out;
}

// Monthly sources are processed independently so one missing month never removes the other.
// Billboard Live YOKOHAMA is parsed from its server-rendered schedule payload.
const sources = {
  dolphy: (y,m) => [m === month ? 'https://dolphy-jazzspot.com/live_schedule.html' : `https://dolphy-jazzspot.com/live_schedule${y}_${m}.html`],
  bluenote: (y,m) => [`https://reserve.bluenote.co.jp/reserve/schedule/move/${y}${pad(m)}/`],
  cottonclub: (y,m) => [`https://reserve.cottonclubjapan.co.jp/reserve/schedule/move/${y}${pad(m)}/`],
  swing: (y,m) => [`https://ginzaswing.jp/schedules/?month=${y}-${pad(m)}`],
  first: (y,m) => [`https://naniaru.com/events/schedule?ba=off&be=off&bp=off&month=${m}&period=0&pid=1000002305&year=${y}`],
  kanmachi63: () => ['https://r.jina.ai/http://kanmachi63.blog.fc2.com/'],
  wonderwall: () => ['https://wonderwall-yokohama.jp/calendar/'],
  barbarbar: (y,m) => [`https://www.barbarbar.jp/calendar.php?year=${y}&month=${m}`],
  billboard_yokohama: (y,m) => [`https://www.billboard-live.com/yokohama/schedules?month=${y}-${pad(m)}-01`],
  billboard_tokyo: (y,m) => [`https://www.billboard-live.com/tokyo/schedules?month=${y}-${pad(m)}-01`],
  pitinn: (y,m) => [m === month ? 'http://pit-inn.com/schedule/' : 'http://pit-inn.com/next-schedule/'],
  bodyandsoul: (y,m) => [`https://bodyandsoul.co.jp/schedule?sy=${y}&sm=${pad(m)}`],
  jzbrat: (y,m) => [`https://www.jzbrat.com/liveinfo/${y}/${pad(m)}/index.html`],
  alfie: (y,m) => [`https://alfie.tokyo/schedule/${y}${pad(m)}.html`],
  naru: (y,m) => [m === month ? 'http://ocha-naru.com/schedule/' : 'http://ocha-naru.com/schedule-2/'],
  sometime: (y,m) => [m === month ? 'https://www.sometime.co.jp/sometime/live.html' : `https://www.sometime.co.jp/sometime/live${y}${pad(m)}.html`],
};

function parse(id, html, ctx) {
  if (id === 'pitinn') {
    const out=[];
    for(const block of html.split(/<div class=["']day_box["']>/i).slice(1)){
      const dm=/<li class=["']date["']>\s*(\d{1,2})\/(\d{1,2})/i.exec(block), artist=strip(/<div class=["']day_name["']>([\s\S]*?)<\/div>/i.exec(block)?.[1]||'');
      if(!dm||+dm[1]!==ctx.m||!artist||/(?:夏休み|休業|休演|close|off)/i.test(artist))continue;
      const detail=/<a[^>]+href=["']([^"']*artist_live_info[^"']+)/i.exec(block)?.[1]||ctx.url;
      const img=/<img[^>]+data-src=["']([^"']+)/i.exec(block)?.[1]||/<noscript>[\s\S]*?<img[^>]+src=["']([^"']+)/i.exec(block)?.[1]||null;
      const title=strip(/<div class=["']day_title["']>([\s\S]*?)<\/div>/i.exec(block)?.[1]||''), lineup=strip(/<div class=["']day_member["']>([\s\S]*?)<\/div>/i.exec(block)?.[1]||'');
      out.push({date:iso(ctx.y,+dm[1],+dm[2]),open:afterTime(strip(block),'open|開場'),start:afterTime(strip(block),'start|開演'),artist:[artist,title].filter(Boolean).join(' — ').slice(0,200),lineup:lineup||undefined,price:price(strip(block)),image:img?absolute(img,ctx.url):null,media:[],source:absolute(detail,ctx.url),detailUrl:absolute(detail,ctx.url),reservationUrl:null,reservationStatus:'check'});
    } return out;
  }
  if (id === 'bodyandsoul') {
    const out=[];
    for(const block of html.split(/<div class=["']event-archive[^"']*["']>/i).slice(1)){
      const mo=+(strip(/event-arc-month["'][^>]*>([\s\S]*?)<\/div>/i.exec(block)?.[1]||'').match(/\d+/)?.[0]||0), day=+(strip(/event-arc-day["'][^>]*>([\s\S]*?)<\/div>/i.exec(block)?.[1]||'')||0);
      const title=strip(/event-arc-title["'][^>]*>([\s\S]*?)<\/h2>/i.exec(block)?.[1]||''), detail=/<h2 class=["']event-arc-title["']>[\s\S]*?<a[^>]+href=["']([^"']+)/i.exec(block)?.[1]||ctx.url;
      if(mo!==ctx.m||!day||!title)continue;
      const text=strip(block), img=/<div class=["']event-arc-cover["']>[\s\S]*?<img[^>]+src=["']([^"']+)/i.exec(block)?.[1]||null;
      const second=afterTime(text,'2nd');
      out.push({date:iso(ctx.y,mo,day),open:afterTime(text,'open|開場'),start:afterTime(text,'1st|start|開演'),secondStart:second!=='公式で確認'?second:undefined,artist:title.slice(0,200),price:price(text),image:img?absolute(img,ctx.url):null,media:[],source:absolute(detail,ctx.url),detailUrl:absolute(detail,ctx.url),reservationUrl:absolute(detail,ctx.url),reservationStatus:'web'});
    } return out;
  }
  if (id === 'jzbrat') {
    const out=[]; const re=/<div class=["']pkg["'] id=["'](\d{4})(\d{2})(\d{2})["']>([\s\S]*?)(?=<div class=["']pkg["'] id=["']\d{8}["']|$)/gi; let m;
    while((m=re.exec(html))){if(+m[2]!==ctx.m)continue;const block=m[4],artist=strip(/<h5>([\s\S]*?)<\/h5>/i.exec(block)?.[1]||'');if(!artist||/PRIVATE|OFF/i.test(artist))continue;const text=strip(block),img=/<p class=["']img["']>[\s\S]*?<img[^>]+src=["']([^"']+)/i.exec(block)?.[1]||null,second=afterTime(text,'2nd');const url=`https://www.jzbrat.com/liveinfo/${m[1]}/${m[2]}/index.html#${m[1]}${m[2]}${m[3]}`;out.push({date:`${m[1]}-${m[2]}-${m[3]}`,open:afterTime(text,'open|開場'),start:afterTime(text,'start|開演'),secondStart:second!=='公式で確認'?second:undefined,artist:artist.slice(0,200),price:price(text),image:img?absolute(img,url):null,media:[],source:url,detailUrl:url,reservationUrl:url,reservationStatus:'web'});} return out;
  }
  if (id === 'alfie') {
    const out=[]; const re=/<p[^>]*>([\s\S]*?)<\/p>/gi; let p;
    while((p=re.exec(html))){const text=strip(p[1]),eventImage=pageImage(p[1],ctx.url);for(const line of text.split(/(?=\b\d{1,2}\s*\([a-z]{3}\))/i)){const dm=/^(\d{1,2})\s*\([a-z]{3}\)\s*(.*)$/i.exec(line);if(!dm||/^(close|off)\b/i.test(dm[2]))continue;const artist=dm[2].replace(/[¥￥]\s?[\d,]+.*$/,'').trim();if(artist)out.push({date:iso(ctx.y,ctx.m,+dm[1]),open:'18:45',start:'19:15',artist:artist.slice(0,200),price:price(dm[2]),image:eventImage,media:[],source:ctx.url});}} return out;
  }
  if (id === 'naru') {
    const out=[]; const table=new RegExp(`<table[^>]+tablepress-${String(ctx.y).slice(2)}${pad(ctx.m)}["'][\\s\\S]*?<\\/table>`,'i').exec(html)?.[0]||html;
    for(const row of table.split(/<tr[^>]*>/i).slice(1)){const cells=[...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x=>x[1]);if(cells.length<3)continue;const day=+(strip(cells[0]).match(/\d{1,2}/)?.[0]||0),artist=strip(cells[2]);if(!day||!artist||/^(PRIVATE|OFF|TBA|カレー)/i.test(artist))continue;const daytime=/DAY LIVE/i.test(artist),img=/<img[^>]+src=["']([^"']+)/i.exec(cells[1])?.[1]||null,detail=/<a[^>]+href=["']([^"']+)/i.exec(cells[2])?.[1]||ctx.url;out.push({date:iso(ctx.y,ctx.m,day),open:daytime?'13:30':'18:00',start:daytime?'14:00':'19:00',secondStart:daytime?'15:30':'20:30',artist:artist.replace(/DAY\s*[-–]?\s*LIVE/ig,'').trim().slice(0,200),price:'公式で確認',image:img?absolute(img,ctx.url):null,media:[],source:absolute(detail,ctx.url),detailUrl:absolute(detail,ctx.url),reservationUrl:'http://ocha-naru.com/reservation/',reservationStatus:'web'});} return out;
  }
  if (id === 'sometime') {
    const out=[]; const blocks=[...html.matchAll(/<p class=["'] c-body["']>([\s\S]*?)<\/p>/gi)].map(m=>m[1]);
    for(let i=0;i<blocks.length;i++){const text=strip(blocks[i]),dm=new RegExp(`^${pad(ctx.m)}\\.(\\d{2})\\s+\\w+\\s*(昼の部)?`,'i').exec(text);if(!dm)continue;const daytime=!!dm[2],artist=text.replace(/^\d{2}\.\d{2}\s+\w+\s*(?:昼の部)?\s*2set/i,'').replace(/✴︎?\s*Charge[\s\S]*$/i,'').trim();if(!artist)continue;const nearby=html.slice(Math.max(0,html.indexOf(blocks[i])-1800),html.indexOf(blocks[i])),img=[...nearby.matchAll(/<img[^>]+src=["']([^"']+)/gi)].at(-1)?.[1]||null;out.push({date:iso(ctx.y,ctx.m,+dm[1]),open:daytime?'12:00':'18:00',start:daytime?'13:00':'19:00',secondStart:daytime?'14:30':'20:30',artist:artist.slice(0,200),price:price(text.replace(/yen/i,'円')),image:img?absolute(img,ctx.url):null,media:[],source:ctx.url,reservationUrl:null,reservationStatus:'check'});} return out;
  }
  if (id === 'billboard_yokohama' || id === 'billboard_tokyo') {
    const out = [];
    const city = id === 'billboard_tokyo' ? 'tokyo' : 'yokohama';
    const normalized = html.replace(/\\\"/g, '"').replace(/\\\\n/g, ' ');
    const re = /"block_settings":(\[[\s\S]*?\]),"holiday":([\s\S]*?)"result_status":"([^"]+)"/g;
    let m;
    while ((m = re.exec(normalized))) {
      const block = m[2];
      const date = /"play_date":"(\d{4}-\d{2}-\d{2})"/.exec(block)?.[1];
      const eventId = /"event_id":"([^"]+)"/.exec(block)?.[1];
      const artist = /"title_name":"([^"]+)"/.exec(block)?.[1];
      if (!date || !eventId || !artist || !date.startsWith(`${ctx.y}-${pad(ctx.m)}`)) continue;
      const detailUrl = `https://www.billboard-live.com/${city}/show?event_id=${eventId}&date=${date}`;
      const prices = [...m[1].matchAll(/"price":(\d+)/g)].map(x => Number(x[1])).filter(Boolean);
      const web = m[3] === 'allOK';
      const imageMatch = new RegExp('dtl_' + eventId + '_1_[^\" ]+\\.(?:jpe?g|png|webp)', 'i').exec(normalized);
      const imageName = imageMatch ? imageMatch[0] : null;
      const billboardImage = imageName ? 'https://www.billboard-live.com/public/event_img/' + eventId + '/detail/' + imageName : null;
      const start = /"play_start":"([^"]+)"/.exec(block)?.[1] || '公式で確認';
      const startParts = /^(\d{1,2}):(\d{2})$/.exec(start);
      const inferredOpen = startParts ? `${String((Number(startParts[1]) + 23) % 24).padStart(2, '0')}:${startParts[2]}` : '公式で確認';
      out.push({
        date,
        open: /"play_open":"([^"]+)"/.exec(block)?.[1] || inferredOpen,
        start,
        artist: artist.slice(0, 200),
        price: prices.length ? `${Math.min(...prices).toLocaleString('ja-JP')}円〜` : '公式で確認',
        image: billboardImage,
        media: [],
        source: detailUrl,
        reservationUrl: web ? detailUrl : null,
        detailUrl,
        reservationStatus: web ? 'web' : 'check'
      });
    }
    return out;
  }
  if (id === 'bluenote') return reserve(html, ctx, 'https://reserve.bluenote.co.jp');
  if (id === 'cottonclub') return reserve(html, ctx, 'https://reserve.cottonclubjapan.co.jp');
  if (id === 'dolphy') {
    const out = [];
    for (const row of html.split(/<tr[^>]*>/i).slice(1)) { const text = strip(row), dm = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*[（(]/.exec(text); if (!dm) continue; const artist = text.replace(/^.*?[）)]/, '').replace(/\d{1,2}[:：]\d{2}\s*(?:open|start)/gi, ' ').replace(/(?:前|当|チャージ).*$/, '').trim(); if (artist && !/^(休演|休み|CLOSE)/.test(artist)) out.push({ date: iso(ctx.y,+dm[1],+dm[2]), open:time(text,'open|開場'), start:time(text,'start|開演'), artist:artist.slice(0,200), price:price(text), image:pageImage(row,ctx.url), media:[], source:ctx.url }); }
    return out;
  }
  if (id === 'wonderwall') {
    const out=[]; const re=/<li[^>]*>\s*<a[^>]+href=["']([^"']+\/schedule\/[^"']+)["'][^>]*>([\s\S]*?)<\/li>/gi; let m;
    while((m=re.exec(html))){
      const block=m[2], dm=/<span class=["']day["']>(\d{4})-(\d{2})-(\d{2})<\/span>/i.exec(block);
      const title=strip(/<h2[^>]*class=["']topTitle["'][^>]*>[\s\S]*?<\/h2>/i.exec(block)?.[0]||'').replace(/^\d{4}-\d{2}-\d{2}/,'').replace(/JAZZ|Original$/,'').trim();
      if(!dm||+dm[2]!==ctx.m||!title||/^(CLOSE|休)/i.test(title))continue;
      const text=strip(block), img=/<img[^>]+data-lazy=["']([^"']+)["']/i.exec(block)?.[1]||null;
      out.push({date:`${dm[1]}-${dm[2]}-${dm[3]}`,open:time(text,'open|開場'),start:time(text,'start|開演'),artist:title.slice(0,200),price:price(text.replace(/MC\s*:/i,'¥')),image:img,media:[],source:absolute(m[1],'https://wonderwall-yokohama.jp')});
    } return out;
  }
  if (id === 'barbarbar') {
    const out=[]; const re=/<td([^>]*)>([\s\S]*?)(?=<td|<\/tr>)/gi; let m;
    while((m=re.exec(html))){
      const attrs=m[1], body=m[2], y=+(/data-year=["']?(\d{4})/i.exec(attrs)?.[1]||0), mo=+(/data-month=["']?(\d{1,2})/i.exec(attrs)?.[1]||0), day=+(/data-day=["']?(\d{1,2})/i.exec(attrs)?.[1]||0);
      const title=strip(/<div class=["']calendar-name(?:\s[^"']*)?["']>([\s\S]*?)<\/div>/i.exec(body)?.[1]||'');
      if(y!==ctx.y||mo!==ctx.m||!day||!title||/(?:休み|休業)/.test(title))continue;
      const detailHtml=/<div class=["']calendar-article-content["']>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i.exec(body)?.[1]||body;
      const text=strip(detailHtml), img=/background-image:\s*url\(['"]?([^'")]+)['"]?\)/i.exec(attrs)?.[1]||null;
      const firstMatch=/\b1st\D{0,4}(\d{1,2})[:：](\d{2})/i.exec(text);
      const firstStart=firstMatch?`${Number(firstMatch[1])}:${firstMatch[2]}`:time(text,'start|開演');
      const secondMatch=/\b2nd\D{0,4}(\d{1,2})[:：](\d{2})/i.exec(text), secondStart=secondMatch?`${Number(secondMatch[1])}:${secondMatch[2]}`:'公式で確認';
      const lineup=strip(detailHtml.split(/\bOPEN\b|\b1st\b|\bSTART\b|開場|開演/i)[0]).slice(0,240);
      const reservable=/ご予約へ進む/.test(detailHtml), reservationUrl=reservable?'https://www.barbarbar.jp/schedule.html#sec7':null;
      out.push({date:iso(y,mo,day),open:time(text,'open|開場'),start:firstStart,secondStart:secondStart!=='公式で確認'?secondStart:undefined,artist:title.slice(0,180),lineup:lineup||undefined,price:price(text),image:img?absolute(img,'https://www.barbarbar.jp/'):null,media:[],source:ctx.url,reservationUrl,detailUrl:ctx.url,reservationStatus:reservable?'web':'check'});
    } return out;
  }
  if (id === 'kingsbar') {
    const out=[]; const re=/<a[^>]+href=["']([^"']*\/events\/\d+)["'][^>]*>([\s\S]*?)(?=<a[^>]+href=["'][^"']*\/events\/\d+["']|$)/gi;let m;
    while((m=re.exec(html))){const text=strip(m[0]),dm=/(\d{4})[\/年.-](\d{1,2})[\/月.-](\d{1,2})|(?<!\d)(\d{1,2})[\/月](\d{1,2})/.exec(text);if(!dm)continue;const mo=+(dm[2]||dm[4]),day=+(dm[3]||dm[5]);if(mo!==ctx.m)continue;const anchor=/<a[^>]*>([\s\S]*?)<\/a>/i.exec(m[0]);const artist=strip(anchor?.[1]||'').replace(/\d{1,2}[\/月]\d{1,2}日?/,'').trim();if(artist)out.push({date:iso(ctx.y,mo,day),open:time(text,'open|開場'),start:time(text,'start|開演'),artist:artist.slice(0,180),price:price(text),image:pageImage(m[0],'https://livebar.net'),media:[],source:absolute(m[1],'https://livebar.net')});}return out;
  }
  if (id === 'swing') {
    const out=[];const re=/<h2[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]{0,3000}?(\d{4})\/(\d{2})\/(\d{2})([\s\S]{0,3000}?)(?=<h2|$)/gi;let m;while((m=re.exec(html))){const artist=strip(m[2]);if(artist&&!/スケジュール表|お知らせ/.test(artist))out.push({date:`${m[3]}-${m[4]}-${m[5]}`,open:time(strip(m[6]),'open|開場'),start:time(strip(m[6]),'start|開演|1st'),artist:artist.slice(0,200),price:price(strip(m[6])),image:pageImage(m[6],'https://ginzaswing.jp'),media:[],source:absolute(m[1],'https://ginzaswing.jp')});}return out;
  }
  if (id === 'kanmachi63') {
    const out=[]; const text=strip(html).normalize('NFKC');
    const re=/(\d{1,2})月(\d{1,2})日\s*[（(]([^）)]*)[）)]([\s\S]*?)(?=\d{1,2}月\d{1,2}日\s*[（(]|$)/g; let m;
    while((m=re.exec(text))){
      const mo=+m[1], day=+m[2]; if(mo!==ctx.m)continue;
      const block=m[4].trim(); const explicitStart=time(block,'1st|start|開演');
      const daytime=explicitStart!=='公式で確認'||/[土日祝]/.test(m[3]);
      const artist=block.replace(/^\s*(?:1st\s*\d{1,2}:\d{2}[^\s]*\s*)?(?:2nd\s*\d{1,2}:\d{2}[^\s]*\s*)?/i,'').replace(/\s*(?:本日、|ライブ開催の有無|Posted).*$/,'').trim();
      if(artist)out.push({date:iso(ctx.y,mo,day),open:daytime?'14:30':'19:00',start:explicitStart!=='公式で確認'?explicitStart:(daytime?'15:00':'19:30'),artist:artist.slice(0,200),price:'3,300円',image:null,media:[],source:'http://kanmachi63.blog.fc2.com/'});
    } return out;
  }
  if (id === 'first') {
    const out=[]; const names={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
    for(const row of html.split(/<tr[^>]*>/i).slice(1)){
      const text=strip(row), dm=/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{4})\b/.exec(text); if(!dm||names[dm[1]]!==ctx.m)continue;
      const link=/<a[^>]+href=["']([^"']*\/events\/view\/\d+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(row); if(!link)continue;
      const artist=strip(link[2]); if(!artist)continue;
      out.push({date:iso(+dm[3],ctx.m,+dm[2]),open:time(text,'open|開場'),start:time(text,'start|開演'),artist:artist.slice(0,200),price:price(text),image:pageImage(row,'https://naniaru.com'),media:[],source:absolute(link[1],'https://naniaru.com')});
    } return out;
  }
  return [];
}

(async () => {
  const fresh = new Map(), reports = [];
  for (const [venueId, urls] of Object.entries(sources)) {
    const rows=[]; let failures=0;
    for (const ctx of months) for (const url of urls(ctx.y,ctx.m)) try { const html=await get(url); let parsed=parse(venueId,html,{...ctx,url}); if(venueId==='swing')parsed=await enrichSwing(parsed); if(venueId==='wonderwall')parsed=await enrichWonderwall(parsed); rows.push(...parsed); } catch(e) { failures++; console.error(venueId,url,e.message); }
    const clean=[...new Map(rows.filter(e=>e.date>=today&&e.artist).map(e=>[`${e.date}|${e.artist}|${e.start}`,e])).values()];
    if (venueId === 'naru') await cacheNaruImages(clean);
    const replacement = previous.events.filter(e => e.venueId === venueId && e.date >= today);
    let imageChanged = false;
    if (['billboard_yokohama','billboard_tokyo','first','kingsbar'].includes(venueId)) {
      const candidates=[...clean,...replacement];
      candidates.forEach(e=>{if(e.image&&/(undefined|pickup|special|common\/og-image|assets\/images\/home)/i.test(e.image))e.image=null;});
      const targets=[...new Set(candidates.filter(e=>!e.image&&e.source).map(e=>e.source))], images=new Map();
      for(let i=0;i<targets.length;i+=5){
        const batch=targets.slice(i,i+5);
        await Promise.all(batch.map(async url=>{try{const html=await get(url);images.set(url,detailImage(html,url));}catch(e){console.error('image',url,e.message);}}));
      }
      candidates.forEach(e=>{const image=images.get(e.source);if(!e.image&&image){e.image=image;imageChanged=true;}});
    }
    let changed = imageChanged;
    for (const ctx of months) {
      const ym = `${ctx.y}-${pad(ctx.m)}`;
      const incoming = clean.filter(e => e.date.startsWith(ym));
      const existing = replacement.filter(e => e.date.startsWith(ym));
      const directSchedule = ['pitinn','bodyandsoul','jzbrat','alfie','naru','sometime'].includes(venueId);
      const plausible = incoming.length > 0 && (directSchedule || existing.length === 0 || incoming.length >= Math.ceil(existing.length * 0.8));
      if (plausible) {
        for (let i = replacement.length - 1; i >= 0; i--) if (replacement[i].date.startsWith(ym)) replacement.splice(i, 1);
        replacement.push(...incoming); changed = true;
      }
      {
        const status = plausible ? (failures ? 'partial' : 'ok') : (incoming.length ? 'rejected' : (failures ? 'failed' : 'empty'));
        const reason = status === 'ok' ? '取得済み' : status === 'partial' ? '一部取得' : status === 'rejected' ? '不完全なため旧データ維持' : status === 'failed' ? '取得失敗' : '取得結果0件・公式有無未確認';
        reports.push({venueId,month:ym,status,reason,count:incoming.length,kept:existing.length});
      }
    }
    if (changed) fresh.set(venueId,replacement);
  }
  const untouched = previous.events.filter(e => !fresh.has(e.venueId) && e.date >= today);
  const events = [...untouched, ...[...fresh.entries()].flatMap(([venueId, rows]) => rows.map(e => ({venueId,...e})))].sort((a,b)=>a.date.localeCompare(b.date)||a.venueId.localeCompare(b.venueId));
  fs.writeFileSync(dataPath, JSON.stringify({...previous,updatedAt:fresh.size ? new Date().toISOString() : previous.updatedAt,events,crawlReports:reports},null,2)+'\n');
  console.log(`saved ${events.length} events`);
})().catch(e=>{console.error(e);process.exit(1)});
