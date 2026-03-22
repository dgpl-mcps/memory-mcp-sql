# MCPorter Setup Guide

## Installation
```bash
npm install -g mcporter
```

## Configuration
Create `~/.openclaw/workspace/config/mcporter.json`:

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

## Important: defer_loading
**Required:** Set `"defer_loading": true` — without this, tools won't be discovered properly.

## Quick Test
```bash
# List servers
mcporter list

# Test memory
mcporter call memory.memory userId="test" op="recent" limit=5
```

## Debug
```bash
# Check health
mcporter call memory.memory userId="test" op="stats"
```
