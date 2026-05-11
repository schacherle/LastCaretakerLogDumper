$exePath = "C:\Program Files (x86)\Steam\steamapps\common\Voyage\Voyage\Binaries\Win64\VoyageSteam-Win64-Shipping.exe"

$fi = Get-Item $exePath
Write-Host "File size: $($fi.Length) bytes"

$stream = [System.IO.File]::OpenRead($exePath)
$bufSize = 64 * 1024 * 1024
$overlap = 1024
$buf = New-Object byte[] ($bufSize + $overlap)

# Search for "610670" as UTF-16LE
$needle = [System.Text.Encoding]::Unicode.GetBytes("610670")
Write-Host "Searching for '610670' as UTF-16LE: $($needle | ForEach-Object { $_.ToString('X2') })"

# Also search as ASCII
$needleAscii = [System.Text.Encoding]::ASCII.GetBytes("610670")

# Also search as raw int32 LE (610670 = 0x00095170 ... wait let me compute)
$intVal = 610670
$needleInt = [BitConverter]::GetBytes([int]$intVal)
Write-Host "610670 as int32 LE: $($needleInt | ForEach-Object { $_.ToString('X2') })"

$globalOffset = 0

while ($true) {
    $seekPos = [Math]::Max(0, $globalOffset - $overlap)
    $stream.Position = $seekPos
    $bytesRead = $stream.Read($buf, 0, $buf.Length)
    if ($bytesRead -le 0) { break }

    $localStart = if ($globalOffset -eq 0) { 0 } else { $overlap }

    for ($i = $localStart; $i -lt $bytesRead - 6; $i++) {
        $fileOffset = $seekPos + $i

        # Check UTF-16LE
        if ($buf[$i] -eq $needle[0] -and $buf[$i+1] -eq $needle[1]) {
            $match = $true
            for ($j = 2; $j -lt $needle.Length; $j++) {
                if ($buf[$i + $j] -ne $needle[$j]) { $match = $false; break }
            }
            if ($match) {
                Write-Host "`nFOUND '610670' UTF-16LE at offset 0x$($fileOffset.ToString('X8'))"
                $dumpStart = [Math]::Max(0, $i - 128)
                $dumpEnd = [Math]::Min($bytesRead, $i + 128)
                for ($row = $dumpStart; $row -lt $dumpEnd; $row += 16) {
                    $hexPart = ""; $asciiPart = ""
                    for ($col = 0; $col -lt 16 -and ($row + $col) -lt $dumpEnd; $col++) {
                        $b = $buf[$row + $col]; $hexPart += "$($b.ToString('X2')) "
                        if ($b -ge 0x20 -and $b -le 0x7E) { $asciiPart += [char]$b } else { $asciiPart += "." }
                    }
                    Write-Host ("{0:X8}  {1,-48} {2}" -f ($seekPos + $row), $hexPart, $asciiPart)
                }
            }
        }

        # Check ASCII
        if ($buf[$i] -eq $needleAscii[0] -and $buf[$i+1] -eq $needleAscii[1]) {
            $match = $true
            for ($j = 2; $j -lt $needleAscii.Length; $j++) {
                if ($buf[$i + $j] -ne $needleAscii[$j]) { $match = $false; break }
            }
            if ($match) {
                Write-Host "`nFOUND '610670' ASCII at offset 0x$($fileOffset.ToString('X8'))"
                $dumpStart = [Math]::Max(0, $i - 128)
                $dumpEnd = [Math]::Min($bytesRead, $i + 128)
                for ($row = $dumpStart; $row -lt $dumpEnd; $row += 16) {
                    $hexPart = ""; $asciiPart = ""
                    for ($col = 0; $col -lt 16 -and ($row + $col) -lt $dumpEnd; $col++) {
                        $b = $buf[$row + $col]; $hexPart += "$($b.ToString('X2')) "
                        if ($b -ge 0x20 -and $b -le 0x7E) { $asciiPart += [char]$b } else { $asciiPart += "." }
                    }
                    Write-Host ("{0:X8}  {1,-48} {2}" -f ($seekPos + $row), $hexPart, $asciiPart)
                }
            }
        }

        # Check as int32 LE
        if ($buf[$i] -eq $needleInt[0] -and $buf[$i+1] -eq $needleInt[1] -and
            $buf[$i+2] -eq $needleInt[2] -and $buf[$i+3] -eq $needleInt[3]) {
            Write-Host "`nFOUND 610670 as int32 at offset 0x$($fileOffset.ToString('X8'))"
            $dumpStart = [Math]::Max(0, $i - 128)
            $dumpEnd = [Math]::Min($bytesRead, $i + 128)
            for ($row = $dumpStart; $row -lt $dumpEnd; $row += 16) {
                $hexPart = ""; $asciiPart = ""
                for ($col = 0; $col -lt 16 -and ($row + $col) -lt $dumpEnd; $col++) {
                    $b = $buf[$row + $col]; $hexPart += "$($b.ToString('X2')) "
                    if ($b -ge 0x20 -and $b -le 0x7E) { $asciiPart += [char]$b } else { $asciiPart += "." }
                }
                Write-Host ("{0:X8}  {1,-48} {2}" -f ($seekPos + $row), $hexPart, $asciiPart)
            }
        }
    }

    $globalOffset += $bufSize
    if ($seekPos + $bytesRead -ge $fi.Length) { break }
}

$stream.Close()
Write-Host "`nDone."
