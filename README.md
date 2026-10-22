# 🎬 Movie Autopilot — fb-auto-poster

Full AI Autopilot: Research + Topic-matched Image + SEO + Auto FB Post

## Run locally (browser tool)
Open `index.html` directly — no build needed.

## Free 24/7 Host (PC off থাকলেও চলবে)
See `host-guide.html` — 2 options:
- **A) Render.com** (Recommended) — Free Web Service
- **B) GitHub Actions** — cron, no server

### Quick Deploy — Render
1. Push `fb-auto-poster/` to GitHub
2. dashboard.render.com → New Web Service → connect repo
3. Build: `npm install`, Start: `npm start`, Plan: Free
4. Env vars: `PAGE_TOKEN`, `CODECRAFT_KEY` (optional: `CODECRAFT_MODEL=gpt-4o-mini`, `RUN_ON_START=1`)
5. Deploy → `https://YOUR-APP.onrender.com/run` to test (topic-matched image post)

### Env vars
- `PAGE_TOKEN` — FB Page Access Token (required)
- `CODECRAFT_KEY` — codecraftapi.com key (optional, offline trending if missing)
- `PORT` — Render sets this automatically
- `RUN_ON_START=1` — post once 5s after boot (for testing)

### How images stay topic-matched
`topicImage(topic, detail)` builds a Pollinations AI prompt from the research topic — no random images.

## Files
- `index.html` — Browser tool (Autopilot + manual)
- `server.js` — Node cron server (every 6h, 3/day)
- `package.json` — deps: axios, node-cron
- `host-guide.html` — Bengali free hosting guide
- `Procfile` — for Render/Heroku
