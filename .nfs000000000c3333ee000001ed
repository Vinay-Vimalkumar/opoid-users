#!/bin/bash
# Start both backend and frontend dev servers
echo "Starting DrugDiffuse..."
echo "API: http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo ""

# Start API in background
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload &
API_PID=$!

# Start frontend dev server
cd frontend && npm run dev &
FRONTEND_PID=$!

echo "Press Ctrl+C to stop both servers"
trap "kill $API_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
