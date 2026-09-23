param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimeDir = Join-Path $projectRoot '.runtime'
$port = if ($env:FMM_PORT) { [int]$env:FMM_PORT } else { 4173 }
$url = "http://127.0.0.1:$port"
$browserCandidates = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$browserPath = $browserCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $browserPath) { throw 'Microsoft Edge or Google Chrome is required for the window without an address bar.' }
function Get-FmmHealth {
  try { return (Invoke-RestMethod -Uri "$url/health" -TimeoutSec 2).app -eq 'fmm-terrain-studio' }
  catch { return $false }
}
if (-not (Get-FmmHealth)) {
  New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
  $nodePath = (Get-Command node.exe).Source
  $serverPath = Join-Path $projectRoot 'server.mjs'
  $process = Start-Process -FilePath $nodePath -ArgumentList "`"$serverPath`"" -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'server.log') -RedirectStandardError (Join-Path $runtimeDir 'server-error.log')
  $process.Id | Set-Content -LiteralPath (Join-Path $runtimeDir 'server.pid')
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) { if (Get-FmmHealth) { $ready = $true; break }; Start-Sleep -Milliseconds 200 }
  if (-not $ready) { throw "FMM could not start on port $port. Check .runtime\server-error.log, or set FMM_PORT to another port." }
}
if ($CheckOnly) { Write-Output "Launcher ready: $url; browser: $browserPath"; exit 0 }
# This visible window is the desktop-style editor explicitly requested by the user.
$profilePath = Join-Path $runtimeDir 'browser-profile'
Start-Process -FilePath $browserPath -ArgumentList @("--app=$url", "--user-data-dir=`"$profilePath`"", '--window-size=1600,1000', '--no-first-run', '--no-default-browser-check')
