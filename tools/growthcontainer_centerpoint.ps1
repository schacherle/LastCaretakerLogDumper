$locations = Get-Content '.\voyage_location_dump.json' -Raw | ConvertFrom-Json

$containers = $locations | Where-Object { $_.id -match '^GrowthContainer' }

$count = $containers.Count
$sumX = ($containers | Measure-Object -Property x -Sum).Sum
$sumY = ($containers | Measure-Object -Property y -Sum).Sum

$centerX = $sumX / $count
$centerY = $sumY / $count

$zStats = $containers | Measure-Object -Property z -Minimum -Maximum -Average
$zValues = $containers | ForEach-Object { $_.z }
$zMean = $zStats.Average
$zVariance = ($zValues | ForEach-Object { [math]::Pow($_ - $zMean, 2) } | Measure-Object -Sum).Sum / $count
$zStdDev = [math]::Sqrt($zVariance)

Write-Host "GrowthContainer count: $count"
Write-Host "Center X: $centerX"
Write-Host "Center Y: $centerY"
Write-Host ""
Write-Host "Z stats:"
Write-Host "  Min:    $($zStats.Minimum)"
Write-Host "  Max:    $($zStats.Maximum)"
Write-Host "  Avg:    $zMean"
Write-Host "  StdDev: $zStdDev"
