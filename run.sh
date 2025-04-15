#!/bin/bash

echo "Starting backend server..."
cd backend

python -m uvicorn src.main:app --host 127.0.0.1 --port 8000 --workers 1 &

BACKEND_PID=$!
echo "Backend server started with PID: $BACKEND_PID"

echo "Starting frontend server..."
cd ../frontend
npm run dev

echo "Stopping backend server..."
kill $BACKEND_PID 
