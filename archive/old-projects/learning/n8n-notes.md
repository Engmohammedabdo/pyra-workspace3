# n8n Learning Notes 📚

## Version Info
- **Mohammed's instance:** 2.4.8
- **Current stable:** 2.6.3
- **Current beta:** 2.7.1

## New Features (v2.5+)

### Human-in-the-Loop for AI Tools (v2.6.0)
- Require human approval before AI agent executes specific tools
- Click + icon on connection from AI Agent to tool → "Add human review step"
- Can route approvals via Slack, email, etc.
- For high-impact operations (deletes, production writes)

### MCP Client Tool
- Connect to external MCP (Model Context Protocol) servers
- Use tools from MCP servers in n8n agents
- SSE endpoint + authentication options

### MCP Server Trigger
- Expose n8n workflows as tools to external AI agents
- Makes n8n a tool provider

### Data Tables API (v2.7.0)
- Programmatic access to data tables via public API

---

## Key Concepts I Learned

### 1. Execution Order (n8n 1.0+)
- Branches execute **sequentially**, NOT in parallel
- Order: **top to bottom**, then **left to right**
- Can change in workflow settings

### 2. Data Structure
```javascript
[
  {
    "json": { /* actual data */ },
    "binary": { /* optional binary data */ }
  }
]
```
- All data is an **array of objects**
- Each item wrapped in `json` key

### 3. Referencing Other Nodes
```javascript
$('Node Name').first()     // First item from node
$('Node Name').all()       // All items from node
$('Node Name').item        // Linked item (for item pairing)
$('Node Name').first().json.fieldName  // Access specific field
```

**IMPORTANT:** The referenced node MUST have executed BEFORE you reference it!

### 4. Current Node Input
```javascript
$json                      // Current item's JSON data
$input.item               // Full current item
$input.all()              // All input items
$input.first()            // First input item
```

### 5. Merging Data
When you need data from two different sources:
- Use **Merge node** to combine branches
- Or process sequentially (one after another)
- DON'T create parallel branches that reference each other

### 6. Best Practices
1. **Linear flow is cleaner** - avoid unnecessary branches
2. **If branch needed**, merge back with Merge node
3. **Position matters** - affects execution order
4. **Error handling** - use Error Trigger node
5. **Don't activate without testing** - test manually first!

---

## My Mistakes in Review Request Workflow

### What I Did Wrong:
1. Created parallel branch for "Get Review Link" 
2. Referenced it with `$('Get Review Link').first()` from main flow
3. Positions were scattered → visual mess
4. Activated without testing or permission

### The Correct Approach:
**Option A: Sequential (simplest)**
```
Schedule → Get Config → Get Appointments → ... → Build Message (uses config from earlier)
```

**Option B: Merge (if truly parallel needed)**
```
Schedule → Get Appointments → ┐
                              ├→ Merge → Build Message
Schedule → Get Config ────────┘
```

**Option C: Include in same node**
- Get config inside the "Build Message" node itself using Code node or additional Supabase call

---

## Rules for Future

1. **Always test manually before activating**
2. **Keep flow linear when possible**
3. **Use Merge node when combining branches**
4. **Check positions make visual sense**
5. **Ask before activating production workflows**
6. **Read n8n docs BEFORE making changes**

---

---

## n8n-MCP Database Access

Installed n8n-mcp and created lookup tool at:
`/home/node/openclaw/tools/n8n-lookup.js`

### Usage:
```bash
node n8n-lookup.js search <query>     # Search nodes
node n8n-lookup.js node <node-type>   # Get node details
node n8n-lookup.js props <node-type>  # Get properties schema
node n8n-lookup.js templates <query>  # Search templates
```

### Database location:
`/home/node/.npm/_npx/b6a381d62ce0fe56/node_modules/n8n-mcp/data/nodes.db`

### Stats:
- 803 nodes documented
- 2,737 templates indexed
- Full properties schemas available

---

## Key Nodes I Learned About

### Set Node (n8n-nodes-base.set)
- Mode: `manual` (default) or `raw`
- Use `assignments.assignments` array for fields
- Each assignment has: id, name, type, value
- `include` option: all, none, selected, except

### Merge Node (n8n-nodes-base.merge)
- **Modes:**
  - `append` - Keep all data from all inputs (default)
  - `combine` - Combine by fields/position/all
  - `combineBySql` - Use SQL to join
  - `chooseBranch` - Pick which branch to use
- **Combine By:**
  - combineByFields - Match on specific fields
  - combineByPosition - Match by array index
  - combineAll - Cartesian product
- **Supports 2-10 inputs** (since n8n 1.49.0)

### Supabase Node (n8n-nodes-base.supabase)
- Operations: create, delete, get, getAll, update
- Parameters: tableId, filterType (manual/string), filterString
- Uses credentials: supabaseApi

---

*Last updated: 2026-02-04*
