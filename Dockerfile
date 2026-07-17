# ── ধাপ ১: ফ্রন্টএন্ড বিল্ড ──────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /build

COPY package.json ./
# Render build-এ bun.lock corrupt হতে পারে — npm ই ব্যবহার করো
RUN npm install

COPY . .
RUN npm run build

# ── ধাপ ২: পাইথন ব্যাকএন্ড ───────────────────────────────────────────
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# সিস্টেম ডিপেন্ডেন্সি
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# পাইথন প্যাকেজ
COPY requirements.txt .
RUN pip install -r requirements.txt

# ব্যাকএন্ড কোড
COPY app ./app

# ফ্রন্টএন্ড ডিস্ট্রিবিউশন
COPY --from=frontend-builder /build/dist ./dist

# Render-এর সিকিউরিটি রুল: নন-রুট ইউজার
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Render স্বয়ংক্রিয়ভাবে PORT সেট করে (ডিফল্ট 10000)
# আমরা Python-এ পড়ি — কিন্তু CMD-তেও fallback রাখি
EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:${PORT:-10000}/health || exit 1

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000} --proxy-headers --forwarded-allow-ips="*" --log-level info
