# Starts the API and the dashboard in two windows, then opens the browser.
# Usage (from this folder):  powershell -ExecutionPolicy Bypass -File .\start-demo.ps1
$root = $PSScriptRoot

Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\backend'; npm run dev"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\frontend'; npm run dev"

# Public tunnel so the QR labels open from any phone/network (the API detects its URL automatically)
if (Get-Command ngrok -ErrorAction SilentlyContinue) {
  Start-Process ngrok -ArgumentList 'http', '5173' -WindowStyle Minimized
}

Start-Sleep -Seconds 6
Start-Process 'http://localhost:5173/dashboard'
