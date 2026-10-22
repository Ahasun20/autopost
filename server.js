// server.js — REAL TMDB POSTER + REAL NEWS + VIRAL CAPTION
import cron from 'node-cron';
import axios from 'axios';

const PAGE_ID    = process.env.PAGE_ID || '61581031296082';
const PAGE_TOKEN = process.env.PAGE_TOKEN || 'YOUR_PAGE_TOKEN_HERE';
const CODECRAFT_KEY = process.env.CODECRAFT_KEY || 'YOUR_CODECRAFT_KEY';
const CODECRAFT_MODEL = process.env.CODECRAFT_MODEL || 'gpt-4o-mini';
const TMDB_KEY   = process.env.TMDB_API_KEY || process.env.TMDB_KEY || ''; // TMDB v3 api_key
const TMDB_TOKEN = process.env.TMDB_TOKEN || ''; // TMDB v4 bearer (optional)
const GRAPH = 'https://graph.facebook.com/v19.0';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w780'; // real poster, no watermark

// ----- TMDB: Real Poster -----
async function getTMDBPoster(movie, topic=""){
  if(!TMDB_KEY && !TMDB_TOKEN) return null;
  const queries=[movie, topic.split(' ').slice(0,3).join(' '), movie.split(':')[0].split('-')[0].trim()].filter(Boolean);
  // unique
  const uniq=[...new Set(queries)].slice(0,2);
  for(const q of uniq){
    try{
      const cleanQ=q.replace(/[^\w\s:\-]/g,' ').trim().slice(0,50);
      if(!cleanQ || cleanQ.length<2) continue;
      let url, headers={};
      if(TMDB_TOKEN){
        url=`https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(cleanQ)}&language=en-US&page=1`;
        headers={Authorization: `Bearer ${TMDB_TOKEN}`};
      } else {
        url=`https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(cleanQ)}&api_key=${TMDB_KEY}&language=en-US&page=1`;
      }
      const r=await axios.get(url,{headers, timeout:10000});
      const results=r.data?.results||[];
      // pick first with poster
      const hit=results.find(x=>x.poster_path) || results[0];
      if(hit?.poster_path){
        const posterUrl=TMDB_IMG + hit.poster_path;
        console.log(` TMDB hit for "${cleanQ}" → ${hit.title} (${hit.release_date||''}) → ${posterUrl.slice(0,70)}`);
        return posterUrl;
      }
      console.log(` TMDB no poster for "${cleanQ}" — ${results.length} results`);
    }catch(e){
      console.warn(` TMDB search "${q}" fail:`, e.response?.data?.status_message || e.message);
    }
  }
  return null;
}

// Fallback: clean image (no AI face, no watermark) — movie-themed stock
function fallbackImage(){
  return `https://picsum.photos/seed/mv${Math.floor(Math.random()*999999)}/800/500`;
}
// Legacy AI image (disabled for TMDB mode — kept for reference)
// function topicImageAI(topic, detail=""){ ... }

async function codecraftChat(prompt){
  if(!CODECRAFT_KEY || CODECRAFT_KEY.includes('YOUR_')) return null;
  const tryModels=[...new Set([CODECRAFT_MODEL,'gpt-4o-mini','gemini-1.5-flash','claude-3-haiku-20240307','deepseek-v4-flash-0731','gemma-2-2b','qwen3.8-27b'])];
  let last=null;
  for(const model of tryModels){
    try{
      const r=await axios.post('https://codecraftapi.com/v1/chat/completions',{
        model, messages:[{role:'user',content:prompt}], temperature:0.85, max_tokens:700
      },{headers:{'Content-Type':'application/json','Authorization':'Bearer '+CODECRAFT_KEY}, timeout:25000});
      const txt=r.data?.choices?.[0]?.message?.content?.trim();
      if(txt){ console.log(` CodeCraft OK ${model}`); return txt; }
    }catch(e){
      last=e; console.warn(` CodeCraft ${model} fail:`, e.response?.data?.error?.message||e.message);
      if(e.response?.status===401||e.response?.status===403) break;
    }
  }
  if(last) throw last; return null;
}

function isBadHeadline(t){
  const low=t.toLowerCase();
  if(low.includes('how ') && low.includes('hit or flop')) return true;
  if(t.length<18) return true;
  if(low.includes('quiz')||low.includes('crossword')) return true;
  if(t.split(' ').length<5) return true;
  // BBC explainer pattern
  if(low.includes('কীভাবে') && low.includes('হিট')) return true;
  if(low.includes('কিভাবে') && low.includes('হিট')) return true;
  return false;
}
function isGoodHeadline(t){
  const low=t.toLowerCase();
  const kws=['trailer','teaser','release','box office','collection','crore','record','review','starring','sequel','ott','netflix','update','announced','first look','poster','song','shooting','day 1','day 2','day 5','earns','mints'];
  const hasKw=kws.some(k=>low.includes(k));
  const hasMovie= low.includes('khan')||low.includes('shakib')||low.includes('toofan')||low.includes('pushpa')||low.includes('prabhas')||low.includes('srk')||low.includes('salman')||low.includes('jeet')||low.includes('film')||low.includes('cinema')||low.includes('movie')||low.includes('jailer')||low.includes('rajini');
  return hasKw || hasMovie;
}

async function fetchGoogleNewsTitles(){
  const rssUrls=[
    'https://news.google.com/rss/search?q=Shakib+Khan+OR+Dhallywood+OR+Toofan+2+OR+Dard+OR+Rajkumar+when:7d&hl=bn&gl=BD&ceid=BD:bn',
    'https://news.google.com/rss/search?q=box+office+collection+OR+trailer+launch+OR+first+look+OR+movie+release+when:7d&hl=en-IN&gl=IN&ceid=IN:en',
    'https://news.google.com/rss/search?q=Jailer+2+OR+Prahaar+OR+Pushpa+OR+Kantara+OR+Bollywood+movie+when:7d&hl=en-IN&gl=IN&ceid=IN:en',
  ];
  const titles=[];
  for(const url of rssUrls){
    try{
      const r=await axios.get(url,{timeout:12000, headers:{'User-Agent':'Mozilla/5.0'}});
      const xml=r.data;
      const re=/<item>[\s\S]*?<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/g;
      let m; while((m=re.exec(xml))!==null){
        let t=m[1].replace(/<[^>]+>/g,'').trim().replace(/ - .*$/,'').trim();
        if(!isBadHeadline(t) && t.length>18) titles.push(t);
        if(titles.length>=25) break;
      }
      if(titles.length<8){
        const re2=/<title>([^<]{18,}?)<\/title>/g;
        let m2; while((m2=re2.exec(xml))!==null){
          let t=m2[1].trim(); if(t.includes('Google News')) continue;
          t=t.replace(/ - .*$/,'').trim();
          if(!isBadHeadline(t) && t.length>18) titles.push(t);
          if(titles.length>=25) break;
        }
      }
    }catch(e){ console.warn(' RSS fail', e.message); }
  }
  const uniq=[...new Set(titles)];
  const good=uniq.filter(isGoodHeadline);
  const rest=uniq.filter(t=>!isGoodHeadline(t));
  const ranked=[...good,...rest];
  console.log(` Fetched ${uniq.length} total, ${good.length} good, top:`, ranked.slice(0,3));
  return ranked.slice(0,15);
}

let lastTopics=new Set();
async function research(){
  let realTitles=[];
  try{ realTitles=await fetchGoogleNewsTitles(); }catch{}
  if(realTitles.length>0){
    let chosen=realTitles.find(t=> !lastTopics.has(t.slice(0,30))) || realTitles[0];
    lastTopics.add(chosen.slice(0,30));
    if(lastTopics.size>25) lastTopics.delete([...lastTopics][0]);
    const prompt=`Today is ${new Date().toLocaleDateString('en-GB')}. REAL headline: "${chosen}". Create JSON ONLY (no markdown, imagePrompt must be ENGLISH!): {"topic":"3-5 words catchy","movie":"movie name ONLY from headline (English, e.g. Jailer 2)","detail":"1 sentence viral detail in Bangla, max 22 words, no cutoff, newsy","industry":"dhallywood/bollywood/south/hollywood/tollywood","imagePrompt":"ENGLISH poster prompt","seoKeywords":["k1","k2","k3"],"hashtags":["#H1","#H2","#H3","#H4"]}`;
    try{
      const raw=await codecraftChat(prompt);
      if(raw){
        const m=raw.match(/\{[\s\S]*\}/);
        let data=JSON.parse(m?m[0]:raw);
        // Clean movie: no "Box Office" in movie name
        data.movie=(data.movie||'').replace(/Box Office.*/i,'').replace(/Day \d+.*/i,'').replace(/Collection.*/i,'').trim() || data.movie;
        if(!data.movie) data.movie=chosen.split('–')[0].split(':')[0].trim().slice(0,30);
        if(/[ঀ-৿]/.test(data.imagePrompt)) data.imagePrompt=data.movie+" cinematic movie poster, professional";
        console.log(' Research REAL:', data.topic, '| movie:', data.movie);
        return data;
      }
    }catch(e){ console.warn(' AI parse fail', e.message); }
    const mov=chosen.split('–')[0].split(':')[0].split('|')[0].slice(0,35).trim();
    return { topic: chosen.slice(0,40), movie: mov||"New Release", detail: chosen.slice(0,120), industry: /shakib|dhally|toofan/i.test(chosen)?'dhallywood': /south|pushpa|prabhas|jailer|rajini/i.test(chosen)?'south':'bollywood', imagePrompt: mov+" cinematic movie poster", seoKeywords: chosen.split(' ').slice(0,3), hashtags:['#MovieNews','#BoxOffice','#Trending','#Cinema'] };
  }
  const prompt2=`Today is ${new Date().toLocaleDateString('en-GB')}. Give ONE NEW trending Dhallywood/Bollywood/South movie NEWS TODAY. JSON ONLY: {"topic":"3-5 words","movie":"movie name","detail":"1 sentence NEW update Bangla, no cutoff","industry":"dhallywood/bollywood/south","imagePrompt":"ENGLISH poster prompt","seoKeywords":["k1","k2"],"hashtags":["#H1","#H2","#H3","#H4"]}`;
  try{ const raw2=await codecraftChat(prompt2); if(raw2){ const m2=raw2.match(/\{[\s\S]*\}/); return JSON.parse(m2?m2[0]:raw2); } }catch(e){ console.warn(' fallback AI', e.message); }
  return {topic:"New Movie Update", movie:"New Release", detail:"আজকের নতুন সিনেমা আপডেট নিয়ে দর্শকদের মাঝে ব্যাপক উৎসাহ!", industry:"bollywood", imagePrompt:"new movie release cinematic poster", seoKeywords:["New Movie"], hashtags:["#NewMovie","#Trending","#Cinema","#MovieNews"]};
}

async function makeCaption(r){
  // CLEAN viral: no truncation, no date line duplication
  const shortDetail=(r.detail||'').slice(0,140).trim(); // prevent "worl" cutoff — full detail
  const prompt=`Write a VIRAL Facebook post in Bengali 70% + English 30% mix. Movie="${r.movie}", News="${shortDetail}". Rules: 3 paras: 1) 🔥 HOOK (e.g. 🔥 Prahaar Day 1 — Rajkummar Rao er dhamaka! 🔥) 2) 1-2 sentences detail (Bangla, complete, NO cutoff word) 3) Question for comments (e.g. আপনি দেখবেন? 👇). Add 1-2 emojis, hashtags: ${r.hashtags.join(' ')}. Under 400 chars. NO date line. NO repeat headline word-for-word. Complete sentences only.`;
  try{
    const t=await codecraftChat(prompt);
    if(t && t.length>40){
      // sanitize: remove "worl" cutoff artifact
      let clean=t.replace(/\bworl\b/g,'world').replace(/২২\/১০\/২০২৬.*?\n/g,'').trim();
      // ensure not too long
      if(clean.length>500) clean=clean.slice(0,490)+'…';
      return clean;
    }
  }catch(e){ console.warn(' caption fail', e.message); }
  return `🔥 ${r.movie} — নতুন আপডেট! 🔥\n\n${shortDetail}\nদর্শকদের মাঝে ব্যাপক সাড়া ফেলেছে!\n\nআপনি এই সিনেমাটি নিয়ে কতটা excited? 1-10 👇\n\n${r.hashtags.join(' ')} #MovieNews`;
}

async function fetchImageBuffer(url){
  const r=await axios.get(url,{responseType:'arraybuffer', timeout:20000, headers:{'Accept':'image/*','User-Agent':'Mozilla/5.0'}, maxRedirects:3});
  const ct=r.headers['content-type']||'';
  if(!ct.startsWith('image/')) throw new Error('Not image '+ct);
  if(r.data.length<3000) throw new Error('Too small '+r.data.length);
  return {buffer:Buffer.from(r.data), contentType:ct};
}

async function fbPhotoPost(caption, imageUrl){
  if(!PAGE_TOKEN||PAGE_TOKEN.includes('YOUR_')) throw new Error('PAGE_TOKEN missing');
  const candidates=[imageUrl, fallbackImage()];
  let last=null;
  for(const url of candidates){
    console.log(' Trying img:', url.slice(0,95)+'...');
    try{
      const {buffer,contentType}=await fetchImageBuffer(url);
      console.log('  Fetched',contentType,buffer.length);
      const FormData=(await import('form-data')).default;
      const fd=new FormData(); fd.append('source',buffer,{filename:'poster.jpg',contentType}); fd.append('caption',caption); fd.append('access_token',PAGE_TOKEN);
      const r=await axios.post(`${GRAPH}/${PAGE_ID}/photos`,fd,{headers:fd.getHeaders(), maxBodyLength:Infinity, timeout:30000});
      console.log('  ✅ Binary',r.data.id); return r.data;
    }catch(e){
      last=e; console.warn('  Binary fail',e.response?.data||e.message);
      try{
        const fd2=new URLSearchParams(); fd2.append('url',url); fd2.append('caption',caption); fd2.append('access_token',PAGE_TOKEN);
        const r2=await axios.post(`${GRAPH}/${PAGE_ID}/photos`,fd2,{headers:{'Content-Type':'application/x-www-form-urlencoded'}, timeout:30000});
        console.log('  ✅ URL',r2.data.id); return r2.data;
      }catch(e2){ last=e2; console.warn('  URL fail',e2.response?.data||e2.message); }
    }
  }
  throw new Error(last?.response?.data?.error?.message||last?.message||'Both uploads failed');
}

async function runOnce(){
  console.log('— Autopilot', new Date().toLocaleString('bn-BD'));
  const r=await research();
  console.log(' Research:',r.topic,'|',r.movie, '| was TMDB poster?', !!TMDB_KEY);
  // TMDB real poster first!
  let imageUrl=await getTMDBPoster(r.movie, r.topic);
  if(!imageUrl){
    console.log(' TMDB no poster, fallback clean image');
    imageUrl=fallbackImage();
  } else {
    console.log(' TMDB poster OK:', imageUrl.slice(0,70));
  }
  const caption=await makeCaption(r);
  console.log(' Caption:',caption.slice(0,110)+'...');
  const res=await fbPhotoPost(caption,imageUrl);
  console.log(' ✅ Posted',res.id||res.post_id); return res;
}

cron.schedule('0 */6 * * *', async()=>{ try{ await runOnce(); }catch(e){ console.error(' Cron',e.response?.data||e.message); }});

import http from 'http';
const PORT=process.env.PORT||3000;
http.createServer((req,res)=>{
  let pathname='/'; try{ const u=new URL(req.url,`http://${req.headers.host||'localhost'}`); pathname=u.pathname.replace(/\/+$/,'')||'/'; }catch{ pathname=(req.url||'/').split('?')[0].replace(/\/+$/,'')||'/'; }
  console.log(` ${req.method} ${req.url} → ${pathname}`);
  if(pathname==='/run'){ runOnce().then(r=>{res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true,id:r.id||r.post_id, tmdb:!!TMDB_KEY}));}).catch(e=>{res.writeHead(500,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,error:e.response?.data||e.message||e.toString()}));}); return; }
  if(pathname==='/preview'||pathname==='/test'||pathname==='/dry-run'){
    (async()=>{
      const r=await research();
      let imageUrl=await getTMDBPoster(r.movie, r.topic);
      let source='tmdb';
      if(!imageUrl){ imageUrl=fallbackImage(); source='fallback'; }
      const caption=await makeCaption(r);
      try{ const {buffer}=await fetchImageBuffer(imageUrl); console.log(' Preview img OK',buffer.length, source);}catch(e){console.warn(' Preview img',e.message);}
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify({ok:true,dryRun:true,research:r,imageUrl,imageSource:source,hasTMDB:!!TMDB_KEY, caption, note: TMDB_KEY?'TMDB Real Poster — FB তে যাবে '+source: 'TMDB_KEY missing — fallback image. Render Environment এ TMDB_API_KEY add করুন (themoviedb.org free)', tip:'themoviedb.org → Settings → API → v3 api_key copy → Render Environment এ TMDB_API_KEY=... add'},null,2));
    })().catch(e=>{res.writeHead(500,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,error:e.message}));}); return;
  }
  res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});
  res.end('Movie Autopilot (TMDB Real Poster) running ✅\nGET /run = manual post\nGET /preview = dry-run (shows imageSource: tmdb/fallback)\nCron: every 6h (3/day)\nPage: '+PAGE_ID+'\nTMDB: '+(TMDB_KEY?'ON ✅':'OFF — add TMDB_API_KEY env')+'\n');
}).listen(PORT, ()=>console.log(`Health on :${PORT} — TMDB ${TMDB_KEY?'ON':'OFF (add TMDB_API_KEY)'}`));
console.log('🎬 Movie Autopilot — TMDB REAL POSTER MODE');
console.log(' Page:',PAGE_ID, '| TMDB:', TMDB_KEY?'ON ✅':'OFF — add TMDB_API_KEY (themoviedb.org free)');
if(process.env.RUN_ON_START==='1') setTimeout(()=>runOnce().catch(e=>console.error(' Startup',e.response?.data||e.message)),5000);
