@echo off
echo Starting DrugDiffuse...
echo API: http://localhost:8001
echo Frontend: http://localhost:5173
echo.

start /b python -m uvicorn api.main:app --host 0.0.0.0 --port 8001 --reload
cd frontend
start /b npm run dev
cd ..

echo Both servers started. Press Ctrl+C to stop.
pause
