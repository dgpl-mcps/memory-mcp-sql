#!/bin/bash

# Start server in background
node build/index.js &
SERVER_PID=$!

sleep 2

echo "=== Testing JSON-RPC calls ==="

# Test 1: List tools
echo -e "\n--- 1. List Tools ---"
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node build/index.js 2>&1 | head -50

# Test 2: global_memory_search
echo -e "\n--- 2. global_memory_search ---"
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"global_memory_search","arguments":{"query":"test"}}}' | node build/index.js 2>&1

# Test 3: search_short_term_memory
echo -e "\n--- 3. search_short_term_memory ---"
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_short_term_memory","arguments":{"userId":"test","projectId":"test","query":"hello"}}}' | node build/index.js 2>&1

# Test 4: memory_recall
echo -e "\n--- 4. memory_recall ---"
echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"memory_recall","arguments":{"userId":"test","query":"test"}}}' | node build/index.js 2>&1

# Test 5: memory_fuzzy_recall
echo -e "\n--- 5. memory_fuzzy_recall ---"
echo '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"memory_fuzzy_recall","arguments":{"userId":"test","query":"hello"}}}' | node build/index.js 2>&1

# Test 6: search_graph
echo -e "\n--- 6. search_graph ---"
echo '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"search_graph","arguments":{"userId":"test","projectId":"test"}}}' | node build/index.js 2>&1

# Test 7: memory_context
echo -e "\n--- 7. memory_context ---"
echo '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"memory_context","arguments":{"userId":"test","sessionId":"test"}}}' | node build/index.js 2>&1

# Test 8: memory_history
echo -e "\n--- 8. memory_history ---"
echo '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"memory_history","arguments":{"userId":"test","sessionId":"test"}}}' | node build/index.js 2>&1

# Test 9: recall
echo -e "\n--- 9. recall ---"
echo '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"recall","arguments":{"userId":"test","query":"test"}}}' | node build/index.js 2>&1

# Test 10: search_tools
echo -e "\n--- 10. search_tools ---"
echo '{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"search_tools","arguments":{"userId":"test","query":"memory"}}}' | node build/index.js 2>&1

# Test 11: search_insights
echo -e "\n--- 11. search_insights ---"
echo '{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"search_insights","arguments":{"userId":"test","projectId":"test","keyword":"test"}}}' | node build/index.js 2>&1

# Test 12: list_short_term_memory
echo -e "\n--- 12. list_short_term_memory ---"
echo '{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"list_short_term_memory","arguments":{"userId":"test","projectId":"test"}}}' | node build/index.js 2>&1

# Test 13: memory_search_by_date
echo -e "\n--- 13. memory_search_by_date ---"
echo '{"jsonrpc":"2.0","id":13,"method":"tools/call","params":{"name":"memory_search_by_date","arguments":{"userId":"test","startDate":"2024-01-01","endDate":"2024-12-31"}}}' | node build/index.js 2>&1

# Test 14: memory_search_by_tag
echo -e "\n--- 14. memory_search_by_tag ---"
echo '{"jsonrpc":"2.0","id":14,"method":"tools/call","params":{"name":"memory_search_by_tag","arguments":{"userId":"test","tag":"important"}}}' | node build/index.js 2>&1

kill $SERVER_PID 2>/dev/null
echo -e "\n=== Tests Complete ==="
