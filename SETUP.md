# Memory MCP Server Setup Guide

> Complete step-by-step setup for memory-mcp-sql on OpenClaw
> Based on: https://github.com/dgpl-test/memory-mcp-sql
> Updated: 2026-03-22

---

## Prerequisites

- Node.js 18+ (check: `node --version`)
- npm or pnpm
- Git
- OpenClaw installed and running
- GitHub account with repo access (for private repos)

---

## Step 1: Clone the Repository

```bash
# Clone to workspace
cd /root/.openclaw/workspace
git clone https://github.com/dgpl-test/memory-mcp-sql.git
```

**Or via SSH (if SSH keys configured):**
```bash
git clone git@github.com:dgpl-test/memory-mcp-sql.git
```

**⚠️ DEBUG:** If clone fails with "Permission denied":
- Check GitHub authentication: `gh auth status`
- Login if needed: `gh auth login`
- For private repos, ensure you have access rights

---

## Step 2: Install Dependencies

```bash
cd memory-mcp-sql
npm install
```

**Expected Output:**
```
added 150 packages in 30s
...
3 high severity vulnerabilities (run `npm audit fix`)
```

**⚠️ DEBUG:** If node_modules already exists and you get errors:
```bash
rm -rf node_modules package-lock.json
npm install
```

---

## Step 3: Build the Project

```bash
npm run build
```

**Expected Output:**
```
> memory-mcp@1.0.5 build
> tsc
```

**⚠️ DEBUG:** If TypeScript errors occur:
- Check Node version: `node --version` (needs 18+)
- Clear build cache: `rm -rf build && npm run build`

---

## Step 4: Database Setup

### Option A: Use Existing Database

If you already have a database file:
```bash
# Create symlink to workspace config directory
ln -sf /root/.openclaw/workspace/config/memory_mcp.db /root/.openclaw/workspace/memory-mcp-sql/memory_mcp.db
```

### Option B: Initialize New Database

```bash
# Run migrations (if available)
npm run migrate
# Or start the server to auto-initialize
node build/index.js
```

**Database Location:**
- Default: `./memory_mcp.db`
- OpenClaw config: `/root/.openclaw/workspace/config/memory_mcp.db`

**⚠️ DEBUG:** If database errors:
- Check file permissions: `ls -la memory_mcp.db`
- Ensure directory exists: `ls -la /root/.openclaw/workspace/config/`
- Create directory if missing: `mkdir -p /root/.openclaw/workspace/config`

---

## Step 5: Configure OpenClaw

**⚠️ IMPORTANT: defer_loading must be true for tools to work:**
```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/root/.openclaw/workspace/memory-mcp-sql/build/index.js"],
      "env": {},
      "defer_loading": true
    }
  }
}
```

### Check OpenClaw Config Path

```bash
# Find config location
openclaw status
# Look for "Config (cli):" and "Config (service):"
```

### Add MCP Server to Config

Edit OpenClaw config (usually `~/.openclaw/openclaw.json`):

```json
{
  "mcp": {
    "memory": {
      "command": "node",
      "args": ["/root/.openclaw/workspace/memory-mcp-sql/build/index.js"],
      "env": {}
    }
  }
}
```

**Alternative via mcporter:**
```bash
# Copy config to workspace
mkdir -p /root/.openclaw/workspace/config
cp /root/.openclaw/config/mcporter.json /root/.openclaw/workspace/config/mcporter.json
```

**⚠️ DEBUG:** If config not found:
```bash
# Create config directory
mkdir -p /root/.openclaw/workspace/config
# Check where config should be
ls -la ~/.openclaw/
```

---

## Step 6: Restart Gateway

```bash
# Restart OpenClaw gateway
openclaw gateway restart
```

**Or via gateway tool:**
```bash
# Use gateway restart action
```

**⚠️ DEBUG:** If gateway won't restart:
```bash
# Check if gateway is running
openclaw status
# Manually restart
pkill -f openclaw
openclaw gateway start
```

---

## Step 7: Verify Installation

### Check MCP Server

```bash
# List available servers
mcporter list

# Check specific server tools
mcporter list memory
```

### Test Memory Operations

```bash
# Test 1: Store a memory
mcporter call memory.memory op=remember userId="test" projectId="test" userMessage="Test" agentMessage="Success"

# Test 2: Get stats
mcporter call memory.memory op=stats userId="test"

# Test 3: Get recent memories
mcporter call memory.memory op=recent userId="test"
```

**Expected for Test 1:**
```json
{
  "success": true,
  "id": "mem_xxxx_xxx",
  "intent": "general",
  ...
}
```

**⚠️ DEBUG:** If tools not found:
- Check if server is registered: `mcporter list`
- Verify gateway restarted: `openclaw status`
- Check server logs by running manually:
  ```bash
  cd /root/.openclaw/workspace/memory-mcp-sql
  node build/index.js
  # Server should output: "Starting Memory MCP..."
  ```

---

## Available Operations

### Memory Operations
| Op | Description | Required Params |
|----|-------------|-----------------|
| `remember` | Store new memory | userId, projectId, userMessage, agentMessage |
| `recall` | Search memories | userId, query |
| `history` | Get conversation history | userId, sessionId |
| `context` | Get context for session | userId, sessionId |
| `stats` | Get memory statistics | userId |
| `cleanup` | Cleanup old memories | userId |
| `boost` | Boost memory priority | userId, memoryId |
| `pin` | Pin important memory | userId, memoryId |
| `inspect` | Inspect specific memory | userId, memoryId |
| `export` | Export all memories | userId |
| `import` | Import memories | userId, data |
| `insights` | Get insights | userId |
| `trim` | Trim memories to limit | userId, limit |
| `analytics` | Get analytics | userId |
| `link` | Link memories | userId, memoryId1, memoryId2 |
| `all` | Get all memories | userId |
| `recent` | Get recent memories | userId |
| `search` | Search memories | userId, query |

### Entity Operations
| Op | Description |
|----|-------------|
| `create` | Create new entity |
| `get` | Get entity by ID |
| `update` | Update entity |
| `delete` | Delete entity |
| `search` | Search entities |

### Relation Operations
| Op | Description |
|----|-------------|
| `create` | Create relationship |
| `get` | Get relations |
| `search` | Search relations |

### Project Operations
| Op | Description |
|----|-------------|
| `create` | Create project |
| `get` | Get project |
| `update` | Update project |
| `delete` | Delete project |
| `list` | List projects |

### Session Operations
| Op | Description |
|----|-------------|
| `create` | Create session |
| `get` | Get session |
| `update` | Update session |
| `list` | List sessions |

---

## Troubleshooting Guide

### Problem: "Unknown tool" Error

**Cause:** MCP server not registered or gateway not restarted

**Solution:**
1. Check server registration: `mcporter list memory`
2. Restart gateway: `openclaw gateway restart`
3. Wait 10+ seconds for restart
4. Test again: `mcporter call memory.memory op=stats userId="test"`

### Problem: Database Path Issues

**Cause:** Database file in wrong location

**Solution:**
```bash
# Check where database is expected
ls -la /root/.openclaw/workspace/memory-mcp-sql/memory_mcp.db

# Check actual database location
ls -la /root/.openclaw/workspace/config/memory_mcp.db

# Create symlink if needed
ln -sf /root/.openclaw/workspace/config/memory_mcp.db /root/.openclaw/workspace/memory-mcp-sql/memory_mcp.db
```

### Problem: Vector Search Not Working

**Cause:** sqlite-vss or sqlite-vec not installed

**Solution:**
```bash
# Check if extensions are available
cd /root/.openclaw/workspace/memory-mcp-sql
node -e "try { require('sqlite-vss'); console.log('sqlite-vss OK'); } catch(e) { console.log('sqlite-vss missing'); }"
node -e "try { require('sqlite-vec'); console.log('sqlite-vec OK'); } catch(e) { console.log('sqlite-vec missing'); }"

# If missing, reinstall
npm install sqlite-vss sqlite-vec
npm run build
```

### Problem: Gateway Service Issues

**Cause:** OpenClaw service not configured properly

**Solution:**
```bash
# Check service status
systemctl status openclaw

# Or if using file-based config
cat ~/.openclaw/openclaw.json | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin), indent=2))"
```

### Problem: Permission Denied on Clone

**Cause:** No GitHub access or repo is private

**Solution:**
```bash
# Check GitHub auth
gh auth status

# If not logged in
gh auth login

# For private repos, ensure you have access
gh repo clone dgpl-test/memory-mcp-sql
```

---

## Quick Reference

### Common Commands

```bash
# Clone
git clone https://github.com/dgpl-test/memory-mcp-sql.git

# Install & Build
cd memory-mcp-sql
npm install
npm run build

# Database symlink
ln -sf /root/.openclaw/workspace/config/memory_mcp.db /root/.openclaw/workspace/memory-mcp-sql/memory_mcp.db

# Restart gateway
openclaw gateway restart

# Test
mcporter call memory.memory op=stats userId="test"
```

### File Locations

| File/Directory | Path |
|----------------|------|
| Memory MCP Repo | `/root/.openclaw/workspace/memory-mcp-sql/` |
| Database | `/root/.openclaw/workspace/config/memory_mcp.db` |
| OpenClaw Config | `~/.openclaw/openclaw.json` |
| Gateway Logs | `/tmp/openclaw/openclaw-YYYY-MM-DD.log` |

---

## Environment Variables (Optional)

Create `.env` file for custom configuration:

```env
# Tool prefix (default: memory)
TOOL_PREFIX=memory

# Short-term memory settings
MAX_SHORT_TERM_CHATS=10
SHORT_TERM_THRESHOLD=20

# Long-term memory settings
LONG_TERM_THRESHOLD=75
MAX_LONG_TERM_MEMORIES=1000

# Auto-summarization
AUTO_SUMMARIZE_AFTER_CHATS=20
INCREMENTAL_SUMMARIZE=true

# Search settings
DEFAULT_SEARCH_LIMIT=10
```

---

## Support

For issues or questions:
1. Check GitHub repo: https://github.com/dgpl-test/memory-mcp-sql
2. Review MEMORY_TOOLS.md in repo for tool documentation
3. Check OpenClaw logs: `tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log`
