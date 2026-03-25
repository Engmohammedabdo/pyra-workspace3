# Coolify Port Map — 72.61.148.81
*آخر تحديث: 2026-02-07*

## البورتات المفتوحة على الإنترنت (Host Ports)

| Port | الخدمة | ملاحظات |
|------|--------|---------|
| 22 | SSH | النظام |
| 80 | Traefik HTTP | redirect → 443 |
| 443 | Traefik HTTPS | كل الـ domains |
| 5433 | Supabase Pyramedia DB | Postgres public |
| 5434 | Supabase EliteLife DB | Postgres public |
| 8000 | Coolify Dashboard | لوحة التحكم |

## البورتات الداخلية (Docker Internal)

| Port | الخدمة | Container |
|------|--------|-----------|
| 3000 | Chatwoot / EliteLife Apps / Pyra Voice / Supabase Studio | عدة containers |
| 4000 | Supavisor (Pyramedia + EliteLife) | connection pooler |
| 5432 | PostgreSQL (كل الـ databases) | internal لكل service |
| 5678 | n8n Editor + Webhooks | عبر Traefik |
| 6379 | Redis (n8n + Evolution + Chatwoot) | internal |
| 8000 | Kong API Gateway (Supabase) | internal |
| 8080 | Supabase Meta | internal |

## الـ Domains المحجوزة

| Domain | الخدمة | Service UUID |
|--------|--------|-------------|
| n8n.pyramedia.info | n8n | ek0w044kw8ok844gw8sgck80 |
| db.pyramedia.info | Supabase Pyramedia | g4kwcwwwkc40440o48wo48sg |
| elitelifedb.pyramedia.cloud | Supabase EliteLife | mgs0s8w0gwwws8wc0c88cg8k |
| evo.pyramedia.info | Evolution API | vsokkwo0kscw0ggkws40o0ws |
| chatwoot.pyramedia.cloud | Chatwoot | t84o0okc0ws0040088c40sk4 |
| voice.pyramedia.info | Pyra Voice | app (standalone) |

## الـ Services

### 1. n8n (ek0w044kw8ok844gw8sgck80)
- n8n + n8n-worker
- PostgreSQL 16 (داخلي — لـ n8n فقط)
- Redis 6 (داخلي)

### 2. Supabase Pyramedia (g4kwcwwwkc40440o48wo48sg)
- supabase-db (Postgres 15.8) — public port 5433
- supabase-kong, rest, auth, storage, studio, meta
- supavisor, realtime, edge-functions, analytics
- minio, imgproxy, vector

### 3. Supabase EliteLife (mgs0s8w0gwwws8wc0c88cg8k)
- supabase-db (Postgres 15.8) — public port 5434
- نفس components الـ Pyramedia

### 4. Evolution API (vsokkwo0kscw0ggkws40o0ws)
- api
- PostgreSQL 16 (داخلي)
- Redis (داخلي)

### 5. Chatwoot (t84o0okc0ws0040088c40sk4)
- chatwoot + sidekiq
- PostgreSQL + pgvector (داخلي)
- Redis (داخلي)

### 6. Standalone Apps
- pyra-voice (port 3000 internal)
- dashboard-elitelife (port 3000 internal)
- admin-elitelife (port 3000 internal)

## البورتات المتاحة (آمنة للاستخدام)

- 3001–3999
- 4001–5431
- 5435–5677
- 5679–7999
- 8001–8079
- 8081–9999
- 9001+

## ملاحظات
- n8n بيتصل بـ Supabase عبر public IP (72.61.148.81:5433) — مش Docker internal
- لو عملت restart لـ Supabase، ممكن الـ port mapping ينكسر — الحل: شيل public port وارجعه
- Coolify Dashboard على 8000 بدون HTTPS
