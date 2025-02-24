param (
    [string]$FilePath
)

Add-Type -AssemblyName System.Windows.Forms
$File = Get-Item -Path $FilePath
$collection = New-Object System.Collections.Specialized.StringCollection
$collection.Add($File.FullName)
[System.Windows.Forms.Clipboard]::SetFileDropList($collection)

