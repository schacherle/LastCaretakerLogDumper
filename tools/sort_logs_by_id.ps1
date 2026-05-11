# Sort voyage_logs_dump.json by id using natural numeric ordering
# Usage: .\sort_logs_by_id.ps1

$InputFile = "voyage_logs_dump.json"
$OutputFile = "voyage_logs_dump_sorted.json"

$root = Get-Content $InputFile -Raw -Encoding UTF8 | ConvertFrom-Json

$sorted = $root.data | Sort-Object {
    $num = [regex]::Match($_.id, '(\d+)$')
    if ($num.Success) { [int]$num.Value } else { [int]::MaxValue }
}, id

foreach ($log in $sorted) {
    if ($log.fragments -and $log.fragments.Count -gt 0) {
        $log.fragments = @($log.fragments | Sort-Object {
            $num = [regex]::Match($_.id, '(\d+)$')
            if ($num.Success) { [int]$num.Value } else { [int]::MaxValue }
        }, id)
    }
}

$root.data = $sorted

$json = $root | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText("$PWD\$OutputFile", $json, [System.Text.Encoding]::UTF8)

Move-Item -Path $OutputFile -Destination $InputFile -Force

Write-Host "Sorted $($sorted.Count) logs by id -> $InputFile"
