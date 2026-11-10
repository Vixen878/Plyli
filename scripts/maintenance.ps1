$ErrorActionPreference = 'Stop'
$plyliRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $plyliRoot
$plyliLogDirectory = Join-Path $plyliRoot '.tmp\maintenance'
New-Item -Path $plyliLogDirectory -ItemType Directory -Force | Out-Null
$plyliLog = Join-Path $plyliLogDirectory ('maintenance-' + (Get-Date -Format 'yyyy-MM-dd') + '.log')
try {
  & node --env-file=.env --import tsx scripts/maintenance.ts 2>&1 | Out-File -LiteralPath $plyliLog -Append
  if ($LASTEXITCODE -ne 0) { throw 'Maintenance failed. Backup/restore verification must succeed before retention can run.' }
} catch {
  $_.Exception.Message | Out-File -LiteralPath $plyliLog -Append
  exit 1
}
