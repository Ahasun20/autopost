// server.js — FREE 24/7 Autopilot — REAL NEWS + CLEAN POST
import cron from 'node-cron';
import axios from 'axios';

// ===== Config (Render Environment) =====
const PAGE_ID    = process.env.PAGE_ID || '61581031296082';
const PAGE_TOKEN = process.env.PAGE_TOKEN || 'YOUR_PAGE_TOKEN_HERE';
const CODECRAFT_KEY = process.env.CODECRAFT_KEY || 'YOUR_CODECRAFT_KEY';
const CODECRAFT_MODEL = process.env.CODECRAFT_MODEL || 'gpt-4o-mini';
const GRAPH = 'https://graph.facebook.com/v19.0';

// ----- Image: Topic-matched, CLEAN (no watermark text) -----
function topicImage(topic, detail=""){
  const clean=(topic+" "+detail).replace(/[^a-zA-Z0-9ঀ-৿ ]/g,' ').trim().slice(0,100);
  if(!clean) return `https://picsum.photos/seed/movie${Math.floor(Math.random()*999999)}/800/500`;
  // Pollinations: add "no watermark, no text, no logo" to prompt + nologo param
  const prompt = clean + ", professional cinematic movie poster, ultra detailed, 8k, no text, no watermark, no logo";
  const enc=encodeURIComponent(prompt);
  const seed=Math.floor(Math.random()*999999);
  return `https://image.pollinations.ai/p/${enc}?width=800&height=500&seed=${seed}&nologo=true&enhance=true`;
}
function fallbackImage(){
  return `https://picsum.photos/seed/mv${Math.floor(Math.random()*999999)}/800/500`;
}

// ----- CodeCraft: try multiple models (your key may not support gpt-4o-mini) -----
async function codecraftChat(prompt){
  if(!CODECRAFT_KEY || CODECRAFT_KEY.includes('YOUR_')) return null;
  const tryModels = [...new Set([CODECRAFT_MODEL, 'gpt-4o-mini','gemini-1.5-flash','claude-3-haiku-20240307','deepseek-v4-flash-0731','gemma-2-2b','qwen3.8-27b'])];
  let lastErr=null;
  for(const model of tryModels){
    try{
      const r=await axios.post('https://codecraftapi.com/v1/chat/completions',{
        model, messages:[{role:'user', content: prompt}], temperature:0.85, max_tokens:600
      },{headers:{'Content-Type':'application/json','Authorization':'Bearer '+CODECRAFT_KEY}, timeout:25000});
      const txt=r.data?.choices?.[0]?.message?.content?.trim();
      if(txt) { console.log(` CodeCraft OK with ${model}`); return txt; }
    }catch(e){
      lastErr=e;
      const msg=e.response?.data?.error?.message || e.message;
      console.warn(` CodeCraft ${model} failed:`, msg);
      // 401/404 = try next model, 429/500 = stop?
      if(e.response?.status===401 || e.response?.status===403) break; // invalid key, no point trying
    }
  }
  if(lastErr) throw lastErr;
  return null;
}

// ----- REAL NEWS: Google News RSS (FREE, NO KEY) -----
async function fetchGoogleNewsTitles(){
  const rssUrls=[
    'https://news.google.com/rss/search?q=Dhallywood+OR+Shakib+Khan+OR+Toofan+OR+Tollywood+OR+Jeet+OR+Bangla+cinema&hl=bn&gl=BD&ceid=BD:bn',
    'https://news.google.com/rss/search?q=South+Indian+movie+OR+Pushpa+OR+Prabhas+OR+Allu+Arjun+box+office&hl=en-IN&gl=IN&ceid=IN:en',
    'https://news.google.com/rss/search?q=Bollywood+OR+Hollywood+movie+box+office+collection+when:7d&hl=en-IN&gl=IN&ceid=IN:en',
  ];
  const titles=[];
  for(const url of rssUrls){
    try{
      const r=await axios.get(url,{timeout:12000, headers:{'User-Agent':'Mozilla/5.0'}});
      const xml=r.data;
      // parse <item><title>...</title>
      const re=/<item>[\s\S]*?<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>[\s\S]*?<\/item>/g;
      let m;
      while((m=re.exec(xml))!==null){
        let t=m[1].replace(/<[^>]+>/g,'').trim();
        t=t.replace(/ - .*$/,'').trim(); // remove source suffix
        if(t.length>12) titles.push(t);
        if(titles.length>=20) break;
      }
      // fallback regex without CDATA
      if(titles.length<5){
        const re2=/<title>([^<]{15,}?)<\/title>/g;
        let m2;
        while((m2=re2.exec(xml))!==null){
          const t=m2[1].trim();
          if(!t.includes('Google News') && t.length>15) titles.push(t);
          if(titles.length>=20) break;
        }
      }
    }catch(e){ console.warn(' RSS fetch failed', url, e.message); }
  }
  return [...new Set(titles)].slice(0,15);
}

let lastTopics=new Set();
async function research(){
  // 1) Try REAL trending from Google News
  let realTitles=[];
  try{ realTitles=await fetchGoogleNewsTitles(); console.log(' Real news titles:', realTitles.slice(0,3)); }catch{}

  if(realTitles.length>0){
    // Avoid repeat: pick first not in lastTopics
    let chosen = realTitles.find(t=> !lastTopics.has(t.slice(0,30))) || realTitles[0];
    lastTopics.add(chosen.slice(0,30));
    if(lastTopics.size>20) lastTopics.delete([...lastTopics][0]);

    // Ask AI to convert this REAL headline into structured JSON (Bangla 70%)
    const prompt=`You are a movie news editor. Today is ${new Date().toLocaleDateString('en-GB')}. REAL headline: "${chosen}". Create JSON ONLY (no markdown): {"topic":"3-5 words catchy","movie":"movie name from headline","detail":"1 sentence viral detail in Bangla 70% + English 30% mix, max 25 words","industry":"one of dhallywood/bollywood/south/hollywood/tollywood","imagePrompt":"detailed English prompt for cinematic poster, based on movie","seoKeywords":["k1","k2","k3"],"hashtags":["#H1","#H2","#H3","#H4"]}`;
    try{
      const raw=await codecraftChat(prompt);
      if(raw){
        const m=raw.match(/\{[\s\S]*\}/);
        const data=JSON.parse(m?m[0]:raw);
        console.log(' Research from REAL news:', data.topic);
        return data;
      }
    }catch(e){ console.warn(' AI parse failed, using headline directly', e.message); }
    // fallback: use headline directly without AI
    return {
      topic: chosen.slice(0,35),
      movie: chosen.split('–')[0].split(':')[0].slice(0,30).trim(),
      detail: chosen,
      industry: chosen.toLowerCase().includes('shakib')||chosen.toLowerCase().includes('dhally')?'dhallywood': chosen.toLowerCase().includes('south')||chosen.toLowerCase().includes('pushpa')?'south':'bollywood',
      imagePrompt: chosen + " cinematic movie poster, professional",
      seoKeywords: chosen.split(' ').slice(0,3),
      hashtags: ['#MovieNews','#BoxOffice','#Trending','#Cinema']
    };
  }

  // 2) No real news? Ask AI for fresh trending (today's date forces new)
  const ind='Dhallywood, Bollywood, South Indian, Hollywood, Tollywood';
  const prompt2=`Today is ${new Date().toLocaleDateString('en-GB')}. Find ONE NEW trending movie news TODAY (not old Toofan) from: ${ind}. Return ONLY JSON: {"topic":"3-5 words","movie":"movie name","detail":"1 sentence NEW update in Bangla","industry":"dhallywood/bollywood/south/hollywood/tollywood","imagePrompt":"English poster prompt","seoKeywords":["k1","k2","k3"],"hashtags":["#H1","#H2","#H3","#H4"]}`;
  try{
    const raw2=await codecraftChat(prompt2);
    if(raw2){
      const m2=raw2.match(/\{[\s\S]*\}/);
      return JSON.parse(m2?m2[0]:raw2);
    }
  }catch(e){ console.warn(' AI research fallback', e.message); }

  // 3) Last resort pool — but newer than Toofan
  const pool=[
    {topic:"New Dhallywood Release", movie:"New Dhallywood Film", detail:"এই সপ্তাহে মুক্তি পাওয়া নতুন সিনেমা নিয়ে দর্শকদের উন্মাদনা তুঙ্গে!", industry:"dhallywood", imagePrompt:"New Bangladeshi movie poster, cinema hall, audience", seoKeywords:["Dhallywood","New Movie"], hashtags:["#Dhallywood","#NewMovie","#BanglaCinema","#Trending"]},
    {topic:"Bollywood Box Office Today", movie:"Trending Bollywood", detail:"আজকের বক্স অফিসে চমক দেখালো নতুন বলিউড রিলিজ!", industry:"bollywood", imagePrompt:"Bollywood box office cinematic poster", seoKeywords:["Box Office","Bollywood"], hashtags:["#BoxOffice","#Bollywood","#Collection","#Hit"]},
    {topic:"South Indian Blockbuster", movie:"South Blockbuster", detail:"সাউথের নতুন ব্লকবাস্টার নিয়ে সোশালে ঝড়!", industry:"south", imagePrompt:"South Indian blockbuster cinematic poster", seoKeywords:["South","Blockbuster"], hashtags:["#SouthIndian","#Blockbuster","#AlluArjun","#Viral"]},
  ];
  return pool[Math.floor(Math.random()*pool.length)];
}

async function makeCaption(r){
  // VIRAL 3-para format: Hook + Detail + Question
  const prompt=`Write a VIRAL Facebook post in Bengali 70% + English 30% mix. Movie="${r.movie}", News="${r.detail}", Industry="${r.industry}". Format: Line1 HOOK with emoji (e.g. 🔥 BREAKING: ...), Line2-3 detail in 2 short sentences (Bangla), Last line question to get comments (e.g. আপনার মতামত? 👇). Add 1-2 emojis total, 3-4 hashtags from ${r.hashtags.join(' ')}. Under 450 chars. No preamble, just the post. Make it newsy, not generic.`;
  try{
    const t=await codecraftChat(prompt);
    if(t && t.length>30) return t;
  }catch(e){ console.warn(' caption AI failed', e.message); }
  // viral fallback template (not 1-line)
  const dt=new Date().toLocaleDateString('bn-BD');
  return `🔥 BREAKING: ${r.movie} — নতুন আপডেট! 🔥\n\n${r.detail}\n${dt} এর সবচেয়ে আলোচিত খবর এটি। ভক্তরা ইতিমধ্যেই উচ্ছ্বসিত!\n\nআপনি এই খবর নিয়ে কতটা excited? 1-10 এ রেট দিন 👇\n\n${r.hashtags.join(' ')} #MovieNews`;
}

async function fetchImageBuffer(url){
  const r=await axios.get(url, {responseType:'arraybuffer', timeout:20000, headers:{'Accept':'image/*','User-Agent':'Mozilla/5.0'}, maxRedirects:3});
  const ct=r.headers['content-type']||'';
  if(!ct.startsWith('image/')) throw new Error('Not image '+ct+' size='+r.data.length);
  if(r.data.length < 3000) throw new Error('Too small '+r.data.length);
  return {buffer: Buffer.from(r.data), contentType: ct};
}

async function fbPhotoPost(caption, imageUrl){
  if(!PAGE_TOKEN || PAGE_TOKEN.includes('YOUR_')) throw new Error('PAGE_TOKEN missing — set env var PAGE_TOKEN on Render');
  const candidates=[imageUrl, fallbackImage()];
  let lastErr=null;
  for(const url of candidates){
    console.log(' Trying image:', url.slice(0,95)+'...');
    try{
      const {buffer, contentType}=await fetchImageBuffer(url);
      console.log('  Fetched', contentType, buffer.length, 'bytes');
      const FormData=(await import('form-data')).default;
      const fd=new FormData();
      fd.append('source', buffer, {filename:'poster.jpg', contentType});
      fd.append('caption', caption);
      fd.append('access_token', PAGE_TOKEN);
      const r=await axios.post(`${GRAPH}/${PAGE_ID}/photos`, fd, {headers: fd.getHeaders(), maxBodyLength: Infinity, timeout:30000});
      console.log('  ✅ Binary success', r.data.id); return r.data;
    }catch(e){
      lastErr=e; console.warn('  Binary failed:', e.response?.data||e.message);
      try{
        const fd2=new URLSearchParams(); fd2.append('url', url); fd2.append('caption', caption); fd2.append('access_token', PAGE_TOKEN);
        const r2=await axios.post(`${GRAPH}/${PAGE_ID}/photos`, fd2, {headers:{'Content-Type':'application/x-www-form-urlencoded'}, timeout:30000});
        console.log('  ✅ URL success', r2.data.id); return r2.data;
      }catch(e2){ lastErr=e2; console.warn('  URL failed:', e2.response?.data||e2.message); }
    }
  }
  throw new Error(lastErr?.response?.data?.error?.message || lastErr?.message || 'Both uploads failed');
}

async function runOnce(){
  console.log('— Autopilot', new Date().toLocaleString('bn-BD'));
  const r=await research();
  console.log(' Research:', r.topic, '|', r.movie);
  const imageUrl=topicImage(r.imagePrompt||r.topic, r.detail);
  console.log(' Image:', imageUrl.slice(0,90)+'...');
  const caption=await makeCaption(r);
  console.log(' Caption:', caption.slice(0,100)+'...');
  const res=await fbPhotoPost(caption, imageUrl);
  console.log(' ✅ Posted:', res.id||res.post_id); return res;
}

cron.schedule('0 */6 * * *', async()=>{ try{ await runOnce(); }catch(e){ console.error(' Cron failed:', e.response?.data||e.message); }});

import http from 'http';
const PORT=process.env.PORT||3000;
http.createServer((req,res)=>{
  let pathname='/';
  try{ const u=new URL(req.url, `http://${req.headers.host||'localhost'}`); pathname=u.pathname.replace(/\/+$/,'')||'/'; }
  catch{ pathname=(req.url||'/').split('?')[0].split('#')[0].replace(/\/+$/,'')||'/'; }
  console.log(` ${req.method} ${req.url} → ${pathname}`);
  if(pathname==='/run'){ runOnce().then(r=>{ res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true, id:r.id||r.post_id})); }).catch(e=>{ res.writeHead(500,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false, error:e.response?.data||e.message||e.toString()})); }); return; }
  if(pathname==='/preview'||pathname==='/test'||pathname==='/dry-run'){
    (async()=>{
      const r=await research(); const imageUrl=topicImage(r.imagePrompt||r.topic,r.detail); const caption=await makeCaption(r);
      try{ const {buffer}=await fetchImageBuffer(imageUrl); console.log(' Preview img OK',buffer.length); }catch(e){ console.warn(' Preview img warn',e.message); }
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify({ok:true, dryRun:true, research:r, imageUrl, fallbackImage:fallbackImage(), caption, note:'Preview — FB তে যায়নি। /run এ Real Post'},null,2));
    })().catch(e=>{ res.writeHead(500,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false, error:e.message})); }); return;
  }
  res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});
  res.end('Movie Autopilot running ✅\nGET /run = manual post\nGET /preview = dry-run (NO token)\nCron: every 6 hours (3/day)\nPage: '+PAGE_ID+'\n');
}).listen(PORT, ()=>console.log(`Health on :${PORT}`));
console.log('🎬 Movie Autopilot — REAL NEWS MODE');
console.log(' Page:', PAGE_ID);
if(process.env.RUN_ON_START==='1') setTimeout(()=>runOnce().catch(e=>console.error(' Startup failed',e.response?.data||e.message)),5000);
