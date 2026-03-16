#!/bin/bash

# Test all MCP tools via stdio

cd /save_data/projects/linux-admin-agent/ext/memory-mcp-sql

# Start server in background and capture output
node build/index.js > /tmp/mcp_server.log 2>&1 &
SERVER_PID=$!
sleep 2

# Function to send JSON-RPC request
test_tool() {
    local name=$1
    local args=$2
    echo "--- Testing: $name ---"
    echo "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$name\",\"arguments\":$args}}" | timeout 2 node build/index.js 2>&1 | head -100
    echo ""
}

# Test all tools
echo "========================================"
echo "Testing ALL MCP Tools"
echo "========================================"

# ====== Short Term Memory ======
echo -e "\n\n===== SHORT TERM MEMORY TOOLS ====="
test_tool "set_short_term_memory" '{"userId":"test","projectId":"proj1","key":"test_key","value":"test_value"}'
test_tool "get_short_term_memory" '{"userId":"test","projectId":"proj1","key":"test_key"}'
test_tool "search_short_term_memory" '{"userId":"test","projectId":"proj1","query":"test"}'
test_tool "list_short_term_memory" '{"userId":"test","projectId":"proj1"}'
test_tool "delete_short_term_memory" '{"userId":"test","projectId":"proj1","key":"test_key"}'

# ====== Graph Tools ======
echo -e "\n\n===== GRAPH TOOLS ====="
test_tool "create_entity" '{"userId":"test","projectId":"proj1","entityType":"Task","name":"Test Task","properties":{}}'
test_tool "read_entity" '{"userId":"test","projectId":"proj1","id":"test_id"}'
test_tool "search_graph" '{"userId":"test","projectId":"proj1"}'
test_tool "deep_search_graph" '{"userId":"test","projectId":"proj1","id":"test_id"}'
test_tool "create_relation" '{"userId":"test","projectId":"proj1","fromId":"id1","toId":"id2","relationType":"DEPENDS_ON"}'
test_tool "get_relations" '{"userId":"test","projectId":"proj1"}'
test_tool "update_entity" '{"userId":"test","projectId":"proj1","id":"test_id","name":"Updated"}'
test_tool "delete_entity" '{"userId":"test","projectId":"proj1","id":"test_id"}'

# ====== Memory Compression ======
echo -e "\n\n===== MEMORY COMPRESSION TOOLS ====="
test_tool "memory_remember" '{"userId":"test","projectId":"proj1","sessionId":"sess1","query":"test query","response":"test response"}'
test_tool "memory_recall" '{"userId":"test","query":"test"}'
test_tool "memory_history" '{"userId":"test","sessionId":"sess1"}'
test_tool "memory_context" '{"userId":"test","sessionId":"sess1"}'
test_tool "memory_boost" '{"memoryId":"mem1","delta":0.1}'
test_tool "memory_pin" '{"memoryId":"mem1","pinned":true}'
test_tool "memory_stats" '{"userId":"test"}'
test_tool "memory_cleanup" '{"userId":"test"}'
test_tool "memory_inspect" '{"memoryId":"mem1"}'
test_tool "memory_batch" '{"userId":"test","operations":[]}'
test_tool "memory_insights" '{"userId":"test","projectId":"proj1"}'
test_tool "memory_trim" '{"userId":"test","projectId":"proj1","keepCount":5}'
test_tool "memory_analytics" '{"userId":"test","projectId":"proj1"}'
test_tool "memory_export" '{"userId":"test","format":"json"}'
test_tool "memory_import" '{"userId":"test","data":{}}'
test_tool "memory_link" '{"memoryId":"mem1","sessionId":"sess1"}'
test_tool "memory_set_ttl" '{"memoryId":"mem1","ttlDays":30}'
test_tool "memory_search_by_date" '{"userId":"test","startDate":"2024-01-01","endDate":"2024-12-31"}'
test_tool "memory_tag" '{"memoryId":"mem1","tag":"important","action":"add"}'
test_tool "memory_search_by_tag" '{"userId":"test","tag":"important"}'
test_tool "memory_fuzzy_recall" '{"userId":"test","query":"test"}'
test_tool "memory_vote" '{"memoryId":"mem1","vote":"like"}'
test_tool "memory_quality" '{"memoryId":"mem1","score":5}'
test_tool "memory_best" '{"userId":"test","projectId":"proj1","limit":5}'
test_tool "memory_bulk" '{"userId":"test","memoryIds":["mem1"],"action":"pin"}'
test_tool "memory_archive" '{"memoryId":"mem1"}'
test_tool "memory_archived" '{"userId":"test"}'
test_tool "memory_remind" '{"memoryId":"mem1","remindAt":"2025-01-01T00:00:00Z","message":"Reminder"}'
test_tool "memory_reminders" '{"userId":"test"}'
test_tool "memory_merge" '{"memoryIds":["mem1","mem2"]}'

# ====== Hybrid/Global ======
echo -e "\n\n===== HYBRID/GLOBAL TOOLS ====="
test_tool "global_memory_search" '{"query":"test"}'

# ====== Document Tools ======
echo -e "\n\n===== DOCUMENT TOOLS ====="
test_tool "store_document" '{"userId":"test","projectId":"proj1","documentId":"doc1","text":"Sample document text"}'
test_tool "search_document" '{"userId":"test","projectId":"proj1","documentId":"doc1","query":"sample"}'

# ====== Project Tools ======
echo -e "\n\n===== PROJECT TOOLS ====="
test_tool "add_core_rule" '{"userId":"test","projectId":"proj1","rule":"Test rule"}'
test_tool "add_guideline" '{"userId":"test","projectId":"proj1","guideline":"Test guideline"}'
test_tool "add_best_practice" '{"userId":"test","projectId":"proj1","practice":"Test practice"}'
test_tool "add_naming_convention" '{"userId":"test","projectId":"proj1","entityType":"file","pattern":"snake_case"}'
test_tool "search_insights" '{"userId":"test","projectId":"proj1","keyword":"test"}'

# ====== MCP/Task Tools ======
echo -e "\n\n===== MCP TASK TOOLS ====="
test_tool "create_project" '{"userId":"test","name":"Test Project"}'
test_tool "list_projects" '{"userId":"test"}'
test_tool "create_task" '{"projectId":"proj1","userId":"test","title":"Test Task"}'
test_tool "list_tasks" '{"projectId":"proj1"}'
test_tool "recall_task" '{"id":"task1"}'
test_tool "update_task" '{"id":"task1","status":"done"}'
test_tool "delete_task" '{"id":"task1"}'
test_tool "create_workflow" '{"projectId":"proj1","userId":"test","name":"Test Workflow"}'
test_tool "list_workflows" '{"projectId":"proj1"}'
test_tool "recall_workflow" '{"id":"wf1"}'
test_tool "add_keypoint" '{"projectId":"proj1","userId":"test","content":"Test keypoint"}'
test_tool "add_comment" '{"projectId":"proj1","userId":"test","content":"Test comment"}'
test_tool "add_note" '{"projectId":"proj1","userId":"test","content":"Test note"}'
test_tool "add_discovery" '{"projectId":"proj1","userId":"test","description":"Test discovery"}'
test_tool "log_mistake" '{"projectId":"proj1","userId":"test","description":"Test mistake"}'
test_tool "add_learning" '{"projectId":"proj1","userId":"test","insight":"Test learning"}'
test_tool "add_task_boundary" '{"taskId":"task1","userId":"test","boundary":"Test boundary"}'
test_tool "register_tool" '{"userId":"test","name":"TestTool","description":"Test tool"}'
test_tool "search_tools" '{"userId":"test","query":"test"}'
test_tool "recall" '{"userId":"test","query":"test"}'

# ====== Context Tools ======
echo -e "\n\n===== CONTEXT TOOLS ====="
test_tool "get_chat_history" '{"userId":"test","projectId":"proj1"}'
test_tool "store_context_summary" '{"userId":"test","projectId":"proj1","summary":"Test summary"}'
test_tool "get_context_summary" '{"userId":"test","projectId":"proj1"}'

# ====== System Tools ======
echo -e "\n\n===== SYSTEM TOOLS ====="
test_tool "create_memory_snapshot" '{"userId":"test","projectId":"proj1"}'
test_tool "diagnose_memory_health" '{"userId":"test"}'

# ====== Self Improvement Tools ======
echo -e "\n\n===== SELF IMPROVEMENT TOOLS ====="
test_tool "log_mistake" '{"userId":"test","projectId":"proj1","description":"Test mistake","resolution":"Fixed"}'

# Cleanup
kill $SERVER_PID 2>/dev/null
echo -e "\n\n========================================"
echo "ALL TESTS COMPLETED"
echo "========================================"
