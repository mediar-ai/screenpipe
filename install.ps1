Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy Bypass -Force

Write-Host "Installing screenpipe..." -ForegroundColor Green

try {
    Write-Host "Fetching latest release from GitHub..." -ForegroundColor Cyan
    $releases = Invoke-RestMethod "https://api.github.com/repos/mediar-ai/screenpipe/releases"
    $latestRelease = $releases | Where-Object { -not $_.prerelease } | Select-Object -First 1
    if (-not $latestRelease) {
        throw "No non-prerelease versions found in mediar-ai/screenpipe releases."
    }

    $asset = $latestRelease.assets | Where-Object { $_.name -like "*-x86_64-pc-windows-msvc.zip" } | Select-Object -First 1
    if (-not $asset) {
        throw "No Windows release found for version $($latestRelease.tag_name)."
    }

    $url = $asset.browser_download_url
    $installDir = "$env:USERPROFILE\screenpipe"
    $tempZip = "$env:TEMP\screenpipe.zip"

    Write-Host "Downloading version $($latestRelease.tag_name) from $url..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $url -OutFile $tempZip -UseBasicParsing

    if (Test-Path $installDir) {
        Write-Host "Clearing existing $installDir..." -ForegroundColor Cyan
        Remove-Item -Recurse -Force $installDir
    }
    Write-Host "Creating install directory at $installDir..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $installDir | Out-Null

    Write-Host "Extracting to $installDir..." -ForegroundColor Cyan
    Expand-Archive -Path $tempZip -DestinationPath $installDir -Force
    Write-Host "Files extracted to ${installDir}:" -ForegroundColor Cyan
    Get-ChildItem -Path $installDir -Recurse | ForEach-Object { Write-Host $_.FullName }

    $exePath = Get-ChildItem -Path $installDir -Recurse -File -Include "screenpipe.exe" | Select-Object -First 1 -ExpandProperty FullName
    if (-not $exePath) {
        throw "screenpipe.exe not found in $installDir or its subdirectories after extraction."
    }
    Write-Host "Found screenpipe.exe at: $exePath" -ForegroundColor Green

    $binPath = Join-Path $installDir "bin"
    if (!(Test-Path $binPath)) {
        Write-Host "Creating bin directory at $binPath..." -ForegroundColor Cyan
        New-Item -ItemType Directory -Path $binPath | Out-Null
    }
    $targetExePath = "$binPath\screenpipe.exe"
    if ($exePath -ne $targetExePath) {
        Write-Host "Moving screenpipe.exe from $exePath to $targetExePath..." -ForegroundColor Cyan
        Move-Item -Path $exePath -Destination $targetExePath -Force
    }

    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$binPath*") {
        Write-Host "Adding $binPath to user PATH..." -ForegroundColor Cyan
        [Environment]::SetEnvironmentVariable("Path", "$currentPath;$binPath", "User")
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "User")
    }

    if (!(Test-Path $targetExePath)) {
        throw "screenpipe.exe not found at $targetExePath after moving."
    }
    Write-Host "screenpipe.exe confirmed at $targetExePath" -ForegroundColor Green

    Write-Host "Cleaning up temporary files..." -ForegroundColor Cyan
    Remove-Item $tempZip -Force

    Write-Host "Installation Complete!" -ForegroundColor Green
    Write-Host "To get started:" -ForegroundColor Yellow
    Write-Host "1. Add $targetExePath to Windows Defender exclusions NOW before proceeding."
    Write-Host "2. Press Ctrl+C to exit this script after adding the exclusion."
    Write-Host "3. Restart your terminal or log out and back in."
    Write-Host "4. Run: screenpipe"
    Write-Host ""
    Write-Host "Join our Discord: https://discord.gg/dU9EBuw7Uq"
    Write-Host "Check the docs: https://docs.screenpi.pe"

    # Keep the file open to prevent deletion
    Write-Host "Keeping $targetExePath open to prevent antivirus deletion. Add exclusion now..." -ForegroundColor Yellow
    $fileLock = [System.IO.File]::Open($targetExePath, 'Open', 'Read', 'None')
    Read-Host "Press Enter after adding the exclusion in Windows Security..."
    $fileLock.Close()
}
catch {
    Write-Host "Installation failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
