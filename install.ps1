# Check if running as administrator
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Warning "please run as administrator!"
    exit
}

Write-Host "installing screenpipe..."

try {
    # Get latest version
    $version = (Invoke-RestMethod "https://api.github.com/repos/mediar-ai/screenpipe/releases/latest").tag_name
    $url = "https://github.com/mediar-ai/screenpipe/releases/download/$version/screenpipe-$version-x86_64-pc-windows-msvc.zip"
    $installDir = "$env:USERPROFILE\screenpipe"
    $tempZip = "$env:TEMP\screenpipe.zip"

    # Download and extract
    Write-Host "downloading latest version ($version)..."
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

    Write-Host "screenpipe installed successfully! restart your terminal and run 'screenpipe'"
} catch {
    Write-Host "installation failed: $($_.Exception.Message)" -ForegroundColor Red
    # Exit with error code but don't propagate exception
    [Environment]::Exit(1)
}