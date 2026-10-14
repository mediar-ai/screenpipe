# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com

<#
.SYNOPSIS
Focused disposable-VM acceptance test for windows-migrate-enterprise-to-user.ps1.

.DESCRIPTION
Run elevated in PowerShell 7 after building fixtures with
apps/screenpipe-app-tauri/scripts/windows-enterprise-installer.integration.ps1
and signing them with a disposable test code-signing certificate whose subject
is Mediar, Inc. The standard TargetUser must be signed in normally. This test
never enables an unsigned-fixture bypass in the production migration tool.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $TargetUser,
  [Parameter(Mandatory)] [string] $LegacyInstallerA,
  [Parameter(Mandatory)] [string] $InstallerB,
  [Parameter(Mandatory)] [string] $InstallerC,
  [Parameter(Mandatory)] [string] $ResultsDir
)

$ErrorActionPreference = 'Stop'
$migration = Join-Path $PSScriptRoot 'windows-migrate-enterprise-to-user.ps1'
$target = (New-Object Security.Principal.NTAccount($TargetUser)).Translate([Security.Principal.SecurityIdentifier])
$profile = [Environment]::ExpandEnvironmentVariables([string](Get-ItemPropertyValue "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$target" ProfileImagePath))
$machineDir = Join-Path $env:ProgramData 'Screenpipe migration legacy A space'
$userDir = Join-Path $profile 'AppData\Local\Screenpipe migrated path with spaces'
$sentinel = Join-Path $profile '.screenpipe\migration-sentinel.txt'
$key = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\screenpipe enterprise'
New-Item -ItemType Directory -Force -Path $ResultsDir,(Split-Path -Parent $sentinel) | Out-Null
Set-Content -LiteralPath $sentinel -Value 'preserve-me'

function Invoke-Setup([string]$Path,[string[]]$Arguments) {
  $p = Start-Process -FilePath $Path -ArgumentList $Arguments -Wait -PassThru
  if ($p.ExitCode) { throw "$Path exited $($p.ExitCode)" }
}
function Assert([bool]$Condition,[string]$Message) { if (-not $Condition) { throw $Message } }
function Target-Uninstall {
  Get-ItemProperty "Registry::HKEY_USERS\$target\$key" -ErrorAction SilentlyContinue
}

Invoke-Setup $LegacyInstallerA @('/S',('/D=' + $machineDir))
$before = Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\screenpipe enterprise'
$hashA = (Get-FileHash (Join-Path $machineDir 'screenpipe-app.exe')).Hash
$hashBInstaller = (Get-FileHash $InstallerB).Hash

$badHashRejected = $false
try { & $migration -TargetUser $TargetUser -InstallerPath $InstallerB -InstallerSha256 ('0' * 64) -InstallDirectory $userDir -Confirm:$false }
catch { $badHashRejected = $_.Exception.Message -match 'SHA-256' }
Assert $badHashRejected 'bad hash was not rejected'
Assert ((Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\screenpipe enterprise').DisplayVersion -eq $before.DisplayVersion) 'bad hash changed machine install'

$tasksBefore = @(Get-ScheduledTask -TaskPath '\Screenpipe\' -ErrorAction SilentlyContinue).Count
& $migration -TargetUser $TargetUser -InstallerPath $InstallerB -InstallerSha256 $hashBInstaller -InstallDirectory $userDir -WhatIf
Assert (@(Get-ScheduledTask -TaskPath '\Screenpipe\' -ErrorAction SilentlyContinue).Count -eq $tasksBefore) 'WhatIf changed scheduled tasks'
Assert ((Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\screenpipe enterprise').DisplayVersion -eq $before.DisplayVersion) 'WhatIf changed machine install'

& $migration -TargetUser $TargetUser -InstallerPath $InstallerB -InstallerSha256 $hashBInstaller -InstallDirectory $userDir -Confirm:$false
$registeredB = Target-Uninstall
Assert ($null -ne $registeredB) 'target HKU registration missing after migration'
Assert ($registeredB.InstallLocation.Trim('"') -eq $userDir) 'target install path mismatch'
Assert (-not (Test-Path 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\screenpipe enterprise')) 'HKLM registration remains'
Assert (Test-Path $sentinel) 'data sentinel was removed'
$hashB = (Get-FileHash (Join-Path $userDir 'screenpipe-app.exe')).Hash
Assert ($hashA -ne $hashB) 'payload A was not replaced by B'

# A normal subsequent update runs entirely as TargetUser; invoke this harness
# from that user's interactive PowerShell for this final step when proving C.
$updateCommand = "& '$InstallerC' /S /P /UPDATE"

[pscustomobject]@{
  TargetSid = $target.Value
  MachineVersionA = $before.DisplayVersion
  UserVersionB = $registeredB.DisplayVersion
  PayloadHashA = $hashA
  PayloadHashB = $hashB
  SentinelPreserved = Test-Path $sentinel
  BadHashRejectedBeforeMutation = $badHashRejected
  SubsequentTargetUserUpdateCommand = $updateCommand
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $ResultsDir 'migration-integration-result.json') -Encoding UTF8
