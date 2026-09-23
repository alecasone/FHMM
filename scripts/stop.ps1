$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pidFile = Join-Path $projectRoot '.runtime/server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output 'No launcher-managed server is running.'; exit 0 }
$serverProcessId = [int](Get-Content -LiteralPath $pidFile)
$serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $serverProcessId"
$expected = Join-Path $projectRoot 'server.mjs'
if ($serverProcess -and $serverProcess.Name -eq 'node.exe' -and $serverProcess.CommandLine.Contains($expected)) {
  Stop-Process -Id $serverProcessId
  Write-Output 'FMM local server stopped. You may close its editor window.'
} else { Write-Output 'The saved process is no longer the FMM server. Nothing was stopped.' }
Remove-Item -LiteralPath $pidFile -ErrorAction SilentlyContinue
