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

function Write-FixtureConfig([string] $Path, [string] $Version) {
  $config = @{
    version = $Version
    bundle = @{
      resources = @()
      externalBin = @()
      windows = @{ signCommand = $null; webviewInstallMode = @{ type = "skip" } }
    }
  } | ConvertTo-Json -Depth 8
  [IO.File]::WriteAllText($Path, $config, [Text.UTF8Encoding]::new($false))
}

function Build-Fixture([string] $Label, [string] $Version, [string] $Payload) {
  $configPath = Join-Path $fixtureDir "$Label.json"
  Write-FixtureConfig $configPath $Version
  Copy-Item -LiteralPath $Payload -Destination (Join-Path $releaseDir "screenpipe-app.exe") -Force
  & bun scripts/native-build-queue.ts enterprise-bundle --config $configPath | Out-Host
  if ($LASTEXITCODE) { throw "fixture $Label bundle failed: $LASTEXITCODE" }
  $built = Get-ChildItem $bundleDir -Filter "screenpipe enterprise_${Version}_x64-setup.exe" | Select-Object -First 1
  if (-not $built) { throw "fixture $Label installer was not produced" }
  $out = Join-Path $fixtureDir "screenpipe-enterprise-$Label.exe"
  Copy-Item -LiteralPath $built.FullName -Destination $out -Force
  return $out
}

$installerA = Join-Path $fixtureDir "screenpipe-enterprise-A.exe"
$installerB = Join-Path $fixtureDir "screenpipe-enterprise-B.exe"
if (-not $InstallOnly) {
  Push-Location $appRoot
  try {
    $installerA = Build-Fixture "A" "91.0.0" "$env:WINDIR\System32\where.exe"
    $installerB = Build-Fixture "B" "92.0.0" "$env:WINDIR\System32\whoami.exe"
  } finally {
    Pop-Location
  }
}

if ($CompileOnly) { return }

$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$profileKey = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$sid"
$userProfile = (Get-ItemPropertyValue $profileKey ProfileImagePath)
$localAppData = Join-Path $userProfile "AppData\Local"
# CreateProcessWithLogonW callers can accidentally inherit the launching
# account's environment. Give NSIS the paths belonging to the actual token.
$env:USERPROFILE = $userProfile
$env:HOME = $userProfile
$env:LOCALAPPDATA = $localAppData
$env:APPDATA = Join-Path $userProfile "AppData\Roaming"
$installDir = Join-Path $localAppData "Screenpipe fixture ü space"
$dataDir = Join-Path $userProfile ".screenpipe"
$sentinel = Join-Path $dataDir "installer-acceptance-sentinel.txt"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
[IO.File]::WriteAllText($sentinel, "fixture only", [Text.UTF8Encoding]::new($false))

function Invoke-Installer([string] $Path, [string[]] $Arguments) {
  $process = Start-Process -FilePath $Path -ArgumentList $Arguments -Wait -PassThru
  if ($process.ExitCode) { throw "$Path exited $($process.ExitCode)" }
}

Invoke-Installer $installerA @("/S", "/D=$installDir")
$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\screenpipe enterprise"
$registeredA = Get-ItemProperty $uninstallKey
if ($registeredA.DisplayVersion -ne "91.0.0" -or $registeredA.InstallLocation.Trim('"') -ne $installDir) {
  throw "A registry scope/version/path mismatch"
}
$hashA = (Get-FileHash (Join-Path $installDir "screenpipe-app.exe") -Algorithm SHA256).Hash

# Matches Tauri's normal update mode; /D is final by NSIS contract.
Invoke-Installer $installerB @("/S", "/P", "/UPDATE", "/D=$installDir")
$registeredB = Get-ItemProperty $uninstallKey
$hashB = (Get-FileHash (Join-Path $installDir "screenpipe-app.exe") -Algorithm SHA256).Hash
if ($registeredB.DisplayVersion -ne "92.0.0" -or $hashA -eq $hashB) {
  throw "B did not replace A with distinct version and bytes"
}
if (-not (Test-Path -LiteralPath $sentinel)) { throw "actual app-data sentinel was removed" }
if (Test-Path "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\screenpipe enterprise") {
  throw "per-user fixture created a duplicate HKLM registration"
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
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $ResultsDir "per-user-native-result.json") -Encoding utf8
