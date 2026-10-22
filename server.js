// server.js — REAL NEWS + FILTERED + CLEAN VIRAL POST
import cron from 'node-cron';
import axios from 'axios';

const PAGE_ID    = process.env.PAGE_ID || '61581031296082';
const PAGE_TOKEN = process.env.PAGE_TOKEN || 'YOUR_PAGE_TOKEN_HERE';
const CODECRAFT_KEY = process.env.CODECRAFT_KEY || 'YOUR_CODECRAFT_KEY';
const CODECRAFT_MODEL = process.env.CODECRAFT_MODEL || 'gpt-4o-mini';
const GRAPH = 'https://graph.facebook.com/v19.0';

function topicImage(topic, detail=""){
  // English prompt only — Bangla dile image kharap hoy
  let raw=(topic+" "+detail).slice(0,120);
  // if Bangla chars, switch to English movie prompt
  if(/[ঀ-৿]/.test(raw)) raw = (topic.match(/[A-Za-z0-9 ]+/)||["movie"])[0] + " cinematic movie poster";
  raw=raw.replace(/[^A-Za-z0-9 ]/g,' ').trim().slice(0,100);
  if(!raw) raw="new movie cinematic poster";
  const prompt=raw+" professional cinematic movie poster, ultra detailed, 8k, no text, no watermark";
  const enc=encodeURIComponent(prompt);
  const seed=Math.floor(Math.random()*999999);
  return `https://image.pollinations.ai/p/${enc}?width=800&height=500&seed=${seed}&nologo=true&enhance=true`;
}
function fallbackImage(){ return `https://picsum.photos/seed/mv${Math.floor(Math.random()*999999)}/800/500`; }

async function codecraftChat(prompt){
  if(!CODECRAFT_KEY || CODECRAFT_KEY.includes('YOUR_')) return null;
  const tryModels=[...new Set([CODECRAFT_MODEL,'gpt-4o-mini','gemini-1.5-flash','claude-3-haiku-20240307','deepseek-v4-flash-0731','gemma-2-2b','qwen3.8-27b'])];
  let last=null;
  for(const model of tryModels){
    try{
      const r=await axios.post('https://codecraftapi.com/v1/chat/completions',{
        model, messages:[{role:'user',content:prompt}], temperature:0.85, max_tokens:600
      },{headers:{'Content-Type':'application/json','Authorization':'Bearer '+CODECRAFT_KEY}, timeout:25000});
      const txt=r.data?.choices?.[0]?.message?.content?.trim();
      if(txt){ console.log(` CodeCraft OK ${model}`); return txt; }
    }catch(e){
      last=e; const msg=e.response?.data?.error?.message||e.message;
      console.warn(` CodeCraft ${model} fail:`, msg);
      if(e.response?.status===401||e.response?.status===403) break;
    }
  }
  if(last) throw last; return null;
}

// ---- STRICT NEWS FETCH: only real updates ----
function isBadHeadline(t){
  const low=t.toLowerCase();
  // generic explainer / quiz — skip
  if(low.includes('কীভাবে') && low.includes('হিট')) return true;
  if(low.includes('কিভাবে') && low.includes('হিট')) return true;
  if(low.includes('how ') && low.includes('hit or flop')) return true;
  if(t.length<18) return true;
  if(low.includes('quiz') || low.includes('crossword')) return true;
  if(t.split(' ').length<5) return true;
  return false;
}
function isGoodHeadline(t){
  const low=t.toLowerCase();
  const keywords=['trailer','teaser','release','box office','collection','crore','record','review','tickets','starring','directed','sequel','prequel','ott','netflix','update','announced','first look','poster','song','shooting'];
  const hasKw=keywords.some(k=>low.includes(k));
  const hasMovieHint= low.includes('khan')||low.includes('shakib')||low.includes('toofan')||low.includes('pushpa')||low.includes('prabhas')||low.includes('srk')||low.includes('salman')||low.includes('jeet')||low.includes('dev')||low.includes('film')||low.includes('cinema')||low.includes('movie');
  // prefer titles with box office numbers or movie-ish words
  return hasKw || hasMovieHint;
}

async function fetchGoogleNewsTitles(){
  // NEW: strict queries — only updates, not explainers
  const rssUrls=[
    // Dhallywood fresh
    'https://news.google.com/rss/search?q=Shakib+Khan+OR+Dhallywood+OR+Toofan+2+OR+Dard+OR+Rajkumar+when:7d&hl=bn&gl=BD&ceid=BD:bn',
    // South + Bollywood fresh (7d)
    'https://news.google.com/rss/search?q=box+office+collection+OR+trailer+launch+OR+first+look+OR+movie+release+when:7d&hl=en-IN&gl=IN&ceid=IN:en',
    // Title filter: overall movie
    'https://news.google.com/rss/search?q=Bollywood+OR+South+Indian+OR+Hollywood+movie+when:7d&hl=en-IN&gl=IN&ceid=IN:en',
  ];
  const titles=[];
  for(const url of rssUrls){
    try{
      const r=await axios.get(url,{timeout:12000, headers:{'User-Agent':'Mozilla/5.0'}});
      const xml=r.data;
      const re=/<item>[\s\S]*?<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/g;
      let m;
      while((m=re.exec(xml))!==null){
        let t=m[1].replace(/<[^>]+>/g,'').trim();
        t=t.replace(/ - .*$/,'').trim();
        if(!isBadHeadline(t) && t.length>18) titles.push(t);
        if(titles.length>=25) break;
      }
      if(titles.length<8){
        const re2=/<title>([^<]{18,}?)<\/title>/g;
        let m2; while((m2=re2.exec(xml))!==null){
          let t=m2[1].trim();
          if(t.includes('Google News')) continue;
          t=t.replace(/ - .*$/,'').trim();
          if(!isBadHeadline(t) && t.length>18) titles.push(t);
          if(titles.length>=25) break;
        }
      }
    }catch(e){ console.warn(' RSS fail', e.message); }
  }
  // unique + keep good ones first
  const uniq=[...new Set(titles)];
  const good=uniq.filter(isGoodHeadline);
  const rest=uniq.filter(t=>!isGoodHeadline(t));
  const ranked=[...good, ...rest];
  console.log(` Fetched ${uniq.length} total, ${good.length} good, ranking top:`, ranked.slice(0,3));
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

    const prompt=`Today is ${new Date().toLocaleDateString('en-GB')}. REAL headline: "${chosen}". Create JSON ONLY (no markdown, English imagePrompt!): {"topic":"3-5 words catchy Bangla/English","movie":"movie name from headline (English)","detail":"1 sentence viral detail in Bangla, max 25 words, newsy not generic","industry":"dhallywood/bollywood/south/hollywood/tollywood","imagePrompt":"detailed ENGLISH prompt for cinematic poster based on movie (NO Bangla)","seoKeywords":["k1","k2","k3"],"hashtags":["#H1","#H2","#H3","#H4"]}`;
    try{
      const raw=await codecraftChat(prompt);
      if(raw){
        const m=raw.match(/\{[\s\S]*\}/);
        let data=JSON.parse(m?m[0]:raw);
        // sanitize imagePrompt: must be English
        if(/[ঀ-৿]/.test(data.imagePrompt)) data.imagePrompt=data.movie+" cinematic movie poster, professional";
        console.log(' Research REAL:', data.topic, '| movie:', data.movie);
        return data;
      }
    }catch(e){ console.warn(' AI parse fail', e.message); }
    // fallback without AI but better than before
    const mov=chosen.split('–')[0].split(':')[0].split('|')[0].slice(0,35).trim();
    return {
      topic: chosen.slice(0,40),
      movie: mov||"New Release",
      detail: chosen,
      industry: /shakib|dhally|toofan/i.test(chosen)?'dhallywood': /south|pushpa|prabhas|allu/i.test(chosen)?'south':'bollywood',
      imagePrompt: mov+" cinematic movie poster professional",
      seoKeywords: chosen.split(' ').slice(0,3),
      hashtags: ['#MovieNews','#BoxOffice','#Trending','#Cinema']
    };
  }

  // fallback: ask AI for fresh (not old Toofan)
  const prompt2=`Today is ${new Date().toLocaleDateString('en-GB')}. Give ONE NEW trending Dhallywood/Bollywood/South Indian movie NEWS TODAY (not old Toofan). JSON ONLY: {"topic":"3-5 words","movie":"movie name","detail":"1 sentence NEW update Bangla","industry":"dhallywood/bollywood/south/hollywood/tollywood","imagePrompt":"ENGLISH poster prompt","seoKeywords":["k1","k2","k3"],"hashtags":["#H1","#H2","#H3","#H4"]}`;
  try{
    const raw2=await codecraftChat(prompt2);
    if(raw2){ const m2=raw2.match(/\{[\s\S]*\}/); return JSON.parse(m2?m2[0]:raw2); }
  }catch(e){ console.warn(' fallback AI fail', e.message); }

  const pool=[
    {topic:"New Movie Release Today", movie:"New Release", detail:"আজ মুক্তি পাওয়া নতুন সিনেমা নিয়ে দর্শকদের মাঝে ব্যাপক উৎসাহ!", industry:"dhallywood", imagePrompt:"new movie release cinematic poster, theatre crowd", seoKeywords:["New Movie","Release"], hashtags:["#NewMovie","#Dhallywood","#Trending","#Cinema"]},
    {topic:"Box Office Update Today", movie:"Box Office Hit", detail:"আজকের বক্স অফিসে নতুন চমক, কালেকশনে রেকর্ড!", industry:"bollywood", imagePrompt:"box office blockbuster cinematic poster", seoKeywords:["Box Office","Hit"], hashtags:["#BoxOffice","#Bollywood","#Collection","#Hit"]},
  ];
  return pool[Math.floor(Math.random()*pool.length)];
}

async function makeCaption(r){
  const prompt=`Write a VIRAL 3-para Facebook post in Bengali 70% + English 30% mix. Movie="${r.movie}", News="${r.detail}". Format:\nLine1: 🔥 HOOK (e.g. 🔥 BREAKING: Movie — ...)\nPara: 2 short sentences Bangla detail (newsy, not repeating headline word-for-word)\nLast: question for comments (e.g. আপনি কতটা excited? 1-10 👇)\nAdd 1-2 emojis, 3-4 hashtags from ${r.hashtags.join(' ')}. Under 420 chars. No preamble.`;
  try{
    const t=await codecraftChat(prompt);
    if(t && t.length>35) return t.trim();
  }catch(e){ console.warn(' caption fail', e.message); }
  const dt=new Date().toLocaleDateString('bn-BD');
  return `🔥 BREAKING: ${r.movie} — নতুন আপডেট! 🔥\n\n${r.detail}\n${dt} এর আলোচিত খবর। দর্শকদের মাঝে ব্যাপক সাড়া!\n\nআপনি এই আপডেট নিয়ে কতটা excited? 1-10 👇\n\n${r.hashtags.join(' ')} #MovieNews`;
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
  console.log(' Research:',r.topic,'|',r.movie);
  const imageUrl=topicImage(r.imagePrompt||r.topic,r.detail);
  console.log(' Image:',imageUrl.slice(0,90)+'...');
  const caption=await makeCaption(r);
  console.log(' Caption:',caption.slice(0,100)+'...');
  const res=await fbPhotoPost(caption,imageUrl);
  console.log(' ✅ Posted',res.id||res.post_id); return res;
}
cron.schedule('0 */6 * * *', async()=>{ try{ await runOnce(); }catch(e){ console.error(' Cron',e.response?.data||e.message); }});

import http from 'http';
const PORT=process.env.PORT||3000;
http.createServer((req,res)=>{
  let pathname='/'; try{ const u=new URL(req.url,`http://${req.headers.host||'localhost'}`); pathname=u.pathname.replace(/\/+$/,'')||'/'; }catch{ pathname=(req.url||'/').split('?')[0].replace(/\/+$/,'')||'/'; }
  console.log(` ${req.method} ${req.url} → ${pathname}`);
  if(pathname==='/run'){ runOnce().then(r=>{res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true,id:r.id||r.post_id}));}).catch(e=>{res.writeHead(500,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,error:e.response?.data||e.message||e.toString()}));}); return; }
  if(pathname==='/preview'||pathname==='/test'||pathname==='/dry-run'){
    (async()=>{
      const r=await research(); const imageUrl=topicImage(r.imagePrompt||r.topic,r.detail); const caption=await makeCaption(r);
      try{ const {buffer}=await fetchImageBuffer(imageUrl); console.log(' Preview OK',buffer.length);}catch(e){console.warn(' Preview img',e.message);}
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify({ok:true,dryRun:true,research:r,imageUrl,fallbackImage:fallbackImage(),caption,note:'Preview — FB তে যায়নি। /run এ Real Post'},null,2));
    })().catch(e=>{res.writeHead(500,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,error:e.message}));}); return;
  }
  res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});
  res.end('Movie Autopilot running ✅\nGET /run = manual post\nGET /preview = dry-run (NO token)\nCron: every 6 hours (3/day)\nPage: '+PAGE_ID+'\n');
}).listen(PORT, ()=>console.log(`Health on :${PORT}`));
console.log('🎬 Movie Autopilot — REAL NEWS FILTERED');
console.log(' Page:',PAGE_ID);
if(process.env.RUN_ON_START==='1') setTimeout(()=>runOnce().catch(e=>console.error(' Startup',e.response?.data||e.message)),5000);
