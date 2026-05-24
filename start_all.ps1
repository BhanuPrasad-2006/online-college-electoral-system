# Script to start all college election services simultaneously in separate windows
Write-Host "Starting Backend Service on Port 8000..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; if (Test-Path ..\..\.venv\Scripts\activate.ps1) { ..\..\.venv\Scripts\activate.ps1 } else { Write-Host 'Warning: venv not found.' }; uvicorn main:app --reload --port 8000"

Write-Host "Starting AI Service on Port 8001..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd ai_service; if (Test-Path ..\..\.venv\Scripts\activate.ps1) { ..\..\.venv\Scripts\activate.ps1 } else { Write-Host 'Warning: venv not found.' }; uvicorn main:app --reload --port 8001"

Write-Host "Starting Frontend Server..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev"

Write-Host "All servers launched!"
