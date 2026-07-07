# --- ধাপ ১: নোড.জেএস দিয়ে লাভলেবলের ফ্রন্টএন্ড বিল্ড করা ---
FROM node:18-alpine AS frontend-builder
WORKDIR /build

# ফ্রন্টএন্ডের প্যাকেজ ফাইল কপি ও ইনস্টল করা
COPY package.json bun.lock* package-lock.json* ./
RUN npm install

# বাকি সব ফাইল কপি করে রিয়্যাক্ট ডিস্ট্রিবিউশন (dist) তৈরি করা
COPY . .
RUN npm run build

# --- ধাপ ২: পাইথন দিয়ে হাগিং ফেসের আসল সার্ভার রান করা ---
FROM python:3.10-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# সিস্টেম ডিপেন্ডেন্সি ইনস্টল
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# পাইথন প্যাকেজ ইনস্টল
COPY requirements.txt .
RUN pip install -r requirements.txt

# ব্যাকএন্ডের পাইথন কোড কপি করা
COPY app ./app

# ধাপ ১ থেকে বিল্ড হওয়া ফ্রন্টএন্ড ফাইলগুলো পাইথনের 'dist' ফোল্ডারে কপি করে আনা
COPY --from=frontend-builder /build/dist ./dist

# Hugging Face-এর সিকিউরিটি রুল অনুযায়ী নন-রুট ইউজার সেটআপ
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 7860

# সার্ভার সচল আছে কি না তা চেক করার মেকানিজম
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:7860/health || exit 1

# সার্ভার রান করার ফাইনাল কমান্ড
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860", "--proxy-headers", "--forwarded-allow-ips=*"]