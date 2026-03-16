#!/bin/bash

cd /save_data/projects/linux-admin-agent/ext/memory-mcp-sql

test_tool() {
    local name=$1
    local args=$2
    echo "--- $name ---"
    result=$(echo "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$name\",\"arguments\":$args}}" | timeout 2 node build/index.js 2>&1 | head -5)
    echo "$result" | grep -o '"text":"[^"]*' | head -1
    echo ""
}

echo "========================================"
echo "Testing with CORRECT Tool Names"
echo "========================================"

# Correct MCP tools
test_tool "plan_task" '{"projectId":"proj_xxx","userId":"test","title":"Test Task","description":"desc"}'
test_tool "complete_task" '{"id":"task_xxx"}'
test_tool "forget_task" '{"id":"task_xxx"}'
test_tool "plan_workflow" '{"projectId":"proj_xxx","userId":"test","name":"Test Workflow"}'
test_tool "remember_keypoint" '{"projectId":"proj_xxx","userId":"test","content":"Test keypoint"}'
test_tool "add_thought" '{"projectId":"proj_xxx","userId":"test","content":"Test thought"}'
test_tool "remember_note" '{"projectId":"proj_xxx","userId":"test","content":"Test note"}'
test_tool "remember_discovery" '{"projectId":"proj_xxx","userId":"test","description":"Test discovery"}'
test_tool "remember_mistake" '{"projectId":"proj_xxx","userId":"test","description":"Test mistake"}'
test_tool "remember_learning" '{"projectId":"proj_xxx","userId":"test","insight":"Test learning"}'
test_tool "remember_boundary" '{"taskId":"task_xxx","userId":"test","boundary":"Test boundary"}'
test_tool "add_tool_schema" '{"toolId":"tool_xxx","userId":"test","schema":{}}'
test_tool "get_tool_schema" '{"toolId":"tool_xxx","userId":"test"}'
test_tool "memorize" '{"userId":"test","content":"Test memorize"}'

# Correct Project tools
test_tool "create_epic" '{"userId":"test","projectId":"proj1","name":"Test Epic"}'
test_tool "set_file_meta" '{"userId":"test","projectId":"proj1","filePath":"/test.js","metadata":{}}'
test_tool "set_next_steps" '{"userId":"test","projectId":"proj1","steps":["step1","step2"]}'
test_tool "get_next_steps" '{"userId":"test","projectId":"proj1"}'
test_tool "store_insight" '{"userId":"test","projectId":"proj1","insight":"Test insight"}'

# Self Improvement tools
test_tool "reflect_on_task" '{"taskId":"task_xxx","userId":"test"}'
test_tool "log_error_and_recover" '{"userId":"test","error":"Test error","recovery":"recovery"}'
test_tool "analyze_mistake_patterns" '{"userId":"test"}'
test_tool "suggest_self_improvement" '{"userId":"test"}'
test_tool "review_learnings" '{"userId":"test","limit":5}'
test_tool "dismiss_improvement_suggestion" '{"suggestionId":"sug_xxx","userId":"test"}'

# Working Buffer tools
test_tool "start_working_buffer" '{"userId":"test","projectId":"proj1","taskId":"task_xxx","description":"Working on something"}'
test_tool "update_working_buffer" '{"bufferId":"buf_xxx","userId":"test","update":"Updated status"}'
test_tool "complete_working_buffer" '{"bufferId":"buf_xxx","userId":"test"}'
test_tool "list_working_buffers" '{"userId":"test","projectId":"proj1"}'
test_tool "abort_working_buffer" '{"bufferId":"buf_xxx","userId":"test","reason":"Aborted"}'

# Context tools
test_tool "add_chat_message" '{"userId":"test","projectId":"proj1","sessionId":"sess1","role":"user","content":"Hello"}'
test_tool "compress_summary" '{"userId":"test","projectId":"proj1","sessionId":"sess1"}'

# Other tools
test_tool "find_path" '{"userId":"test","projectId":"proj1","fromEntityId":"e1","toEntityId":"e2"}'
test_tool "get_project_timeline" '{"userId":"test","projectId":"proj1"}'
test_tool "maintenance_optimize_local_db" '{}'
test_tool "add_subtask" '{"taskId":"task_xxx","userId":"test","title":"Subtask"}'
test_tool "complete_subtask" '{"subtaskId":"st_xxx"}'

echo "========================================"
echo "ALL TESTS DONE!"
echo "========================================"
