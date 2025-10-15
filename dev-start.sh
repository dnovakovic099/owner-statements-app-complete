#!/bin/bash

# Start the backend server in the background
echo "Starting backend server..."
npm run dev &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Start the frontend development server
echo "Starting frontend development server..."
cd frontend && npm start &
FRONTEND_PID=$!

echo "Backend running on http://localhost:3003"
echo "Frontend running on http://localhost:3000"
echo "Press Ctrl+C to stop both servers"

# Function to clean up background processes
cleanup() {
    echo "Stopping servers..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit
}

# Set trap to cleanup on script exit
trap cleanup INT TERM

# Wait for either process to finish
wait
