$exePath = "C:\Program Files (x86)\Steam\steamapps\common\Voyage\Voyage\Binaries\Win64\VoyageSteam-Win64-Shipping.exe"
$outPath = "C:\CODE\LastCaretakerLogDumper\voyage_exe_strings.txt"

$bytes = [System.IO.File]::ReadAllBytes($exePath)
$sb = New-Object System.Text.StringBuilder
$results = [System.Collections.Generic.List[string]]::new()
$current = New-Object System.Text.StringBuilder

foreach ($b in $bytes) {
    if ($b -ge 0x20 -and $b -le 0x7E) {
        [void]$current.Append([char]$b)
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
Write-Host "Extracted $($results.Count) strings to $outPath"
