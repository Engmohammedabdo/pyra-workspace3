# بحث Perplexity — State of the Art
> ⚠️ ملاحظة: Perplexity API key expired (401). تم البحث عبر SerpAPI + web_fetch كبديل.
> تاريخ البحث: 2026-02-21

---

## Q1: Best Node.js Tools for AI Agents (2025-2026)

### Memory Management
1. **slimcontext** — Lightweight, zero-dependency NPM package for message history management. Handles conversation summarization and context trimming automatically. Perfect for keeping AI agents coherent without manual intervention.
   - `npm install slimcontext`
   
2. **@langchain/core** (LangChain.js) — The JavaScript/TypeScript version of LangChain. Provides MemorySaver, BufferMemory, ConversationSummaryMemory, and VectorStoreRetrieverMemory. Full agent framework with tools, chains, and memory systems.
   - `npm install @langchain/core @langchain/community`
   - Requires Node.js 20+

3. **VoltAgent (@voltagent/core)** — Open-source TypeScript AI Agent Engineering Platform. Built-in memory management with configurable providers, RAG support, guardrails, and tool integration. Has observability dashboard.
   - `npm install @voltagent/core`
   - GitHub: github.com/VoltAgent/voltagent

4. **mem0** — Memory layer for AI agents. Supports long-term, short-term, and semantic memory with automatic categorization.

### Context Optimization
5. **tiktoken** — OpenAI's token counting library (JS port). Essential for measuring and managing context window usage.
   - `npm install tiktoken`

6. **@anthropic-ai/sdk** — Official Anthropic SDK. Supports streaming, tool use, and structured outputs for Claude models.
   - `npm install @anthropic-ai/sdk`

### PDF Report Generation
7. **@digicole/pdfmake-rtl** — Enhanced PDFMake with automatic RTL support for Arabic, Persian, Urdu. No external dependencies.
   - `npm install @digicole/pdfmake-rtl`

8. **pdfkit / @r-pdf-rtl/pdfkit** — Low-level PDF generation. The RTL fork adds Arabic text support.
   - `npm install @r-pdf-rtl/pdfkit`

9. **puppeteer** — Headless Chrome for HTML→PDF conversion. Best quality for complex layouts with Arabic RTL.
   - `npm install puppeteer`

### Calendar Integration
10. **googleapis** — Official Google APIs client. Includes Calendar API with service account support.
    - `npm install googleapis`

### Server Monitoring
11. **node-os-utils** — CPU, memory, disk monitoring utilities.
    - `npm install node-os-utils`

12. **prom-client** — Prometheus metrics client for Node.js.
    - `npm install prom-client`

### Additional Notable Tools
13. **Vercel AI SDK (@ai-sdk/*)** — Unified interface for multiple LLM providers. Streaming, tool calling, structured outputs.
    - `npm install ai @ai-sdk/anthropic @ai-sdk/openai`

14. **zod** — Runtime type validation. Essential for structured AI outputs and tool parameter validation.
    - `npm install zod`

---

## Q2: Context Optimization Techniques

### Sources:
- [Anthropic: Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Maxim AI: Context Window Management Strategies](https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/)
- [Agentailor: Message History Summarization Strategies](https://blog.agentailor.com/posts/message-history-summarization-strategies)

### Key Concepts (from Anthropic's official guide):

**Context = Finite Resource with Diminishing Returns**
- LLMs suffer from "context rot": as token count increases, recall accuracy decreases
- Every token depletes an "attention budget" — n² pairwise relationships for n tokens
- Bigger context windows ≠ better performance. 1M tokens sounds great but performance drops with overloaded prompts

### Technique 1: Conversation Compaction (Summarization)
- Take conversation nearing context limit → summarize contents → reinitiate with compressed context
- **Hierarchical summarization**: Recent exchanges stay verbatim, older content gets progressively compressed into summaries
- Implementation: Use the LLM itself to summarize, with structured prompts like "Summarize the key decisions, facts, and pending items from this conversation"
- **Node.js implementation**: Track token count per message, trigger compaction at ~70% of limit

### Technique 2: Selective Context Injection
- Don't include all history — only inject what's relevant to current query
- **Dynamic selection**: Semantic similarity scoring between current query and past messages
- **Keyword matching**: Simple but effective first pass
- **Learned ranking**: Train models to predict which context segments improve response quality
- Tools: `tiktoken` for counting, vector DB (Supabase pgvector) for semantic search

### Technique 3: Tool Call Result Summarization
- Tool outputs (API responses, file contents, search results) are often the biggest context consumers
- **Strategy**: Summarize tool results before adding to context
- Example: A 5000-token API response → 200-token summary of key findings
- Implementation: Post-process every tool_result with a fast model (Claude Haiku) to extract only relevant info

### Technique 4: Memory-Augmented Retrieval (RAG)
- Store conversation facts in external memory (DB, files, vector store)
- Retrieve only relevant memories per query instead of carrying full history
- **Tiered memory**: 
  - Working memory (current context)
  - Short-term (recent session, file-based)
  - Long-term (vector DB, searchable)
- Tools: Supabase pgvector, ChromaDB, Pinecone

### Technique 5: Context Windowing Strategies
- **Sliding window**: Keep last N messages + system prompt
- **Smart truncation**: Keep system prompt + first message + last N messages + any pinned messages
- **Token budget allocation**: Reserve fixed portions for system (20%), tools (30%), history (40%), response (10%)

### What a Node.js Developer Can Implement:

```javascript
// Practical context management pattern
class ContextManager {
  constructor(maxTokens = 100000) {
    this.maxTokens = maxTokens;
    this.systemPromptBudget = 0.2;  // 20%
    this.toolBudget = 0.3;          // 30%
    this.historyBudget = 0.4;       // 40%
    this.responseBudget = 0.1;      // 10%
  }
  
  // Count tokens with tiktoken
  // Summarize when history exceeds budget
  // Store summaries in memory files
  // Retrieve relevant context via embeddings
}
```

---

## Q3: Practical AI Agent Stack (Node.js Only)

### PDF Reports with Arabic RTL Support

| Package | Approach | Arabic RTL | Complexity |
|---------|----------|-----------|------------|
| **@digicole/pdfmake-rtl** | Declarative JSON→PDF | ✅ Built-in | Low |
| **puppeteer** | HTML/CSS→PDF | ✅ Via CSS `direction: rtl` | Medium |
| **@r-pdf-rtl/pdfkit** | Programmatic | ✅ Fork with RTL | Medium |
| **pdf-lib** | Low-level PDF manipulation | ⚠️ Manual | High |

**Recommendation**: `puppeteer` for complex reports (use HTML templates with Handlebars), `@digicole/pdfmake-rtl` for simple structured reports.

### Web Services Health Monitoring

| Package | Purpose |
|---------|---------|
| **node-cron** | Schedule health checks |
| **axios** | HTTP health probes |
| **ping** | ICMP ping checks |
| **node-os-utils** | System resource monitoring |
| **prom-client** | Metrics collection |

**Simple stack**: `node-cron` + `axios` + status tracking in SQLite/JSON

### Google Calendar Integration (Service Account)

```javascript
// googleapis with service account
const { google } = require('googleapis');
const auth = new google.auth.GoogleAuth({
  keyFile: 'service-account.json',
  scopes: ['https://www.googleapis.com/auth/calendar'],
});
const calendar = google.calendar({ version: 'v3', auth });
```

- **Package**: `googleapis` (official Google client)
- **Auth**: Service account JSON key file
- **Key**: Must share calendar with service account email
- **Alternative**: `google-auth-library` for lower-level auth control

### Excel/CSV Data Analysis

| Package | Purpose |
|---------|---------|
| **xlsx / exceljs** | Read/write Excel files |
| **csv-parse** | Parse CSV with streaming support |
| **csv-stringify** | Generate CSV output |
| **arquero** | DataFrame-like data transformation (like pandas) |
| **simple-statistics** | Statistical analysis |
| **danfojs-node** | Pandas-like DataFrame for Node.js |

**Recommendation**: `exceljs` (read/write Excel with formatting) + `csv-parse` (streaming CSV) + `arquero` (data transformation)

### Complete Recommended Stack

```
AI Core:       @anthropic-ai/sdk + ai (Vercel AI SDK)
Memory:        slimcontext + custom file-based memory
PDF:           puppeteer (complex) OR @digicole/pdfmake-rtl (simple)
Calendar:      googleapis
Excel/CSV:     exceljs + csv-parse + arquero
Monitoring:    node-cron + axios
Validation:    zod
Database:      better-sqlite3 (local) OR @supabase/supabase-js
```

---

## Q4: Underrated NPM Packages

### Smart Caching
1. **keyv** — Simple key-value storage with TTL support. Adapters for Redis, SQLite, PostgreSQL, MongoDB. Zero-config in-memory default.
   - `npm install keyv`
   
2. **lru-cache** — Least Recently Used cache. Size-limited, TTL support, excellent for caching API responses.
   - `npm install lru-cache`

3. **p-memoize** — Memoize async functions with cache support. Perfect for caching LLM responses.
   - `npm install p-memoize`

### Scheduling
4. **node-cron** — Cron-style task scheduler. Lightweight, reliable.
   - `npm install node-cron`

5. **bree** — Job scheduler with worker threads. Supports cron, intervals, and one-off jobs. Runs jobs in separate threads (no blocking).
   - `npm install bree`

6. **agenda** — Lightweight job scheduling with MongoDB persistence. Good for distributed systems.
   - `npm install agenda`

### Content Generation
7. **handlebars** — Template engine. Perfect for generating HTML reports before PDF conversion.
   - `npm install handlebars`

8. **marked** — Markdown to HTML converter. Fast, compliant, extensible.
   - `npm install marked`

9. **rehype / remark** — Unified ecosystem for processing Markdown/HTML. Plugins for everything.
   - `npm install unified remark-parse remark-rehype rehype-stringify`

### Data Transformation
10. **arquero** — Observable's DataFrame library. Filter, aggregate, join, pivot data like pandas.
    - `npm install arquero`

11. **lodash** — Classic utility library. Still unbeatable for deep cloning, merging, grouping.
    - `npm install lodash`

12. **date-fns** — Modern date utility library. Lighter than moment.js, tree-shakeable.
    - `npm install date-fns`

13. **json2csv** — Convert JSON arrays to CSV. Supports nested objects, custom transforms.
    - `npm install json2csv`

### Automated Workflows
14. **p-queue** — Promise-based queue with concurrency control. Essential for rate-limiting API calls.
    - `npm install p-queue`

15. **p-retry** — Retry failed async operations with exponential backoff.
    - `npm install p-retry`

16. **p-limit** — Run multiple async functions with limited concurrency.
    - `npm install p-limit`

17. **bottleneck** — Advanced rate limiter. Cluster support, reservoir scheduling.
    - `npm install bottleneck`

### Hidden Gems for AI Agents
18. **better-sqlite3** — Synchronous SQLite3 for Node.js. 10x faster than `sqlite3`. Perfect for local agent memory/state.
    - `npm install better-sqlite3`

19. **cheerio** — Fast HTML parsing (like jQuery for Node). Great for web scraping results processing.
    - `npm install cheerio`

20. **dotenv-expand** — Variable expansion in .env files. Useful for complex configs.
    - `npm install dotenv-expand`

21. **nanoid** — Tiny, secure, URL-friendly unique ID generator. Better than UUID for agent task IDs.
    - `npm install nanoid`

22. **chalk** — Terminal string styling. Makes agent logs readable.
    - `npm install chalk`

23. **ora** — Elegant terminal spinners. Good for CLI agent feedback.
    - `npm install ora`

---

## الخلاصة: أفضل 10 أدوات قابلة للتطبيق

| # | الأداة | إيش تعمل | npm? | أولوية |
|---|--------|----------|------|--------|
| 1 | **slimcontext** | Context/memory management — تقليل استخدام context window | ✅ | 🔴 عالية |
| 2 | **@digicole/pdfmake-rtl** | PDF generation مع دعم Arabic RTL | ✅ | 🔴 عالية |
| 3 | **arquero** | Data transformation — بديل pandas لـ Node.js | ✅ | 🔴 عالية |
| 4 | **p-queue + p-retry** | Rate limiting + retry — ضروري لأي API calls | ✅ | 🔴 عالية |
| 5 | **better-sqlite3** | Local memory/state storage — سريع جداً | ✅ | 🟡 متوسطة |
| 6 | **keyv** | Smart caching — حفظ responses مع TTL | ✅ | 🟡 متوسطة |
| 7 | **bree** | Job scheduling بـ worker threads — مايعلق الـ main thread | ✅ | 🟡 متوسطة |
| 8 | **exceljs** | Excel read/write — تحليل وإنشاء ملفات Excel | ✅ | 🟡 متوسطة |
| 9 | **handlebars + marked** | Template engine — لتوليد تقارير HTML قبل PDF | ✅ | 🟢 عادية |
| 10 | **bottleneck** | Advanced rate limiter — أفضل من p-queue للـ APIs المعقدة | ✅ | 🟢 عادية |

### ملاحظات إضافية:
- **كل الأدوات** تشتغل على Node.js 22 في Docker بدون root
- **كل الأدوات** تنصب عبر npm بدون GPU
- **الأولوية** مبنية على احتياجات مشروع memory-v3 تحديداً
- **Anthropic's context engineering guide** هو أهم مرجع لتحسين استخدام الـ context window
