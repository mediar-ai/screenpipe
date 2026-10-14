# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com

<#
.SYNOPSIS
Compiles two real NSIS installers from the production Enterprise template and
exercises install, update, registry, payload, path, and uninstall behavior.

.DESCRIPTION
Run from an elevated PowerShell on a disposable Windows VM. The script uses the
repository-supported native build queue, but substitutes small Windows fixture
executables for the app payload. A and B have distinct bytes and installer
versions. It does not build or exercise the Screenpipe engine.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $ResultsDir,
  [ValidateSet("current", "machine", "legacy-machine")] [string] $Matrix = "current",
  [switch] $CompileOnly,
  [switch] $InstallOnly
)

$ErrorActionPreference = "Stop"
$appRoot = Split-Path -Parent $PSScriptRoot
$targetRoot = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $appRoot "src-tauri\target" }
$releaseDir = Join-Path $targetRoot "x86_64-pc-windows-msvc\release"
$bundleDir = Join-Path $releaseDir "bundle\nsis"
$fixtureDir = Join-Path $ResultsDir "fixture"
New-Item -ItemType Directory -Force -Path $fixtureDir, $releaseDir | Out-Null

function Write-FixtureConfig([string] $Path, [string] $Version, [bool] $LegacyMachine) {
  $config = @{
    version = $Version
    bundle = @{
      resources = @()
      externalBin = @()
      windows = @{
        signCommand = $null
        webviewInstallMode = @{ type = "skip" }
        nsis = if ($LegacyMachine) { @{ installMode = "perMachine"; template = $null } } else { @{} }
      }
    }
  } | ConvertTo-Json -Depth 8
  [IO.File]::WriteAllText($Path, $config, [Text.UTF8Encoding]::new($false))
}

function Build-Fixture([string] $Label, [string] $Version, [string] $Payload, [bool] $LegacyMachine = $false) {
  $configPath = Join-Path $fixtureDir "$Label.json"
  Write-FixtureConfig $configPath $Version $LegacyMachine
  Copy-Item -LiteralPath $Payload -Destination (Join-Path $releaseDir "screenpipe-app.exe") -Force
  if ($LegacyMachine) {
    & bun scripts/native-build-queue.ts enterprise-bundle --upstream-template --config $configPath | Out-Host
  } else {
    & bun scripts/native-build-queue.ts enterprise-bundle --config $configPath | Out-Host
  }
  if ($LASTEXITCODE) { throw "fixture $Label bundle failed: $LASTEXITCODE" }
  $built = Get-ChildItem $bundleDir -Filter "screenpipe enterprise_${Version}_x64-setup.exe" | Select-Object -First 1
  if (-not $built) { throw "fixture $Label installer was not produced" }
  $out = Join-Path $fixtureDir "screenpipe-enterprise-$Label.exe"
  Copy-Item -LiteralPath $built.FullName -Destination $out -Force
  return $out
}

$installerA = Join-Path $fixtureDir "screenpipe-enterprise-A.exe"
$installerB = Join-Path $fixtureDir "screenpipe-enterprise-B.exe"
$legacyInstallerA = Join-Path $fixtureDir "screenpipe-enterprise-legacy-machine-A.exe"
if (-not $InstallOnly) {
  Push-Location $appRoot
  try {
    $installerA = Build-Fixture "A" "91.0.0" "$env:WINDIR\System32\where.exe"
    $installerB = Build-Fixture "B" "92.0.0" "$env:WINDIR\System32\whoami.exe"
    $legacyInstallerA = Build-Fixture "legacy-machine-A" "91.0.0" "$env:WINDIR\System32\where.exe" $true
  } finally {
    Pop-Location
  }
}

if ($CompileOnly) { return }

$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$profileKey = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$sid"
$userProfile = (Get-ItemPropertyValue $profileKey ProfileImagePath)
$localAppData = Join-Path $userProfile "AppData\Local"
$installDir = if ($Matrix -eq "current") {
  Join-Path $localAppData "Screenpipe fixture ü space"
} else {
  Join-Path $env:ProgramData "Screenpipe fixture $Matrix ü space"
}
$dataDir = Join-Path $userProfile ".screenpipe"
$sentinel = Join-Path $dataDir "installer-acceptance-sentinel.txt"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
[IO.File]::WriteAllText($sentinel, "fixture only", [Text.UTF8Encoding]::new($false))

function Invoke-Installer([string] $Path, [string[]] $Arguments) {
  $process = Start-Process -FilePath $Path -ArgumentList $Arguments -Wait -PassThru
  if ($process.ExitCode) { throw "$Path exited $($process.ExitCode)" }
}

$firstInstaller = if ($Matrix -eq "legacy-machine") { $legacyInstallerA } else { $installerA }
$scopeArgs = if ($Matrix -eq "current") { @() } elseif ($Matrix -eq "machine") { @("/SPALLUSERS") } else { @() }
Invoke-Installer $firstInstaller (@("/S") + $scopeArgs + @("/D=$installDir"))
$registryRoot = if ($Matrix -eq "current") { "HKCU:" } else { "HKLM:" }
$otherRegistryRoot = if ($Matrix -eq "current") { "HKLM:" } else { "HKCU:" }
$uninstallKey = "$registryRoot\Software\Microsoft\Windows\CurrentVersion\Uninstall\screenpipe enterprise"
$registeredA = Get-ItemProperty $uninstallKey
if ($registeredA.DisplayVersion -ne "91.0.0" -or $registeredA.InstallLocation.Trim('"') -ne $installDir) {
  throw "A registry scope/version/path mismatch"
}
$hashA = (Get-FileHash (Join-Path $installDir "screenpipe-app.exe") -Algorithm SHA256).Hash

# Matches Tauri's normal update mode; /D is final by NSIS contract.
# Existing scope and destination must be detected without /D or /SPALLUSERS.
Invoke-Installer $installerB @("/S", "/P", "/UPDATE")
$registeredB = Get-ItemProperty $uninstallKey
$hashB = (Get-FileHash (Join-Path $installDir "screenpipe-app.exe") -Algorithm SHA256).Hash
if ($registeredB.DisplayVersion -ne "92.0.0" -or $hashA -eq $hashB) {
  throw "B did not replace A with distinct version and bytes"
}
if (-not (Test-Path -LiteralPath $sentinel)) { throw "actual app-data sentinel was removed" }
if (Test-Path "$otherRegistryRoot\Software\Microsoft\Windows\CurrentVersion\Uninstall\screenpipe enterprise") {
  throw "$Matrix fixture created a duplicate registration in the other scope"
}

$uninstaller = Join-Path $installDir "uninstall.exe"
$uninstall = Start-Process -FilePath $uninstaller -ArgumentList "/S" -Wait -PassThru
if ($uninstall.ExitCode) { throw "uninstaller exited $($uninstall.ExitCode)" }
for ($i = 0; $i -lt 100 -and (Test-Path -LiteralPath $uninstaller); $i++) { Start-Sleep -Milliseconds 100 }
if (Test-Path -LiteralPath $uninstaller) { throw "spawned NSIS uninstaller child did not complete" }
if (-not (Test-Path -LiteralPath $sentinel)) { throw "uninstall removed actual app-data sentinel" }

[pscustomobject]@{
  InstallPath = $installDir
  Version = $registeredB.DisplayVersion
  HashA = $hashA
  HashB = $hashB
  Sentinel = $sentinel
  Matrix = $Matrix
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $ResultsDir "$Matrix-native-result.json") -Encoding utf8
