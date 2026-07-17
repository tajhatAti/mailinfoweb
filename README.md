# Email Monitor Service — FastAPI + React (Render Free Plan)

৭ টি IMAP মেইলবক্স রিয়েল-টাইম মনিটরিং ড্যাশবোর্ড —
Render Free Tier (512 MB RAM, 750 hrs/month) তে চলার জন্য অপ্টিমাইজড।

## Tech Stack

| Layer  | Stack |
|--------|-------|
| Backend | **FastAPI** + aioimaplib (async IMAP IDLE) |
| Frontend | **React 19** + TanStack Router + Tailwind CSS v4 |
| Realtime | WebSocket (`/ws`) |
| Hosting | **Render** (Docker) |

## Project Structure

```
mailinfoweb/
├── Dockerfile                    ← Multi-stage: Node build → Python server
├── vite.config.ts                ← Vite config with @/ → src/ alias
├── tsconfig.json
├── package.json
├── requirements.txt
├── .env.example                  ← Environment variable template
│
├── app/                          ← ব্যাকএন্ড (Python)
│   ├── __init__.py
│   ├── main.py                   ← FastAPI app + static SPA serving
│   ├── config.py                 ← ACCOUNTS_JSON থেকে অ্যাকাউন্ট লোড
│   ├── api/routes.py             ← /health, /accounts
│   ├── websocket/handlers.py     ← WebSocket connection manager
│   └── services/
│       ├── imap_pool.py          ← ৭টি worker-এর সুপারভাইজার
│       └── imap_worker.py        ← প্রতি-অ্যাকাউন্ট IDLE loop
│
└── src/                          ← ফ্রন্টএন্ড (React/TypeScript)
    ├── styles.css                ← Glass UI + Tailwind
    ├── lib/
    │   ├── accounts.ts           ← ৭টি অ্যাকাউন্ট লিস্ট
    │   ├── email-types.ts        ← TypeScript টাইপস
    │   └── utils.ts
    ├── hooks/
    │   └── use-email-stream.ts   ← WebSocket + mock fallback
    ├── components/dashboard/
    │   ├── AccountSidebar.tsx
    │   ├── ConnectionStatus.tsx
    │   └── EmailCard.tsx
    └── routes/
        ├── root.tsx
        └── index.tsx             ← মেইন ড্যাশবোর্ড
```

## Deploy on Render (Free Plan)

### ধাপ ১: Render-এ Web Service তৈরি
1. [dashboard.render.com](https://dashboard.render.com) → **New +** → **Web Service**
2. GitHub রেপো কানেক্ট করুন
3. সেটিংস:
   - **Runtime**: Docker
   - **Plan**: Free
   - **Branch**: `main` (অথবা আপনার ডিপ্লয় ব্রাঞ্চ)

### ধাপ ২: Environment Variables
Render Dashboard → আপনার service → **Environment** ট্যাব:

```
ACCOUNTS_JSON = [{"email":"you@gmail.com","password":"xxxx xxxx xxxx xxxx","host":"imap.gmail.com","port":993}, ...]
ALLOWED_ORIGINS = https://your-app.onrender.com
```

> ⚠️ Gmail-এর জন্য **App Password** জেনারেট করুন:
> Google Account → Security → 2‑Step Verification → App passwords

### ধাপ ৩: Frontend WebSocket URL
Render-এ ডেপ্লয় হয়ে গেলে আপনার অ্যাপের URL হবে:
`https://YOUR-SERVICE.onrender.com`

Vite বিল্ড টাইমে `VITE_EMAIL_WS_URL` এনভায়রনমেন্ট ভ্যারিয়েবল সেট করুন Render-এ:
```
VITE_EMAIL_WS_URL = wss://YOUR-SERVICE.onrender.com/ws
```

## Local Development

```bash
# ব্যাকএন্ড
pip install -r requirements.txt
ACCOUNTS_JSON='[...]' uvicorn app.main:app --reload --port 7860

# ফ্রন্টএন্ড (আলাদা টার্মিনালে)
npm install
VITE_EMAIL_WS_URL=ws://localhost:7860/ws npm run dev
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Worker status count |
| `GET /accounts` | Account email list (no passwords) |
| `WS /ws` | Real-time email event stream |

## Reliability

- প্রতি অ্যাকাউন্ট আলাদা asyncio.Task — একজন ডেড হলেও বাকিরা চলে
- Exponential backoff (2s → 60s) অটো-রিকানেক্ট
- Supervisor task ক্র্যাশ হওয়া worker রিস্পন করে
- Render free tier 512 MB — ৭টি IMAP IDLE worker আরামে চলে
