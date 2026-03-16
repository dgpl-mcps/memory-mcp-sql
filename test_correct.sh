#!/bin/bash

cd /save_data/projects/linux-admin-agent/ext/memory-mcp-sql

# Test tool with proper params
test_tool() {
    local name=$1
    local args=$2
    echo "--- $name ---"
    result=$(echo "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$name\",\"arguments\":$args}}" | timeout 2 node build/index.js 2>&1 | grep -o '"text":"[^"]*' | head -1)
    echo "$result"
    echo ""
}

echo "========================================"
echo "Testing with CORRECT Parameters"
echo "========================================"

# Memory Tools with correct params
test_tool "memory_remember" '{"userId":"test","projectId":"proj1","sessionId":"sess1","userMessage":"test query","agentMessage":"test response"}'
test_tool "memory_recall" '{"userId":"test","projectId":"proj1","sessionId":"sess1","query":"test"}'
test_tool "memory_fuzzy_recall" '{"userId":"test","projectId":"proj1","query":"test"}'
test_tool "memory_batch" '{"userId":"test","projectId":"proj1","sessionId":"sess1","operations":[]}'
test_tool "memory_trim" '{"userId":"test","projectId":"proj1","sessionId":"sess1","keepCount":5}'
test_tool "memory_export" '{"userId":"test","projectId":"proj1","format":"json"}'
test_tool "memory_import" '{"userId":"test","projectId":"proj1","importData":{}}'
test_tool "memory_link" '{"userId":"test","memoryId1":"mem1","memoryId2":"mem2"}'
test_tool "memory_set_ttl" '{"userId":"test","memoryId":"mem1","daysToLive":30}'
test_tool "memory_tag" '{"userId":"test","memoryId":"mem1","tags":["important"],"action":"add"}'
test_tool "memory_quality" '{"userId":"test","memoryId":"mem1","score":0.8}'
test_tool "memory_bulk" '{"userId":"test","projectId":"proj1","memoryIds":["mem1"],"operation":"pin"}'
test_tool "memory_remind" '{"userId":"test","projectId":"proj1","memoryId":"mem1","title":"Test","message":"Reminder","remindAt":"2025-12-31T00:00:00Z"}'
test_tool "memory_reminders" '{"userId":"test","projectId":"proj1"}'
test_tool "memory_merge" '{"userId":"test","targetId":"mem1","sourceId":"mem2"}'
test_tool "memory_archived" '{"userId":"test","projectId":"proj1"}'

# MCP Tools with correct params
test_tool "create_task" '{"projectId":"proj_xxx","userId":"test","title":"Test Task"}'
test_tool "delete_task" '{"id":"task_xxx"}'
test_tool "create_workflow" '{"projectId":"proj_xxx","userId":"test","name":"Test Workflow"}'
test_tool "add_keypoint" '{"projectId":"proj_xxx","userId":"test","content":"Test keypoint"}'
test_tool "add_comment" '{"projectId":"proj_xxx","userId":"test","content":"Test comment"}'
test_tool "add_note" '{"projectId":"proj_xxx","userId":"test","content":"Test note"}'
test_tool "add_discovery" '{"projectId":"proj_xxx","userId":"test","description":"Test discovery"}'
test_tool "log_mistake" '{"projectId":"proj_xxx","userId":"test","description":"Test mistake"}'
test_tool "add_learning" '{"projectId":"proj_xxx","userId":"test","insight":"Test learning"}'
test_tool "add_task_boundary" '{"taskId":"task_xxx","userId":"test","boundary":"Test boundary"}'

# Project Tools
test_tool "add_core_rule" '{"userId":"test","projectId":"proj1","rule":"Use console.log"}'
test_tool "add_todo" '{"userId":"test","projectId":"proj1","taskId":"task_1","todo":"Test todo"}'

# System Tools
test_tool "create_memory_snapshot" '{"userId":"test","projectId":"proj1","snapshotName":"test_snap"}'

echo "========================================"
echo "DONE"
echo "========================================"
