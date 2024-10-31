# Define the JSON payload
$jsonPayload = @{
    video_paths = @(
        "C:\Users\eirae\.screenpipe\data\monitor_65537_2024-10-29_09-45-10.mp4",
        "C:\Users\eirae\.screenpipe\data\monitor_65537_2024-10-29_07-24-39.mp4"
        "C:\Users\eirae\.screenpipe\data\monitor_65537_2024-10-29_08-08-23"
    )
} | ConvertTo-Json

# Escape double quotes for the JSON payload
$escapedJsonPayload = $jsonPayload -replace '"', '\"'

# Use curl to send the POST request
curl.exe -X POST "http://localhost:3030/experimental/frames/merge" `
    -H "Content-Type: application/json" `
    -d "`"$escapedJsonPayload`""
