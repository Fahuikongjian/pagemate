$ErrorActionPreference = 'Stop'
$projectDir = $PSScriptRoot
$pidFile = Join-Path $projectDir 'data/server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Host 'No background service started by the launcher was found.'; exit 0 }
$serviceId = [int](Get-Content -LiteralPath $pidFile)
$processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $serviceId" -ErrorAction SilentlyContinue
if ($null -eq $processInfo) { Write-Host 'The service is already stopped.'; exit 0 }
if ($processInfo.Name -ne 'node.exe' -or $processInfo.CommandLine -notlike '*server/index.ts*') { throw 'PID no longer belongs to PageMate; refusing to stop it.' }
Stop-Process -Id $serviceId
Remove-Item -LiteralPath $pidFile
Write-Host 'PageMate stopped.'
