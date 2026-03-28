--[[ TLCVoyageLogDumper
    A UE4SS mod for dumping voyage logs and map locations from the game "Voyage".
    Author: T1K (The1Killer)
    Version: 1.1
    Description: This mod allows you to dump voyage logs and map locations to JSON files for analysis and reference.
    Keybinds:
        - F3: Dump voyage logs to "voyage_logs_dump.json"
        - F2: Dump voyage map locations to "voyage_location_dump.json"
]]

--[[
    Map in-game coordinates (x, y) to map coordinates (longitude, latitude)
    using reference points from voyage_location_dump.json and locations.json.
    This function assumes a linear mapping based on two known reference points.
]]

-- Reference points using NDNS nodes (exact coordinates match their names)
-- NDNS nodes are named by their map coords, so mapping is precise.
local reference_points = {
    -- NDNs Node -10,-2 (GrowthContainer03)
    { x = -104096.06372284, y = -16634.833630295, longitude = -10, latitude = -2 },
    -- NDNs Node 30,-2 (GrowthContainer02)
    { x = 296034.28195185, y = -16646.82228586, longitude = 30, latitude = -2 },
    -- NDNs Node 55,-2 (GrowthContainer01)
    { x = 545611.42042398, y = -16682.757095246, longitude = 55, latitude = -2 },
    -- NDNs Node 84,-2 (GrowthContainer04)
    { x = 845354.16623852, y = -16623.40624054, longitude = 84, latitude = -2 },
    -- NDNs Node 110,-2 (GrowthContainer05)
    { x = 1095476.7723232, y = -16733.820756782, longitude = 110, latitude = -2 },
    -- NDNs Node 150,-2 (GrowthContainer06)
    { x = 1495063.7860711, y = -16926.391849368, longitude = 150, latitude = -2 },
    -- NDNs Node 70,-17 (GrowthContainer07)
    { x = 695606.68111178, y = -166621.95089079, longitude = 70, latitude = -17 },
    -- NDNs Node 70,-42 (GrowthContainer08)
    { x = 695749.95512462, y = -416454.76491902, longitude = 70, latitude = -42 },
    -- NDNs Node 70,-82 (GrowthContainer09)
    { x = 695687.08813581, y = -816572.22171484, longitude = 70, latitude = -82 },
    -- NDNs Node 70,14 (GrowthContainer10)
    { x = 695504.92162631, y = 133264.42817258, longitude = 70, latitude = 14 },
    -- NDNs Node 70,38 (GrowthContainer11)
    { x = 695312.33305742, y = 383013.10447412, longitude = 70, latitude = 38 },
    -- NDNs Node 70,78 (GrowthContainer12)
    { x = 695386.51822651, y = 783130.57702177, longitude = 70, latitude = 78 },
}

-- Calculate linear mapping coefficients for x->longitude and y->latitude
local function compute_linear_map(p1, p2)
    local dx = p2.x - p1.x
    local dy = p2.y - p1.y
    local dlon = p2.longitude - p1.longitude
    local dlat = p2.latitude - p1.latitude
    local scale_x = dlon / dx
    local scale_y = dlat / dy
    local offset_x = p1.longitude - p1.x * scale_x
    local offset_y = p1.latitude - p1.y * scale_y
    return scale_x, offset_x, scale_y, offset_y
end

-- Use two maximally separated NDNS nodes for best accuracy:
-- p1: NDNs Node -10,-2 (leftmost X) for X-axis scale
-- p2: NDNs Node 150,-2 (rightmost X) for X-axis scale
-- p3: NDNs Node 70,-82 (lowest Y) for Y-axis scale
-- p4: NDNs Node 70,78 (highest Y) for Y-axis scale
local p1 = reference_points[1]   -- (-10, -2)
local p2 = reference_points[6]   -- (150, -2)
local p3 = reference_points[9]   -- (70, -82)
local p4 = reference_points[12]  -- (70, 78)

-- Compute X scale from horizontal pair, Y scale from vertical pair
local scale_x = (p2.longitude - p1.longitude) / (p2.x - p1.x)
local offset_x = p1.longitude - p1.x * scale_x
local scale_y = (p4.latitude - p3.latitude) / (p4.y - p3.y)
local offset_y = p3.latitude - p3.y * scale_y

-- Main mapping function
function MapIngameToMapCoords(x, y)
    -- x, y: in-game coordinates
    -- returns: longitude, latitude (map coordinates)
    local longitude = x * scale_x + offset_x
    local latitude = y * scale_y + offset_y
    return longitude, latitude
end

-- Example usage:
-- local lon, lat = MapIngameToMapCoords(887149.48930109, 271982.28465284)
-- print(lon, lat)  -- Should be close to 88, 27
print("[T1KTLCVoyageLogDumper] Mod loaded\n")

require("jsonshim")

local function dumpVoyageLogs()
    print("[T1KTLCVoyageLogDumper] Dumping voyage logs...\n")
    local voyageLogs = FindAllOf("VoyageLogData")
    local voyageComponents = FindAllOf("VoyageLogFragment")
    local comps = {}
    local dump = {}
    print(string.format("[T1KTLCVoyageLogDumper] Found %d voyage logs and %d fragments\n", #voyageLogs, #voyageComponents))

    for _, cmp in ipairs(voyageComponents) do
        local path = cmp:GetFullName()
        --split path by . and take last part
        local pathParts = {}
        for part in string.gmatch(path, "[^%.]+") do
            table.insert(pathParts, part)
        end
        path = pathParts[#pathParts]
        --split path by : and make parent first part
        local parent = string.match(path, "([^:]+)")

        table.insert(comps, {
            id = path,
            title = cmp.Name:ToString(),
            description = cmp.Text:ToString(),
            parent = parent,
        })
    end

    for _, log in ipairs(voyageLogs) do
        local logId = log:GetFName():ToString()
        local fragments = {}
        
        -- Find matching fragments for this log
        for _, frag in ipairs(comps) do
            if frag.parent == logId then
                table.insert(fragments, {
                    id = frag.id,
                    title = frag.title,
                    description = frag.description,
                })
            end
        end
        
        table.insert(dump, {
            id = logId,
            title = log.Name:ToString(),
            description = log.Description:ToString(),
            footer = log.DescriptionFooter:ToString(),
            fragments = fragments,
        })
    end

    -- DumpObject(voyageComponents[1])

    local file = io.open("voyage_logs_dump.json", "w")
    if file then
        file:write(toJSON(dump, "  ", {"id", "title", "description", "footer", "fragments", "parent"}))
        file:close()
        print("[T1KTLCVoyageLogDumper] Voyage logs dumped to voyage_logs_dump.json\n")
    else
        print("[T1KTLCVoyageLogDumper] Failed to open file for writing\n")
    end
end

local function dumpVoyageMapLocations()
    print("[T1KTLCVoyageLogDumper] Dumping voyage map locations...\n")
    local voyageLocations = FindAllOf("VoyageLocation")
    local voyageComponents = FindAllOf("VoyageLocatorComponent")
    local comps = {}
    local dump = {}
    print(string.format("[T1KTLCVoyageLogDumper] Found %d voyage locations and %d components\n", #voyageLocations, #voyageComponents))

    for _, cmp in ipairs(voyageComponents) do
        local path = cmp:GetFullName()
        --split path by . and take last part
        local pathParts = {}
        for part in string.gmatch(path, "[^%.]+") do
            table.insert(pathParts, part)
        end
        path = pathParts[#pathParts-1]
        --split path by : and make parent first part
        -- local parent = string.match(path, "([^:]+)")

        local lon, lat = MapIngameToMapCoords(cmp.RelativeLocation.x, cmp.RelativeLocation.y)

        table.insert(comps, {
            class = path,
            id = cmp.properties.Name:ToString(),
            x = cmp.RelativeLocation.X,
            y = cmp.RelativeLocation.Y,
            z = cmp.RelativeLocation.Z,
            lon = lon,
            lat = lat,
            title = cmp.properties.DisplayName:ToString(),
            group = cmp.properties.Group:ToString(),
            -- description = cmp.Text:ToString(),
            -- parent = parent,
        })
    end

    -- DumpObject(voyageComponents[1])

    local file = io.open("voyage_location_dump.json", "w")
    if file then
        file:write(toJSON(comps, "  ", {"id", "title", "group", "x", "y", "z","class"}))
        file:close()
        print("[T1KTLCVoyageLogDumper] Voyage locations dumped to voyage_location_dump.json\n")
    else
        print("[T1KTLCVoyageLogDumper] Failed to open file for writing\n")
    end
end

local function dumpVoyageMazeRoomNumbers()
    print("[T1KTLCVoyageLogDumper] Dumping voyage maze room numbers...\n")
    -- local voyageLocations = FindAllOf("VoyageLocation")
    local roomNumbers = FindAllOf("BP_Maze_RoomNumber_C")
    local dump = {}
    print(string.format("[T1KTLCVoyageLogDumper] Found %d room numbers\n", #roomNumbers))

    -- BP_Maze_RoomNumber_C /Game/Maps/VoyageWorld2/_Generated_/5TF4A0F0ZHMO6BIX2MHR52922.VoyageWorld2:PersistentLevel.BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1314578668

    for _, cmp in ipairs(roomNumbers) do
        local path = cmp:GetFullName()
        --split path by . and take last part
        local pathParts = {}
        for part in string.gmatch(path, "[^%.]+") do
            table.insert(pathParts, part)
        end
        local class = pathParts[#pathParts]
        pathParts = {}
        for part in string.gmatch(class, "[^%_]+") do
            table.insert(pathParts, part)
        end
        local id = pathParts[#pathParts]

        local d = {}
        for i, decal in ipairs({ cmp.Decal_0, cmp.Decal_1, cmp.Decal_2 }) do
            local val = "None"
            if decal and decal.DecalMaterial then
                local matName = decal.DecalMaterial:GetFullName()
                -- print(string.format("Decal %d material: %s", i, matName))
                -- Extract the number from the material name using pattern matching
                val = string.match(matName, "MI_Decal_Number_(%d+)") or val 
            end
            d[i] = val
        end

        table.insert(dump, {
            class = class,
            id = id,
            num = ""..d[1]..d[2]..d[3],
            -- useRandom = cmp.UseRandomNumber,
            -- description = cmp.Text:ToString(),
            -- parent = parent,
        })
    end

    -- DumpObject(voyageComponents[1])

    local file = io.open("voyage_maze_numbers_dump.json", "w")
    if file then
        file:write(toJSON(dump, "  ", {"id", "num", "class"}))
        file:close()
        print("[T1KTLCVoyageLogDumper] Voyage maze room numbers dumped to voyage_maze_numbers_dump.json\n")
    else
        print("[T1KTLCVoyageLogDumper] Failed to open file for writing\n")
    end
end


-- Register key bind for Control + F3
-- RegisterKeyBind(Key.F3, { ModifierKey.CONTROL }, function()

-- Register key bind for F2
RegisterKeyBind(Key.F2, { }, function()
    ExecuteInGameThread(function()
        dumpVoyageLogs()
        dumpVoyageMapLocations()
    end)
end)

-- Register key bind for F3
RegisterKeyBind(Key.F3, { }, function()
    ExecuteInGameThread(function()
        dumpVoyageMazeRoomNumbers()
    end)
end)



