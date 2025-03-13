param (
    [int]$DurationMinutes = 300,
    [int]$MemoryThresholdMB = 200,
    [int]$CpuThresholdPercent = 80,
    [int]$CheckIntervalSeconds = 60,
    [string]$ScreenpipePath = ".\target\release\screenpipe.exe",
    [switch]$SkipBuild = $false,
    [switch]$SkipDriverInstall = $false
)

# Create output directories
$TestResultsDir = ".\test_results"
New-Item -ItemType Directory -Force -Path $TestResultsDir | Out-Null
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.screenpipe\test_data" -Force | Out-Null

# Initialize log files
"timestamp,cpu_percent,memory_mb,virtual_memory_mb" | Out-File -FilePath "$TestResultsDir\resource_metrics.csv"
"timestamp,status,response_time_ms,error" | Out-File -FilePath "$TestResultsDir\health_checks.csv"
"" | Out-File -FilePath "$TestResultsDir\alerts.log"

Write-Host "🔬 Screenpipe Longevity Test" -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan
Write-Host "Duration: $DurationMinutes minutes" -ForegroundColor Cyan
Write-Host "Memory threshold: $MemoryThresholdMB MB" -ForegroundColor Cyan
Write-Host "CPU threshold: $CpuThresholdPercent%" -ForegroundColor Cyan
Write-Host "Check interval: $CheckIntervalSeconds seconds" -ForegroundColor Cyan
Write-Host "Output directory: $TestResultsDir" -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan

# Build Screenpipe if not skipped
if (-not $SkipBuild) {
    Write-Host "🔨 Building Screenpipe CLI..." -ForegroundColor Yellow
    $buildStart = Get-Date
    
    # Check if cargo is available
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        Write-Host "Rust/Cargo not found. Installing..." -ForegroundColor Yellow
        
        # Install Rust if not present
        Invoke-WebRequest https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-gnu/rustup-init.exe -OutFile rustup-init.exe
        .\rustup-init.exe -y
        $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
    }
    
    # Build the CLI
    cargo build --release -p screenpipe-server
    
    # Check if build was successful
    if (-not (Test-Path $ScreenpipePath)) {
        Write-Error "Failed to build screenpipe. Check that the path is correct: $ScreenpipePath"
        exit 1
    }
    
    $buildDuration = (Get-Date) - $buildStart
    Write-Host "✅ Build completed in $($buildDuration.TotalMinutes.ToString("F2")) minutes" -ForegroundColor Green
}

# Set up virtual screen and audio if not skipped
if (-not $SkipDriverInstall) {
    Write-Host "🖥️ Setting up virtual screen and audio devices..." -ForegroundColor Yellow
    
    # Install Scream virtual audio driver
    try {
        # Download Scream
        Invoke-WebRequest https://github.com/duncanthrax/scream/releases/download/4.0/Scream4.0.zip -OutFile "$TestResultsDir\Scream4.0.zip"
        Expand-Archive -Path "$TestResultsDir\Scream4.0.zip" -DestinationPath "$TestResultsDir\Scream" -Force
        
        # Create self-signed certificate
        if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) {
            Write-Host "OpenSSL not found. Please install it or use the -SkipDriverInstall flag if you already have virtual devices." -ForegroundColor Yellow
        } else {
            # Create certificate
            openssl req -batch -verbose -x509 -newkey rsa -keyout "$TestResultsDir\ScreamCert.pvk" -out "$TestResultsDir\ScreamCert.cer" -nodes -extensions v3_req
            openssl pkcs12 -export -nodes -in "$TestResultsDir\ScreamCert.cer" -inkey "$TestResultsDir\ScreamCert.pvk" -out "$TestResultsDir\ScreamCert.pfx" -passout pass:
            
            # Import certificate and install driver
            Import-Certificate -FilePath "$TestResultsDir\ScreamCert.cer" -CertStoreLocation Cert:\LocalMachine\root
            Import-Certificate -FilePath "$TestResultsDir\ScreamCert.cer" -CertStoreLocation Cert:\LocalMachine\TrustedPublisher
            
            # Install driver (requires admin privileges)
            & "$TestResultsDir\Scream\Install\helpers\devcon-x64.exe" install "$TestResultsDir\Scream\Install\driver\x64\Scream.inf" *Scream
            
            # Start audio service if not running
            $audioSrv = Get-Service -Name "Audiosrv" -ErrorAction SilentlyContinue
            if ($audioSrv.Status -ne "Running") {
                Start-Service -Name "Audiosrv"
            }
        }
    } catch {
        Write-Host "⚠️ Warning: Could not set up virtual audio devices. Test will continue but audio capture may not work." -ForegroundColor Yellow
        Write-Host "Error: $_" -ForegroundColor Red
    }
    
    Write-Host "✅ Device setup completed" -ForegroundColor Green
}

# Start Screenpipe CLI
Write-Host "🚀 Starting Screenpipe CLI..." -ForegroundColor Yellow

$env:RUST_LOG = "debug"
$process = Start-Process -FilePath $ScreenpipePath -ArgumentList "--debug" -PassThru -RedirectStandardOutput "$TestResultsDir\screenpipe_output.log" -RedirectStandardError "$TestResultsDir\screenpipe_error.log" -NoNewWindow

# Save process info
$processInfo = @{
    ProcessId = $process.Id
    StartTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
}
$processInfo | ConvertTo-Json | Out-File -FilePath "$TestResultsDir\process_info.json"

Write-Host "✅ Started Screenpipe CLI with Process ID: $($process.Id)" -ForegroundColor Green

# Wait for initialization
Write-Host "⏳ Waiting for initialization (30 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# Check if process is still running
if (-not (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) {
    Write-Error "❌ Process crashed during initialization. Check error logs."
    Get-Content "$TestResultsDir\screenpipe_error.log"
    exit 1
}

# Start screen activity generator in background
Write-Host "🖌️ Starting screen activity generator..." -ForegroundColor Yellow

# Create the activity generator script
$activityScript = @"
# Activity generator for Screenpipe longevity test
`$startTime = Get-Date
`$duration = New-TimeSpan -Minutes $DurationMinutes

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

# Function to create a test image with text for OCR
function Create-TestImage {
    param (
        [string]`$text,
        [string]`$outputPath
    )
    
    `$width = 1024
    `$height = 768
    `$bmp = New-Object System.Drawing.Bitmap `$width, `$height
    `$graphics = [System.Drawing.Graphics]::FromImage(`$bmp)
    
    # Clear with white background
    `$graphics.Clear([System.Drawing.Color]::White)
    
    # Draw text
    `$font = New-Object System.Drawing.Font("Arial", 24)
    `$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black)
    
    # Draw centered test text
    `$format = [System.Drawing.StringFormat]::GenericDefault
    `$format.Alignment = [System.Drawing.StringAlignment]::Center
    `$format.LineAlignment = [System.Drawing.StringAlignment]::Center
    `$rect = New-Object System.Drawing.RectangleF(0, 0, `$width, `$height)
    `$graphics.DrawString(`$text, `$font, `$brush, `$rect, `$format)
    
    # Draw timestamp at bottom
    `$timestampFont = New-Object System.Drawing.Font("Arial", 12)
    `$timeText = "Generated: " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    `$graphics.DrawString(`$timeText, `$timestampFont, `$brush, 10, `$height - 30)
    
    # Draw a colored rectangle to test color detection
    `$redBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Red)
    `$graphics.FillRectangle(`$redBrush, `$width - 100, 20, 80, 80)
    
    # Draw some lines to test line detection
    `$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::Blue, 3)
    `$graphics.DrawLine(`$pen, 50, 50, 200, 50)
    `$graphics.DrawLine(`$pen, 50, 70, 200, 70)
    `$graphics.DrawLine(`$pen, 50, 90, 200, 90)
    
    # Save the image
    `$bmp.Save(`$outputPath)
    
    # Cleanup
    `$graphics.Dispose()
    `$font.Dispose()
    `$timestampFont.Dispose()
    `$brush.Dispose()
    `$redBrush.Dispose()
    `$pen.Dispose()
    `$bmp.Dispose()
}

# Log activity
"Activity generator started at `$startTime" | Out-File -FilePath "$TestResultsDir\activity_log.txt"

`$iterationCount = 0
while ((Get-Date) - `$startTime -lt `$duration) {
    `$iterationCount++
    `$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "Iteration `$iterationCount at `$timestamp" | Out-File -FilePath "$TestResultsDir\activity_log.txt" -Append
    
    try {
        # 1. Generate test image with random data for OCR testing
        `$imageText = "Screenpipe Test Iteration `$iterationCount`n" + 
                     "Random Number: " + (Get-Random -Minimum 10000 -Maximum 99999) + "`n" +
                     "Timestamp: `$timestamp"
        
        `$imagePath = "$TestResultsDir\test_image_`$iterationCount.png"
        Create-TestImage -text `$imageText -outputPath `$imagePath
        
        # 2. Display image using default photo viewer
        Start-Process `$imagePath
        Start-Sleep -Seconds 5
        
        # 3. Close photo viewer
        Get-Process | Where-Object {`$_.MainWindowTitle -match 'Photos|Image|Viewer'} | Stop-Process -Force -ErrorAction SilentlyContinue
        
        # 4. Open Notepad and type some text
        `$notepad = Start-Process notepad -PassThru
        Start-Sleep -Seconds 2
        
        # Type text using SendKeys
        [System.Windows.Forms.SendKeys]::SendWait("Screenpipe Test - Iteration `$iterationCount`r`n")
        [System.Windows.Forms.SendKeys]::SendWait("This is test content that should be captured by OCR.`r`n")
        [System.Windows.Forms.SendKeys]::SendWait("Random data: " + (Get-Random) + "`r`n")
        [System.Windows.Forms.SendKeys]::SendWait("Current time: `$timestamp`r`n")
        Start-Sleep -Seconds 3
        
        # 5. Close notepad
        Stop-Process -Id `$notepad.Id -Force -ErrorAction SilentlyContinue
        
        # 6. Generate audio beep (will be picked up by Scream virtual audio)
        [console]::beep(1000, 500)
        Start-Sleep -Milliseconds 500
        [console]::beep(1500, 500)
        
        # Wait for next iteration
        "Activity iteration `$iterationCount completed" | Out-File -FilePath "$TestResultsDir\activity_log.txt" -Append
        Start-Sleep -Seconds 30
    }
    catch {
        "Error in iteration `$iterationCount: `$_" | Out-File -FilePath "$TestResultsDir\activity_log.txt" -Append
    }
}

"Activity generator completed at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath "$TestResultsDir\activity_log.txt" -Append
"@

# Save activity script
$activityScript | Out-File -FilePath "$TestResultsDir\activity_generator.ps1"

# Start activity generator in a new PowerShell process
$activityProcess = Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -File $TestResultsDir\activity_generator.ps1" -PassThru -WindowStyle Minimized

# Monitor resources and health
Write-Host "📊 Starting resource and health monitoring..." -ForegroundColor Yellow

$startTime = Get-Date
$endTime = $startTime.AddMinutes($DurationMinutes)
$totalIterations = ($DurationMinutes * 60) / $CheckIntervalSeconds
$iteration = 0

$startMemoryMB = $null
$memoryIncreaseDetected = $false
$alertsGenerated = 0

Write-Host "🕒 Test will run until: $endTime" -ForegroundColor Cyan
Write-Host "📋 Progress: 0 / $totalIterations iterations (0%)" -ForegroundColor Cyan

while ((Get-Date) -lt $endTime -and $iteration -lt $totalIterations) {
    $iteration++
    $percentComplete = [math]::Round(($iteration / $totalIterations) * 100, 1)
    
    try {
        # Get process info
        $process = Get-Process -Id $process.Id -ErrorAction Stop
        
        # Calculate CPU and memory
        try {
            $cpuCounter = Get-Counter "\Process($($process.Name))\% Processor Time" -ErrorAction SilentlyContinue
            $cpuPercent = if ($cpuCounter) { $cpuCounter.CounterSamples.CookedValue } else { 0 }
        } catch {
            $cpuPercent = 0
        }
        
        $memoryMB = [math]::Round($process.WorkingSet64 / 1MB, 2)
        $virtualMemoryMB = [math]::Round($process.VirtualMemorySize64 / 1MB, 2)
        
        # Save initial memory value
        if ($null -eq $startMemoryMB) {
            $startMemoryMB = $memoryMB
            Write-Host "📝 Initial memory usage: $startMemoryMB MB" -ForegroundColor Cyan
        }
        
        # Record metrics
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        "$timestamp,$cpuPercent,$memoryMB,$virtualMemoryMB" | Out-File -FilePath "$TestResultsDir\resource_metrics.csv" -Append
        
        # Make health check request
        $healthStart = Get-Date
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:8080/health" -Method GET -TimeoutSec 5 -ErrorAction SilentlyContinue
            $responseTime = ((Get-Date) - $healthStart).TotalMilliseconds
            $status = $response.StatusCode
            "$timestamp,$status,$responseTime," | Out-File -FilePath "$TestResultsDir\health_checks.csv" -Append
        } catch {
            $responseTime = ((Get-Date) - $healthStart).TotalMilliseconds
            $errorMsg = $_.Exception.Message -replace "`n|`r", " "
            "$timestamp,error,$responseTime,$errorMsg" | Out-File -FilePath "$TestResultsDir\health_checks.csv" -Append
        }
        
        # Calculate memory increase
        $memoryIncreaseMB = $memoryMB - $startMemoryMB
        
        # Check for alert conditions
        if ($memoryIncreaseMB -gt $MemoryThresholdMB -and -not $memoryIncreaseDetected) {
            $memoryIncreaseDetected = $true
            $alertMessage = "⚠️ ALERT: Memory increase of $memoryIncreaseMB MB detected (threshold: $MemoryThresholdMB MB)"
            Write-Host $alertMessage -ForegroundColor Red
            $alertMessage | Out-File -FilePath "$TestResultsDir\alerts.log" -Append
            $alertsGenerated++
        }
        
        if ($cpuPercent -gt $CpuThresholdPercent) {
            $alertMessage = "⚠️ ALERT: High CPU usage of $cpuPercent% detected (threshold: $CpuThresholdPercent%)"
            Write-Host $alertMessage -ForegroundColor Red
            $alertMessage | Out-File -FilePath "$TestResultsDir\alerts.log" -Append
            $alertsGenerated++
        }
        
        # Log progress
        if ($iteration % 5 -eq 0 -or $iteration -eq 1) {
            Write-Progress -Activity "Running Screenpipe Longevity Test" -Status "$percentComplete% Complete" -PercentComplete $percentComplete
            Write-Host "📊 Iteration $iteration/$totalIterations ($percentComplete%) - CPU: $([math]::Round($cpuPercent,1))%, Memory: $memoryMB MB, Increase: $([math]::Round($memoryIncreaseMB,1)) MB" -ForegroundColor Cyan
        }
        
    } catch {
        Write-Host "⚠️ Error monitoring process: $_" -ForegroundColor Red
        "Error monitoring process: $_" | Out-File -FilePath "$TestResultsDir\monitor_errors.log" -Append
        
        # Check if process still exists
        if (-not (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) {
            $crashMsg = "❌ CRITICAL: Process has crashed or been terminated at $(Get-Date)"
            Write-Host $crashMsg -ForegroundColor Red
            $crashMsg | Out-File -FilePath "$TestResultsDir\alerts.log" -Append
            break
        }
    }
    
    # Wait for next check
    Start-Sleep -Seconds $CheckIntervalSeconds
}

Write-Progress -Activity "Running Screenpipe Longevity Test" -Completed

# Stop Screenpipe CLI
Write-Host "🛑 Stopping Screenpipe CLI..." -ForegroundColor Yellow
try {
    Stop-Process -Id $process.Id -Force
    Write-Host "✅ Process stopped successfully" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Error stopping process: $_" -ForegroundColor Red
}

# Stop activity generator if still running
if (Get-Process -Id $activityProcess.Id -ErrorAction SilentlyContinue) {
    Stop-Process -Id $activityProcess.Id -Force
}

# Generate summary report
Write-Host "📝 Generating test report..." -ForegroundColor Yellow

# Calculate statistics
$stats = @{}

if (Test-Path "$TestResultsDir\resource_metrics.csv") {
    $metrics = Import-Csv -Path "$TestResultsDir\resource_metrics.csv" -Header "timestamp","cpu_percent","memory_mb","virtual_memory_mb" | Select-Object -Skip 1
    
    if ($metrics.Count -gt 0) {
        $memoryValues = $metrics | ForEach-Object { [double]$_.memory_mb }
        $cpuValues = $metrics | ForEach-Object { [double]$_.cpu_percent }
        
        $stats.MemoryMin = ($memoryValues | Measure-Object -Minimum).Minimum
        $stats.MemoryMax = ($memoryValues | Measure-Object -Maximum).Maximum
        $stats.MemoryAvg = ($memoryValues | Measure-Object -Average).Average
        
        $stats.CPUMin = ($cpuValues | Measure-Object -Minimum).Minimum
        $stats.CPUMax = ($cpuValues | Measure-Object -Maximum).Maximum
        $stats.CPUAvg = ($cpuValues | Measure-Object -Average).Average
        
        $stats.MemoryGrowth = $stats.MemoryMax - $stats.MemoryMin
        $stats.DataPoints = $metrics.Count
        
        # Export stats
        $stats | ConvertTo-Json | Out-File -FilePath "$TestResultsDir\stats.json"
    }
}

# Generate HTML report
$reportHtml = @"
<!DOCTYPE html>
<html>
<head>
  <title>Screenpipe Longevity Test Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .section { margin-bottom: 30px; }
    .alert { color: red; font-weight: bold; }
    .success { color: green; font-weight: bold; }
    .chart { width: 100%; height: 400px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
  </style>
  <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
</head>
<body>
  <h1>Screenpipe Longevity Test Report</h1>
  <div class="section">
    <h2>Test Summary</h2>
    <p><b>Date:</b> $(Get-Date -Format "yyyy-MM-dd")</p>
    <p><b>Duration:</b> $DurationMinutes minutes</p>
    <p><b>Memory Threshold:</b> $MemoryThresholdMB MB</p>
    <p><b>CPU Threshold:</b> $CpuThresholdPercent%</p>
  </div>
  
  <div class="section">
    <h2>Resource Usage Charts</h2>
    <div id="memoryChart" class="chart"></div>
    <div id="cpuChart" class="chart"></div>
  </div>
  
  <div class="section">
    <h2>Alerts</h2>
    <div id="alerts">
"@

# Add alerts to report
if (Test-Path "$TestResultsDir\alerts.log") {
    $alerts = Get-Content "$TestResultsDir\alerts.log"
    if ($alerts.Count -gt 0) {
        foreach ($alert in $alerts) {
            $reportHtml += "<p class='alert'>$alert</p>`n"
        }
    } else {
        $reportHtml += "<p class='success'>No alerts generated during test</p>`n"
    }
} else {
    $reportHtml += "<p class='success'>No alerts generated during test</p>`n"
}

# Continue HTML report
$reportHtml += @"
    </div>
  </div>
  
  <div class="section">
    <h2>Statistics</h2>
    <table>
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>Memory Min</td><td>$([math]::Round($stats.MemoryMin, 2)) MB</td></tr>
      <tr><td>Memory Max</td><td>$([math]::Round($stats.MemoryMax, 2)) MB</td></tr>
      <tr><td>Memory Average</td><td>$([math]::Round($stats.MemoryAvg, 2)) MB</td></tr>
      <tr><td>Memory Growth</td><td>$([math]::Round($stats.MemoryGrowth, 2)) MB</td></tr>
      <tr><td>CPU Min</td><td>$([math]::Round($stats.CPUMin, 2))%</td></tr>
      <tr><td>CPU Max</td><td>$([math]::Round($stats.CPUMax, 2))%</td></tr>
      <tr><td>CPU Average</td><td>$([math]::Round($stats.CPUAvg, 2))%</td></tr>
      <tr><td>Data Points</td><td>$($stats.DataPoints)</td></tr>
    </table>
  </div>
  
  <div class="section">
    <h2>Resource Metrics (Sample)</h2>
    <table>
      <tr>
        <th>Timestamp</th>
        <th>CPU %</th>
        <th>Memory (MB)</th>
        <th>Virtual Memory (MB)</th>
      </tr>
"@

# Add resource metrics sample
if (Test-Path "$TestResultsDir\resource_metrics.csv") {
    $metrics = Import-Csv -Path "$TestResultsDir\resource_metrics.csv" -Header "timestamp","cpu_percent","memory_mb","virtual_memory_mb" | Select-Object -Skip 1
    foreach ($metric in ($metrics | Select-Object -First 10)) {
        $reportHtml += "<tr><td>$($metric.timestamp)</td><td>$($metric.cpu_percent)</td><td>$($metric.memory_mb)</td><td>$($metric.virtual_memory_mb)</td></tr>`n"
    }
}

# Finish the report with JavaScript for charts
$reportHtml += @"
    </table>
    <p>(Showing first 10 records only)</p>
  </div>
  
  <script>
    // Load the CSV data for charts
    const csvData = `
$(Get-Content -Path "$TestResultsDir\resource_metrics.csv" -Raw)
    `;
    
    const lines = csvData.trim().split('\n');
    const headers = lines[0].split(',');
    
    const timestamps = [];
    const cpuValues = [];
    const memoryValues = [];
    
    // Parse CSV data
    for(let i=1; i<lines.length; i++) {
      if(lines[i].trim() === '') continue;
      
      const values = lines[i].split(',');
      timestamps.push(values[0]);
      cpuValues.push(parseFloat(values[1]));
      memoryValues.push(parseFloat(values[2]));
    }
    
    // Create memory chart
    Plotly.newPlot('memoryChart', [{
      x: timestamps,
      y: memoryValues,
      type: 'scatter',
      mode: 'lines',
      name: 'Memory Usage (MB)'
    }], {
      title: 'Memory Usage Over Time',
      xaxis: { title: 'Time' },
      yaxis: { title: 'Memory (MB)' }
    });
    
    // Create CPU chart
    Plotly.newPlot('cpuChart', [{
      x: timestamps,
      y: cpuValues,
      type: 'scatter',
      mode: 'lines',
      name: 'CPU Usage (%)'
    }], {
      title: 'CPU Usage Over Time',
      xaxis: { title: 'Time' },
      yaxis: { title: 'CPU (%)' }
    });
  </script>
</body>
</html>
"@

# Save the report
$reportHtml | Out-File -FilePath "$TestResultsDir\report.html"

# Show final stats
Write-Host "✅ Test completed successfully!" -ForegroundColor Green
Write-Host "📊 Test Statistics:" -ForegroundColor Yellow
Write-Host "Memory: Min=$([math]::Round($stats.MemoryMin,2))MB, Max=$([math]::Round($stats.MemoryMax,2))MB, Avg=$([math]::Round($stats.MemoryAvg,2))MB" -ForegroundColor Yellow
Write-Host "Memory Growth: $([math]::Round($stats.MemoryGrowth,2))MB" -ForegroundColor Yellow
Write-Host "CPU: Min=$([math]::Round($stats.CPUMin,2))%, Max=$([math]::Round($stats.CPUMax,2))%, Avg=$([math]::Round($stats.CPUAvg,2))%" -ForegroundColor Yellow
Write-Host "Data Points: $($stats.DataPoints)" -ForegroundColor Yellow
Write-Host "Alerts Generated: $alertsGenerated" -ForegroundColor Yellow

# Open the report
Write-Host "📄 Opening test report in browser..." -ForegroundColor Yellow
Start-Process "$TestResultsDir\report.html"

# Done
Write-Host "🏁 Test completed. Results are in: $TestResultsDir" -ForegroundColor Green
