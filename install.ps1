Write-Host "installing screenpipe..."

try {
    # Get latest version
    $releases = Invoke-RestMethod "https://api.github.com/repos/mediar-ai/screenpipe/releases"
    $latestRelease = $releases | Where-Object { -not $_.prerelease } | Select-Object -First 1
    if (-not $latestRelease) {
        throw "No releases found"
    }
    
    # Find the Windows asset
    $asset = $latestRelease.assets | Where-Object { $_.name -like "*-x86_64-pc-windows-msvc.zip" } | Select-Object -First 1
    if (-not $asset) {
        throw "No Windows release found in version $($latestRelease.tag_name)"
    }
    
    $url = $asset.browser_download_url
    
    $installDir = "$env:USERPROFILE\screenpipe"
    $tempZip = "$env:TEMP\screenpipe.zip"

    # Download and extract
    Write-Host "downloading latest version ($($latestRelease.tag_name)) from $url..."
    Invoke-WebRequest -Uri $url -OutFile $tempZip
    
    # Create install directory if it doesn't exist
    if (!(Test-Path $installDir)) {
        New-Item -ItemType Directory -Path $installDir | Out-Null
    }

    Write-Host "extracting..."
    Expand-Archive -Path $tempZip -DestinationPath $installDir -Force

    # Add to PATH if not already there
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$installDir*") {
        [Environment]::SetEnvironmentVariable("Path", "$currentPath;$installDir", "User")
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "User")
    }

    # Cleanup
    Remove-Item $tempZip -Force

    Write-Host "screenpipe installed successfully! restart your terminal and run 'screenpipe'" -ForegroundColor Green
} catch {
    Write-Host "installation failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}