param([string]$At = '03:00')
$ErrorActionPreference = 'Stop'
$plyliRoot = Split-Path -Parent $PSScriptRoot
if ($At -notmatch '^([01]\d|2[0-3]):[0-5]\d$') { throw 'Use a local daily run time in HH:mm format.' }
$plyliAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "' + (Join-Path $PSScriptRoot 'maintenance.ps1') + '"') -WorkingDirectory $plyliRoot
$plyliTrigger = New-ScheduledTaskTrigger -Daily -At $At
$plyliSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName 'Plyli daily encrypted backup and retention' -Action $plyliAction -Trigger $plyliTrigger -Settings $plyliSettings -Description 'Local Plyli database backup (AES-256-GCM), integrity verification, seven-day backup retention, and owner-configured response retention. Runs as the current user.' -Force | Select-Object TaskName,State
