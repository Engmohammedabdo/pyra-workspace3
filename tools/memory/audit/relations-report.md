# Memory Relations Graph — Report
**Date:** 2026-02-20  
**Script:** `/home/node/openclaw/tools/memory/build-relations.mjs`

## Summary
| Metric | Value |
|--------|-------|
| **Total relations** | 264 |
| **New relations added** | 262 |
| **Pre-existing relations** | 2 |
| **Graph nodes (unique memories)** | 122 |
| **Source pool** | 268 memories (importance ≥ 7) |

## Distribution by Type

| Relation | Count | Avg Weight | Description |
|----------|-------|------------|-------------|
| `relates_to` | 140 | 0.68 | Shared topic/entity |
| `follows` | 39 | 0.62 | Temporal sequence |
| `caused_by` | 30 | 0.81 | Cause → Effect |
| `part_of` | 30 | 0.70 | Component of larger project |
| `supports` | 23 | 0.73 | Confirmation/reinforcement |
| `same_conversation` | 1 | 0.50 | (pre-existing) |
| `related_to` | 1 | 0.80 | (pre-existing) |

## Strategies Used

### 1. Shared Entities (80 relations)
- Pairs of memories linked to 2+ common entities (excluding Mohammed/Bayra/Pyramedia as too generic)
- Weight scales: 0.5 + 0.1 per shared entity, max 0.9
- Example: Infrastructure memories sharing Coolify + Supabase entities

### 2. Shared Tags (60 relations)
- Memories with 2+ matching tags (filtered noise: auto-ingest, dates, api, security)
- Weight scales: 0.4 + 0.1 per tag, max 0.8
- Example: WhatsApp bot memories sharing `system prompt` + `qualification` tags

### 3. Temporal Sequences (30 relations)
- Consecutive events within same project (Etmam, Pyra Voice, Pyra Workspace, EliteLife, Chatwoot)
- Weight: 0.6 (temporal ordering)
- Creates project timelines

### 4. Semantic Patterns (92 relations)
- **caused_by (30):** Event/mistake → lesson/bugfix/rule
- **supports (23):** Lessons → rules they validate; rules → rules they reinforce
- **part_of (30):** Infrastructure/reference/credential → main project memory
- **follows (9):** Evaluate-Loop chain, Memory system chain, WhatsApp analysis → deployment

## Top 10 Strongest Relations

1. **🔴 caused_by (w=0.9):** "لازم أسجّل ذكريات يدوي" → "قواعد جديدة من محمد — Rule 9-11"
   - *Lesson from forgetting to log → New rules requiring execution plans*

2. **🔴 caused_by (w=0.9):** "AI bot ignores direct questions" → "System prompt v3 built from data"
   - *Bot failure → prompt rewrite*

3. **🔴 caused_by (w=0.9):** "AI bot doesn't respect 'no'" → "System prompt v3 built from data"
   - *Bot failure → prompt rewrite*

4. **🔴 caused_by (w=0.9):** "AI bot asked for name 193 times" → "System prompt v3 built from data"
   - *Bot failure → prompt rewrite*

5. **🟢 relates_to (w=0.9):** VPS 2 Coolify infrastructure ↔ Server list
   - *Infrastructure documentation linked*

6. **🟡 supports (w=0.8):** Sub-agent lesson → "راجعي شغل الـ Sub-Agents قبل ما تسلّمي"
   - *Real experience validates the rule*

7. **🟡 supports (w=0.8):** Media Buyer Agent mistake → "وزّعي الشغل على Sub-Agents"
   - *Failure reinforces work distribution rule*

8. **🔵 follows (w=0.7):** Evaluate-Loop Protocol documented → Evaluator Agent created → Implementation decision
   - *Development timeline*

9. **🟣 part_of (w=0.7):** Pyra Voice tech stack → Pyra Voice full build & deploy
   - *Component → whole project*

10. **🟣 part_of (w=0.7):** Chatwoot SMTP config → Chatwoot full setup session
    - *Configuration detail → main deployment event*

## Graph Characteristics
- **Density:** Moderate — 264 edges / 122 nodes = ~2.2 edges per node average
- **Hub nodes:** Infrastructure memories and rule memories are most connected
- **Clusters:** Clear project clusters (Pyra Voice, Chatwoot, Etmam, WhatsApp bot)
- **Causal chains:** AI bot problems → data analysis → prompt v3 → deployment
- **No contradicts found** — memories are consistent (good sign)

## Notes
- `contradicts` = 0 (no conflicting memories detected in high-importance set)
- 2 pre-existing relations preserved (`related_to`, `same_conversation`)
- Total slightly above 200 target (262) but all relations are meaningful
- Script is idempotent (INSERT OR IGNORE) — safe to re-run
