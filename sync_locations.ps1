$dumpPath      = '.\voyage_location_dump.json'
$locationsPath = '..\lastcaretakermap\src\data\locations.json'
$missingPath   = '.\missing_locations.json'

$root    = Get-Content $dumpPath -Raw | ConvertFrom-Json
$locData = Get-Content $locationsPath -Raw | ConvertFrom-Json
$dump = $root.data

# All arrays that may contain locations with a gameid
$arrayNames = @('locations', 'hiddenLocations', 'lastListenerLocations', 'caves')

$missing = [System.Collections.Generic.List[object]]::new()
$updatedCount = 0

foreach ($entry in $dump) {
    $matched = $false

    foreach ($arrayName in $arrayNames) {
        if (-not $locData.PSObject.Properties[$arrayName]) { continue }
        $match = $locData.$arrayName | Where-Object { $_.gameid -eq $entry.id }
        if ($match) {
            $match.longitude = [math]::Round($entry.lon)
            $match.latitude  = [math]::Round($entry.lat)
            $updatedCount++
            $matched = $true
            break
        }
    }

    if (-not $matched) {
        $missing.Add([PSCustomObject]@{
            name        = $entry.title
            id          = ""
            description = ""
            longitude   = [math]::Round($entry.lon)
            latitude    = [math]::Round($entry.lat)
            type        = ""
            gameid      = $entry.id
        })
    }
}

# Write updated locations.json with 2-space indentation to match existing format
$locData | ConvertTo-Json -Depth 10 | ForEach-Object { $_ -replace '    ', '  ' } | Set-Content $locationsPath -Encoding UTF8

# Write missing locations file
if ($missing.Count -gt 0) {
    @{ locations = $missing } | ConvertTo-Json -Depth 10 | ForEach-Object { $_ -replace '    ', '  ' } | Set-Content $missingPath -Encoding UTF8
    Write-Host "Missing entries written to: $missingPath ($($missing.Count) entries)"
} else {
    Write-Host "No missing entries."
}

Write-Host "Updated $updatedCount existing entries in $locationsPath"
