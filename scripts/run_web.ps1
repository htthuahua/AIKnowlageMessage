param(
    [switch]$StopOnly
)

$ErrorActionPreference = "SilentlyContinue"
$Root = Split-Path $PSScriptRoot -Parent
$RunDir = Join-Path $Root ".run"
$PidFile = Join-Path $RunDir "web_app.pid"
$Port = 5000

function Stop-PortListeners {
    param([int]$ListenPort)
    $lines = netstat -ano | Select-String ":$ListenPort\s" | Select-String "LISTENING"
    foreach ($line in $lines) {
        $parts = ($line.ToString().Trim() -split "\s+") | Where-Object { $_ }
        if ($parts.Count -ge 1) {
            $procId = $parts[-1]
            if ($procId -match "^\d+$") {
                Write-Host "Stop port $ListenPort PID $procId"
                Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

function Stop-WebServer {
    Write-Host ""
    Write-Host "[cleanup] stopping web server..."
    if (Test-Path $PidFile) {
        $ids = Get-Content $PidFile -ErrorAction SilentlyContinue
        foreach ($procId in $ids) {
            if ("$procId" -match "^\d+$") {
                Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue
            }
        }
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }
    Stop-PortListeners -ListenPort $Port
    Write-Host "[cleanup] done"
}

if ($StopOnly) {
    Stop-WebServer
    exit 0
}

Write-Host "[ERROR] run_web.ps1 no longer starts the server."
Write-Host "Use start.bat instead."
exit 1
