Write-Host "installing screenpipe..."

try {
    # Get latest version
    $releases = Invoke-RestMethod "https://api.github.com/repos/mediar-ai/screenpipe/releases"
    $latestRelease = $releases | Where-Object { -not $_.prerelease } | Select-Object -First 1
    if (-not $latestRelease) {
        throw "no releases found"
    }
    
    # Find the Windows asset
    $asset = $latestRelease.assets | Where-Object { $_.name -like "*-x86_64-pc-windows-msvc.zip" } | Select-Object -First 1
    if (-not $asset) {
        throw "no Windows release found in version $($latestRelease.tag_name)"
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
    if ($currentPath -notlike "*$installDir\bin*") {
        [Environment]::SetEnvironmentVariable("Path", "$currentPath;$installDir\bin", "User")
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "User")
    }

    # Verify installation
    $binPath = Join-Path $installDir "bin\screenpipe.exe"
    if (!(Test-Path $binPath)) {
        throw "screenpipe.exe not found in $binPath after installation"
    }

    # Cleanup
    Remove-Item $tempZip -Force

    # Install bun
    Write-Host "installing bun..."
    powershell -c "irm bun.sh/install.ps1|iex"

    # Install Git if not present
    Write-Host "checking git installation..."
    if (!(Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Host "installing git..."
        $gitUrl = "https://github.com/git-for-windows/git/releases/download/v2.43.0.windows.1/Git-2.43.0-64-bit.exe"
        $gitInstaller = "$env:TEMP\GitInstaller.exe"
        
        Write-Host "downloading git installer..."
        Invoke-WebRequest -Uri $gitUrl -OutFile $gitInstaller
        
        Write-Host "running git installer..."
        Start-Process -FilePath $gitInstaller -Args "/VERYSILENT /NORESTART" -Wait
        
        # Cleanup
        Remove-Item $gitInstaller -Force
        
        # Refresh PATH
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "User")
    } else {
        Write-Host "git is already installed"
    }

    Write-Host @"

███████╗ ██████╗██████╗ ███████╗███████╗███╗   ██╗██████╗ ██╗██████╗ ███████╗
██╔════╝██╔════╝██╔══██╗██╔════╝██╔════╝████╗  ██║██╔══██╗██║██╔══██╗██╔════╝
███████╗██║     ██████╔╝█████╗  █████╗  ██╔██╗ ██║█████╔╝██║██████╔╝█████╗  
╚════██║██║     ██╔══██╗██╔══╝  ██╔══╝  ██║╚██╗██║██╔═══╝ ██║██╔═══╝ ██╔══╝  
███████║╚██████╗██║  ██║███████╗███████╗██║ ╚████║██║     ██║██║     ███████╗
╚══════╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚══════╝╚═╝  ╚═══╝╚═╝     ╚═╝╚═╝     ╚══════╝
"@

    Write-Host "installation complete! 🚀"
    Write-Host "to get started:"
    Write-Host "1. restart your terminal"
    Write-Host "2. run: screenpipe"
    Write-Host ""
    Write-Host "╭──────────────────────────────────────────╮"
    Write-Host "│  join our discord:                       │"
    Write-Host "│  --> https://discord.gg/dU9EBuw7Uq       │"
    Write-Host "│                                          │"
    Write-Host "│  check the docs:                         │"
    Write-Host "│  --> https://docs.screenpi.pe            │"
    Write-Host "╰──────────────────────────────────────────╯"
} catch {
    Write-Host "installation failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}