// server.js — FREE 24/7 Autopilot (Node.js)
// Topic-matched AI Image + CodeCraft Research + SEO + Auto FB Post

import cron from 'node-cron';
import axios from 'axios';

// ===== Config (Render Environment থেকে) =====
const PAGE_ID    = process.env.PAGE_ID || '61581031296082';
const PAGE_TOKEN = process.env.PAGE_TOKEN || 'YOUR_PAGE_TOKEN_HERE';
const CODECRAFT_KEY = process.env.CODECRAFT_KEY || 'YOUR_CODECRAFT_KEY';
const CODECRAFT_MODEL = process.env.CODECRAFT_MODEL || 'gpt-4o-mini';
// =====================================

const GRAPH = 'https://graph.facebook.com/v19.0';

// Topic-matched image — Pollinations primary, picsum fallback (guaranteed image)
function topicImage(topic, detail=""){
  const clean=(topic+" "+detail).replace(/[^a-zA-Z0-9 ]/g,' ').trim().slice(0,120);
  if(!clean) return `https://picsum.photos/seed/movie${Math.floor(Math.random()*9999)}/800/500`;
  const enc=encodeURIComponent(clean + ", cinematic movie poster, 4k, highly detailed, dramatic lighting");
  const seed=Math.floor(Math.random()*999999);
  return `https://image.pollinations.ai/p/${enc}?width=800&height=500&seed=${seed}&nologo=true`;
}
function fallbackImage(){
  return `https://picsum.photos/seed/movie${Math.floor(Math.random()*999999)}/800/500`;
}

async function codecraftChat(prompt){
  if(!CODECRAFT_KEY || CODECRAFT_KEY.includes('YOUR_')) return null;
  const r=await axios.post('https://codecraftapi.com/v1/chat/completions',{
    model: CODECRAFT_MODEL,
    messages:[{role:'user', content: prompt}],
    temperature:0.9, max_tokens:500
  },{
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+CODECRAFT_KEY},
    timeout:30000
  });
  return r.data?.choices?.[0]?.message?.content?.trim() || null;
}

async function research(){
  const ind='Dhallywood, Bollywood, South Indian, Hollywood, Tollywood';
  const prompt=`You are a movie news researcher. Today is ${new Date().toLocaleDateString('en-GB')}. Find ONE trending movie topic from: ${ind}. Return ONLY JSON: {"topic":"3-5 words","movie":"movie name","detail":"1 sentence news","industry":"dhallywood/bollywood/south/hollywood/tollywood","imagePrompt":"detailed English prompt for AI image, cinematic poster","seoKeywords":["k1","k2","k3"],"hashtags":["#H1","#H2","#H3","#H4"]}`;
  try{
    const raw=await codecraftChat(prompt);
    if(!raw) throw new Error('no key');
    const m=raw.match(/\{[\s\S]*\}/);
    return JSON.parse(m?m[0]:raw);
  }catch{
    const pool=[
      {topic:"Shakib Khan Toofan 2", movie:"Toofan 2", detail:"Shakib Khan এর নতুন লুকে ঝড়, ট্রেলার 10M ভিউ!", industry:"dhallywood", imagePrompt:"Bangladeshi superstar Shakib Khan action movie poster cinematic dramatic", seoKeywords:["Toofan 2","Shakib Khan"], hashtags:["#Toofan2","#ShakibKhan","#Dhallywood","#BanglaMovie"]},
      {topic:"Pushpa 2 Box Office", movie:"Pushpa 2", detail:"Allu Arjun এর Pushpa 2 বক্স অফিসে 500 কোটি পার!", industry:"south", imagePrompt:"South Indian superstar Allu Arjun Pushpa 2 cinematic poster forest intense", seoKeywords:["Pushpa 2","Allu Arjun"], hashtags:["#Pushpa2","#AlluArjun","#SouthIndian","#BoxOffice"]},
      {topic:"SRK Jawan Record", movie:"Jawan", detail:"SRK এর Jawan 1000 কোটি ক্লাবে!", industry:"bollywood", imagePrompt:"Bollywood SRK Jawan movie poster action city", seoKeywords:["Jawan","SRK"], hashtags:["#Jawan","#SRK","#Bollywood","#Record"]},
      {topic:"Kalki 2898 AD VFX", movie:"Kalki 2898 AD", detail:"Prabhas এর Kalki VFX এ Hollywood কে টেক্কা!", industry:"south", imagePrompt:"Futuristic sci-fi Kalki 2898 AD Prabhas dystopian city epic poster", seoKeywords:["Kalki 2898 AD","Prabhas"], hashtags:["#Kalki2898AD","#Prabhas","#SciFi","#Review"]},
      {topic:"Avengers Secret Wars", movie:"Avengers: Secret Wars", detail:"Marvel এর সবচেয়ে বড় প্রজেক্ট 2027 এ আসছে!", industry:"hollywood", imagePrompt:"Marvel Avengers Secret Wars cinematic poster superheroes assemble epic sky", seoKeywords:["Avengers","Marvel"], hashtags:["#Avengers","#Marvel","#Hollywood","#SecretWars"]},
    ];
    return pool[Math.floor(Math.random()*pool.length)];
  }
}

async function makeCaption(r){
  const prompt=`Write a viral Facebook post in Bengali (70%) + English (30%) mix about: Movie="${r.movie}", Detail="${r.detail}", Industry="${r.industry}", Keywords: ${r.seoKeywords.join(', ')}. Type: news. Under 450 chars, hook first line with emoji, 1-2 emojis, 3-4 hashtags from ${r.hashtags.join(' ')}, end with a question. No preamble.`;
  try{
    const t=await codecraftChat(prompt);
    if(t) return t;
  }catch{}
  return `🎬 ${r.movie} — ${r.detail} 🔥\n\nআপনি কতটা excited? কমেন্টে জানান! 👇\n\n${r.hashtags.join(' ')} #MovieNews`;
}

async function fetchImageBuffer(url){
  const r=await axios.get(url, {responseType:'arraybuffer', timeout:20000, headers:{'Accept':'image/*','User-Agent':'Mozilla/5.0'}, maxRedirects:3});
  const ct=r.headers['content-type']||'';
  if(!ct.startsWith('image/')) throw new Error('Not an image, content-type='+ct+' size='+r.data.length);
  if(r.data.length < 3000) throw new Error('Image too small, likely error page, size='+r.data.length);
  return {buffer: Buffer.from(r.data), contentType: ct};
}

async function fbPhotoPost(caption, imageUrl){
  if(!PAGE_TOKEN || PAGE_TOKEN.includes('YOUR_')) throw new Error('PAGE_TOKEN missing — set env var PAGE_TOKEN on Render');
  const candidates=[imageUrl, fallbackImage()];
  let lastErr=null;
  for(const url of candidates){
    console.log(' Trying image:', url.slice(0,90)+'...');
    // 1) try binary upload
    try{
      const {buffer, contentType}=await fetchImageBuffer(url);
      console.log('  Fetched image', contentType, buffer.length, 'bytes');
      const FormData=(await import('form-data')).default;
      const fd=new FormData();
      fd.append('source', buffer, {filename:'poster.jpg', contentType});
      fd.append('caption', caption);
      fd.append('access_token', PAGE_TOKEN);
      const r=await axios.post(`${GRAPH}/${PAGE_ID}/photos`, fd, {headers: fd.getHeaders(), maxBodyLength: Infinity, timeout:30000});
      console.log('  ✅ Binary upload success', r.data.id);
      return r.data;
    }catch(e){
      lastErr=e;
      console.warn('  Binary upload failed:', e.response?.data || e.message);
      // 2) fallback: URL method for same url
      try{
        const fd2=new URLSearchParams(); fd2.append('url', url); fd2.append('caption', caption); fd2.append('access_token', PAGE_TOKEN);
        const r2=await axios.post(`${GRAPH}/${PAGE_ID}/photos`, fd2, {headers:{'Content-Type':'application/x-www-form-urlencoded'}, timeout:30000});
        console.log('  ✅ URL upload success', r2.data.id);
        return r2.data;
      }catch(e2){
        lastErr=e2;
        console.warn('  URL upload failed:', e2.response?.data || e2.message);
      }
    }
  }
  throw new Error(lastErr?.response?.data?.error?.message || lastErr?.message || 'Both image uploads failed');
}

async function runOnce(){
  console.log('— Autopilot run', new Date().toLocaleString('bn-BD'));
  const r=await research();
  console.log(' Research:', r.topic, '|', r.movie);
  const imageUrl=topicImage(r.imagePrompt || r.topic, r.detail);
  console.log(' Image:', imageUrl.slice(0,90)+'...');
  const caption=await makeCaption(r);
  console.log(' Caption:', caption.slice(0,90)+'...');
  const res=await fbPhotoPost(caption, imageUrl);
  console.log(' ✅ Posted:', res.id || res.post_id);
  return res;
}

// ---- cron: প্রতি 6 ঘন্টায় = দিনে 3টা ----
cron.schedule('0 */6 * * *', async()=>{
  try{ await runOnce(); }catch(e){ console.error(' Cron failed:', e.response?.data || e.message); }
});

// health check server — robust routing
import http from 'http';
const PORT=process.env.PORT||3000;
http.createServer((req,res)=>{
  let pathname='/';
  try{
    const u=new URL(req.url, `http://${req.headers.host||'localhost'}`);
    pathname=u.pathname.replace(/\/+$/,'') || '/';
  }catch{ pathname=(req.url||'/').split('?')[0].split('#')[0].replace(/\/+$/,'') || '/'; }
  console.log(` ${req.method} ${req.url} → pathname=${pathname}`);
  if(pathname==='/run'){
    runOnce().then(r=>{ res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true, id:r.id||r.post_id})); })
             .catch(e=>{ res.writeHead(500,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false, error:e.response?.data||e.message||e.toString()})); });
    return;
  }
  if(pathname==='/preview' || pathname==='/test' || pathname==='/dry-run'){
    (async()=>{
      const r=await research();
      const imageUrl=topicImage(r.imagePrompt || r.topic, r.detail);
      const caption=await makeCaption(r);
      try{ const {buffer}=await fetchImageBuffer(imageUrl); console.log(' Preview image OK', buffer.length); }catch(e){ console.warn(' Preview image fetch warn:', e.message); }
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify({ok:true, dryRun:true, research:r, imageUrl, fallbackImage: fallbackImage(), caption, note:'Token ছাড়া Preview — FB তে যায়নি। PAGE_TOKEN দিলে /run এ Real Post হবে।'}, null, 2));
    })().catch(e=>{ res.writeHead(500,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false, error:e.message})); });
    return;
  }
  res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});
  res.end('Movie Autopilot running ✅\nGET /run = manual post (needs PAGE_TOKEN)\nGET /preview = dry-run test (NO token needed)\nCron: every 6 hours (3/day)\nPage: '+PAGE_ID+'\n');
}).listen(PORT, ()=>console.log(`Health server on :${PORT} — GET /run to test`));

console.log('🎬 Movie Autopilot (FREE HOST READY)');
console.log(' Page:', PAGE_ID);
console.log(' Cron: every 6 hours — PC off থাকলেও চলবে');
console.log(' Test: curl https://YOUR-APP.onrender.com/run');
if(process.env.RUN_ON_START==='1'){
  setTimeout(()=>runOnce().catch(e=>console.error(' Startup run failed:', e.response?.data||e.message)), 5000);
}
