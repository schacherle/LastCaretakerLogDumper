#Requires -Version 5.1
<#
.SYNOPSIS
    Converts in-game (x, y) coordinates to map (longitude, latitude) coordinates.
    Mirrors the MapIngameToMapCoords function from main.lua.

.EXAMPLE
    .\map_coords.ps1 -X 887149.48930109 -Y 271982.28465284
    # Output: Longitude ≈ 88, Latitude ≈ 27
#>
param(
    [Parameter(Mandatory)][double]$X,
    [Parameter(Mandatory)][double]$Y
)

# ---------------------------------------------------------------------------
# Reference points (NDNS nodes – named by their map coords, so mapping is exact)
# ---------------------------------------------------------------------------
$ReferencePoints = @(
    [pscustomobject]@{ X = -104096.06372284;  Y =  -16634.833630295; Longitude = -10; Latitude =  -2 }  # NDNs Node -10,-2
    [pscustomobject]@{ X =  296034.28195185;  Y =  -16646.82228586;  Longitude =  30; Latitude =  -2 }  # NDNs Node  30,-2
    [pscustomobject]@{ X =  545611.42042398;  Y =  -16682.757095246; Longitude =  55; Latitude =  -2 }  # NDNs Node  55,-2
    [pscustomobject]@{ X =  845354.16623852;  Y =  -16623.40624054;  Longitude =  84; Latitude =  -2 }  # NDNs Node  84,-2
    [pscustomobject]@{ X = 1095476.7723232;   Y =  -16733.820756782; Longitude = 110; Latitude =  -2 }  # NDNs Node 110,-2
    [pscustomobject]@{ X = 1495063.7860711;   Y =  -16926.391849368; Longitude = 150; Latitude =  -2 }  # NDNs Node 150,-2
    [pscustomobject]@{ X =  695606.68111178;  Y = -166621.95089079;  Longitude =  70; Latitude = -17 }  # NDNs Node  70,-17
    [pscustomobject]@{ X =  695749.95512462;  Y = -416454.76491902;  Longitude =  70; Latitude = -42 }  # NDNs Node  70,-42
    [pscustomobject]@{ X =  695687.08813581;  Y = -816572.22171484;  Longitude =  70; Latitude = -82 }  # NDNs Node  70,-82
    [pscustomobject]@{ X =  695504.92162631;  Y =  133264.42817258;  Longitude =  70; Latitude =  14 }  # NDNs Node  70, 14
    [pscustomobject]@{ X =  695312.33305742;  Y =  383013.10447412;  Longitude =  70; Latitude =  38 }  # NDNs Node  70, 38
    [pscustomobject]@{ X =  695386.51822651;  Y =  783130.57702177;  Longitude =  70; Latitude =  78 }  # NDNs Node  70, 78
)

# ---------------------------------------------------------------------------
# Compute linear scale/offset coefficients
#   X scale: widest horizontal pair  -> index 0 (-10,-2)  and index 5 (150,-2)
#   Y scale: widest vertical pair    -> index 8 (70,-82)  and index 11 (70,78)
# ---------------------------------------------------------------------------
$P1 = $ReferencePoints[0]   # (-10, -2)  – leftmost longitude
$P2 = $ReferencePoints[5]   # (150, -2)  – rightmost longitude
$P3 = $ReferencePoints[8]   # (70,  -82) – lowest latitude
$P4 = $ReferencePoints[11]  # (70,   78) – highest latitude

$ScaleX  = ($P2.Longitude - $P1.Longitude) / ($P2.X - $P1.X)
$OffsetX = $P1.Longitude - $P1.X * $ScaleX

$ScaleY  = ($P4.Latitude - $P3.Latitude) / ($P4.Y - $P3.Y)
$OffsetY = $P3.Latitude - $P3.Y * $ScaleY

# ---------------------------------------------------------------------------
# Convert and output
# ---------------------------------------------------------------------------
[pscustomobject]@{
    Longitude = $X * $ScaleX + $OffsetX
    Latitude  = $Y * $ScaleY + $OffsetY
}
