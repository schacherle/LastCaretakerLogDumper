$exePath = "C:\Program Files (x86)\Steam\steamapps\common\Voyage\Voyage\Binaries\Win64\VoyageSteam-Win64-Shipping.exe"
$outPath = "C:\CODE\LastCaretakerLogDumper\voyage_exe_strings_utf16.txt"

$bytes = [System.IO.File]::ReadAllBytes($exePath)
$results = [System.Collections.Generic.List[string]]::new()
$current = New-Object System.Text.StringBuilder

# Extract UTF-16LE strings (every other byte is 0x00 for ASCII range)
for ($i = 0; $i -lt $bytes.Length - 1; $i += 2) {
    $lo = $bytes[$i]
    $hi = $bytes[$i + 1]
    if ($hi -eq 0 -and $lo -ge 0x20 -and $lo -le 0x7E) {
        [void]$current.Append([char]$lo)
    } else {
        if ($current.Length -ge 4) {
            $results.Add($current.ToString())
        }
        [void]$current.Clear()
    }
}
if ($current.Length -ge 4) {
    $results.Add($current.ToString())
}

$results | Set-Content $outPath -Encoding UTF8
Write-Host "Extracted $($results.Count) UTF-16 strings to $outPath"
