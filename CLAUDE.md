# CLAUDE.md — Workspace Guide for Claude Code

## ⚠️ What This Repo Is
This is NOT a traditional code project. It's an **AI agent workspace** for PyraAI (بايرا) — Mohammed's AI assistant running on OpenClaw.

**Don't try to "fix" or refactor the whole thing.** Work only on what's asked.

## 📁 Directory Map

```
.
├── AGENTS.md          # Agent behavior rules (READ THIS for context)
├── SOUL.md            # PyraAI personality & rules
├── USER.md            # Info about Mohammed (the owner)
├── MEMORY.md          # Quick reference memory
├── HEARTBEAT.md       # Periodic health check tasks
├── TOOLS.md           # Available tools index
│
├── tools/             # Scripts & utilities PyraAI uses
│   ├── mcp/           # MCP client (Google Calendar, Gmail, Drive)
│   ├── memory/        # Memory management (SQLite + markdown)
│   ├── proactive/     # Proactive monitoring (email, heartbeat)
│   ├── monitor/       # Server monitoring
│   ├── docs/          # Detailed tool documentation
│   └── *.mjs          # Individual tool scripts
│
├── memory/            # Daily logs & knowledge base
│   ├── YYYY-MM-DD.md  # Daily activity logs
│   ├── knowledge/     # Organized knowledge (business, tools)
│   ├── ontology/      # Knowledge graph (JSONL)
│   └── archive/       # Old daily logs
│
├── projects/          # Active client projects
│   ├── elite-life/    # EliteLife Clinic
│   ├── etmam-*/       # Etmam (multiple sub-projects)
│   ├── tasheel/       # Tasheel
│   └── injazat-*/     # Injazat
│
├── agents/            # Agent config files (personas, prompts)
├── skills/            # Installed OpenClaw skills
├── scripts/           # Standalone scripts
├── docs/              # Documentation & n8n workflow exports
├── backups/           # Workflow backups
├── archive/           # Old/completed projects
├── assets/            # Images, logos, media
└── research/          # Research outputs
```

## 🔧 Key Technical Details

- **Runtime:** Node.js (v24+), runs on Linux (OpenClaw container)
- **Scripts:** Most tools are `.mjs` (ES modules) — use `node tool.mjs`
- **Python:** Available for Crawl4AI and helpers
- **Package manager:** npm (package.json in root)
- **Environment:** All API keys are in env vars (`$VAR_NAME`), NOT hardcoded

## ✅ Common Tasks & Where to Look

| Task | Look Here |
|------|-----------|
| Edit a tool/script | `tools/` directory |
| Client project work | `projects/<client-name>/` |
| Memory/knowledge | `memory/` or `memory/knowledge/` |
| Agent behavior | `AGENTS.md`, `SOUL.md` |
| n8n workflows | `docs/n8n-raw/` (JSON exports) |
| Tool documentation | `tools/docs/` |

## 🚫 Don't Touch
- `node_modules/` — managed by npm
- `.git/` — don't mess with git history
- `antigravity-awesome-skills/` — reference only, not active
- `.openclaw/` — OpenClaw internal config

## 💡 When Editing Tools
- Tools are ES modules (`.mjs`) — use `import`, not `require`
- API keys: always use `process.env.VAR_NAME`
- Test after editing: `node tools/<tool>.mjs`
