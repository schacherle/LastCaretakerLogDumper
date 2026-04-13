$path = '.\voyage_location_dump.json'

$content = [System.IO.File]::ReadAllText($path)

# Swap lat before lon -> lon before lat
$content = [regex]::Replace($content, '(?m)^(\s*)"lat": ([^\r\n]+)\r?\n(\s*)"lon": ([^\r\n]+)', {
    param($m)
    $m.Groups[3].Value + '"lon": ' + $m.Groups[4].Value + "`n" + $m.Groups[1].Value + '"lat": ' + $m.Groups[2].Value
})

# Move trailing comma from lat to lon (lat is last property, lon should have the comma)
$content = [regex]::Replace($content, '(?m)^(\s*"lon": [^\r\n,]+)\r?\n(\s*"lat": [^\r\n,]+),', '$1,' + "`n" + '$2')

[System.IO.File]::WriteAllText($path, $content)

Write-Host "Done: lon is now before lat in $path"
