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

-- Lookup table mapping BP_Maze_RoomNumber_C instance IDs to their room label and number.
-- Data sourced from voyage_maze_numbers_dump.json.
local maze_room_data = {
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1234426662"] = { room = "B3"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1243881663"] = { room = "C3"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1247787664"] = { room = "E2"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1287405665"] = { room = "G1"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1287408666"] = { room = "H1"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1314575667"] = { room = "G3"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1314579669"] = { room = "E4"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1346505670"] = { room = "C4"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1368127671"] = { room = "E1"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1439821676"] = { room = "E3"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1447221677"] = { room = "F1"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1452373678"] = { room = "D1"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1610597680"] = { room = "C1"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1610600681"] = { room = "D2"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1631718683"] = { room = "C2"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1637197684"] = { room = "B1"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1648634685"] = { room = "F2"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390A3B502_64fd9582c515c2dc_1881279947"] = { room = "B2"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390A6B502_64fd9582c515c2dc_1216033503"] = { room = "G2"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1314578668"] = { room = "A1"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1385192673"] = { room = "A3"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1616968682"] = { room = "F3"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390A6B502_64fd9582c515c2dc_1950753544"] = { room = "A2"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_1975299502"] = { room = "X1"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_1988757503"] = { room = "X2"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_1990989504"] = { room = "X3"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_1999012505"] = { room = "X4"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_1999015506"] = { room = "X5"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_1999016507"] = { room = "X6"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_2000328508"] = { room = "X7"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_2000331509"] = { room = "X8"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_2000333510"] = { room = "X9"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3904DC002_1bbf791c380ff3a9_1939940165"] = { room = "997"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390E0B502_64fd9582c515c2dc_1214822351"] = { room = "998"},
}

--- Returns the room label for a given BP_Maze_RoomNumber_C instance ID.
--- @param id string  The full instance ID (last path segment after the final dot)
--- @return string room  e.g. "A1", or nil if not found
local function GetMazeRoomInfo(id)
    local entry = maze_room_data[id]
    if entry then
        return entry.room
    end
    return nil
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

        local room = GetMazeRoomInfo(class)

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
            room = room,
            -- useRandom = cmp.UseRandomNumber,
            -- description = cmp.Text:ToString(),
            -- parent = parent,
        })
    end

    --sort dump by ID so it the same order in exported JSON every time
    table.sort(dump, function(a, b)
        local idA = tonumber(a.id) or a.id
        local idB = tonumber(b.id) or b.id
        return idA < idB
    end)

    local file = io.open("voyage_maze_numbers_dump.json", "w")
    if file then
        file:write(toJSON(dump, "  ", {"id", "num", "room", "class"}))
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

local modNumbers = {
    ["A1"]  = { num = "097" },
    ["A2"]  = { num = "063" },
    ["A3"]  = { num = "046" },
    ["B1"]  = { num = "060" },
    ["B2"]  = { num = "046" },
    ["B3"]  = { num = "097" },
    ["C1"]  = { num = "049" },
    ["C2"]  = { num = "060" },
    ["C3"]  = { num = "097" },
    ["C4"]  = { num = "063" },
    ["D1"]  = { num = "063" },
    ["D2"]  = { num = "097" },
    ["E1"]  = { num = "027" },
    ["E2"]  = { num = "060" },
    ["E3"]  = { num = "049" },
    ["E4"]  = { num = "060" },
    ["F1"]  = { num = "097" },
    ["F2"]  = { num = "046" },
    ["F3"]  = { num = "063" },
    ["G1"]  = { num = "097" },
    ["G2"]  = { num = "063" },
    ["G3"]  = { num = "027" },
    ["H1"]  = { num = "046" },
    ["X1"]  = { num = "067" },
    ["X2"]  = { num = "098" },
    ["X3"]  = { num = "008" },
    ["X4"]  = { num = "060" },
    ["X5"]  = { num = "062" },
    ["X6"]  = { num = "048" },
    ["X7"]  = { num = "023" },
    ["X8"]  = { num = "012" },
    ["X9"]  = { num = "055" },
    ["997"] = { num = "997" },
    ["998"] = { num = "998" },
}


local function ModRoomNumbersRandom()
    local roomNumbers = FindAllOf("BP_Maze_RoomNumber_C")
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

        local room = GetMazeRoomInfo(class)
        if room == "B3" then
            -- print(string.format("Modifying room %s (ID: %s)", room, id))
            -- print(string.format("Original material: %s", DecalActor and DecalActor.DecalMaterial and DecalActor.DecalMaterial:GetFullName() or "None"))
            for i, decal in ipairs({ cmp.Decal_0, cmp.Decal_1, cmp.Decal_2 }) do
                if decal then
                -- get a random number between 0 and 9
                local i = math.random(0, 9)
                local newMat = StaticFindObject(string.format("/Game/Materials/Decals/MI_Decal_Number_%d_Sharp.MI_Decal_Number_%d_Sharp", i, i))
                -- print(string.format("Setting new material: %s", newMat and newMat:GetFullName() or "None"))
                if decal then
                    decal:SetDecalMaterial(newMat)
                    -- print(string.format("Room %s (ID: %s) material changed to %s", room, id, newMat and newMat:GetFullName() or "None"))
                    decal:SetVisibility(true, true)
                end
            end
            end
        else
            -- print(string.format("No room info found for %s", id))
        end
    end
end

local function ModRoomNumbers()
    local roomNumbers = FindAllOf("BP_Maze_RoomNumber_C")
    for _, cmp in ipairs(roomNumbers) do
        local path = cmp:GetFullName()
        local pathParts = {}
        for part in string.gmatch(path, "[^%.]+") do
            table.insert(pathParts, part)
        end
        local class = pathParts[#pathParts]

        local room = GetMazeRoomInfo(class)
        local entry = room and modNumbers[room]
        if entry then
            local num = entry.num  -- e.g. "067"
            local digits = { tonumber(string.sub(num, 1, 1)), tonumber(string.sub(num, 2, 2)), tonumber(string.sub(num, 3, 3)) }
            for i, decal in ipairs({ cmp.Decal_0, cmp.Decal_1, cmp.Decal_2 }) do
                if decal then
                    local newMat = StaticFindObject(string.format("/Game/Materials/Decals/MI_Decal_Number_%d_Sharp.MI_Decal_Number_%d_Sharp", digits[i], digits[i]))
                    if newMat then
                        decal:SetDecalMaterial(newMat)
                        decal:SetVisibility(true, true)
                    end
                end
            end
            print(string.format("[T1KTLCVoyageLogDumper] Set room %s to %s\n", room, num))
        end
    end
end

-- Register key bind for F5
RegisterKeyBind(Key.F5, { }, function()
    ExecuteInGameThread(function()
        ModRoomNumbers()
    end)
end)

local function ModifyBuildNumber()
    --TextBlock /Engine/Transient.VoyageGameEngine_2147482588:BP_VoyageGameInstance_C_2147482532.BP_PlayingWidget_C_2147481997.WidgetTree_2147481996.BuildNumberText
    local allText = FindAllOf("TextBlock")
    local buildNumberText = nil
    for _, tb in ipairs(allText) do
        if tb:GetFName():ToString() == "BuildNumberText" and tb:GetFullName():find("PlayingWidget") and tb:GetFullName():find("/Engine") then
            print(string.format("Found BuildNumberText: %s\n", tb:GetFullName()))
            buildNumberText = tb
            break
        end
    end
    if buildNumberText then
        print(string.format("Original build number text: %s\n", buildNumberText.Text:ToString()))
        -- buildNumberText.Text = "Voyage v1.1 Modded"
        buildNumberText:SetText({["SourceString"] = "Voyage v1.1 Modded"})
        print(string.format("Modified build number text: %s\n", buildNumberText.Text:ToString()))
    end
end

-- Register key bind for F6
RegisterKeyBind(Key.F6, { }, function()
    ExecuteInGameThread(function()
        ModifyBuildNumber()
    end)
end)

local function PrintLookingAt()
    local controller = FindFirstOf("BP_VoyagePlayerController_C")
    if not controller then
        print("[T1KTLCVoyageLogDumper] No player controller found\n")
        return
    end

    -- Safely get rotation via pcall since IsValid() doesn't catch all null wrappers
    local ok, viewRot = pcall(function() return controller.ControlRotation end)
    if not ok or not viewRot then
        print("[T1KTLCVoyageLogDumper] Controller is invalid (null wrapper)\n")
        return
    end

    -- Get pawn from controller properties (AcknowledgedPawn is the confirmed possessed pawn)
    local pawn = nil
    local pawnName = nil
    for _, prop in ipairs({ "AcknowledgedPawn", "Pawn" }) do
        local ok, p = pcall(function() return controller[prop] end)
        if ok and p then
            local okLoc, loc = pcall(function() return p:K2_GetActorLocation() end)
            if not okLoc then okLoc, loc = pcall(function() return p:GetActorLocation() end) end
            if okLoc and loc and loc.X ~= 0 then
                pawn = p
                local _, name = pcall(function() return p:GetFullName() end)
                pawnName = name or prop
                break
            end
        end
    end
    if not pawn then
        print("[T1KTLCVoyageLogDumper] No live pawn found via controller properties\n")
        return
    end
    print(string.format("[T1KTLCVoyageLogDumper] Using pawn: %s\n", pawnName))

    local _, viewLoc = pcall(function() return pawn:K2_GetActorLocation() end)
    if not viewLoc then _, viewLoc = pcall(function() return pawn:GetActorLocation() end) end
    if not viewLoc then
        print("[T1KTLCVoyageLogDumper] Could not get pawn location\n")
        return
    end

    print(string.format("[T1KTLCVoyageLogDumper] ViewLoc: %.1f %.1f %.1f  Rot: P=%.1f Y=%.1f\n",
        viewLoc.X, viewLoc.Y, viewLoc.Z, viewRot.Pitch, viewRot.Yaw))

    -- Build trace end point 5000 units forward
    local traceDistance = 5000.0
    local pitchRad = math.rad(viewRot.Pitch)
    local yawRad   = math.rad(viewRot.Yaw)
    local fwdX = math.cos(pitchRad) * math.cos(yawRad)
    local fwdY = math.cos(pitchRad) * math.sin(yawRad)
    local fwdZ = math.sin(pitchRad)

    -- Find the actor most aligned with the player's forward view within range.
    -- Uses dot product instead of a line trace (avoids UWorld null issues).
    local maxDist = 3000.0
    local bestActor = nil
    local bestScore = -math.huge

    local allActors = FindAllOf("Actor")
    for _, actor in ipairs(allActors or {}) do
        local okLoc, aLoc = pcall(function() return actor:K2_GetActorLocation() end)
        if not okLoc then okLoc, aLoc = pcall(function() return actor:GetActorLocation() end) end
        if okLoc and aLoc then
            local dx = aLoc.X - viewLoc.X
            local dy = aLoc.Y - viewLoc.Y
            local dz = aLoc.Z - viewLoc.Z
            local dist = math.sqrt(dx*dx + dy*dy + dz*dz)
            if dist > 10 and dist < maxDist then
                -- dot product with forward vector (normalized)
                local dot = (dx*fwdX + dy*fwdY + dz*fwdZ) / dist
                -- score: must be mostly in front (dot > 0.9 ~= within ~26 degrees), penalise distance
                if dot > 0.9 then
                    local score = dot - (dist / maxDist) * 0.1
                    if score > bestScore then
                        local okName, name = pcall(function() return actor:GetFullName() end)
                        -- skip the player pawn itself
                        if okName and name ~= pawnName then
                            bestScore = score
                            bestActor = actor
                        end
                    end
                end
            end
        end
    end

    if bestActor then
        local _, name = pcall(function() return bestActor:GetFullName() end)
        print(string.format("[T1KTLCVoyageLogDumper] Looking at: %s\n", name or "unknown"))
        -- Print all properties
        local ok, props = pcall(function()
            for k, v in pairs(bestActor:GetProperties()) do
                print(string.format("  %s = %s\n", tostring(k), tostring(v)))
            end
        end)
        if not ok then
            -- fallback: just print class and name
            print(string.format("[T1KTLCVoyageLogDumper] (GetProperties not available, name above is all we have)\n"))
        end
    else
        print("[T1KTLCVoyageLogDumper] Not looking at anything within range\n")
    end
end

-- Register key bind for F7
RegisterKeyBind(Key.F7, { }, function()
    ExecuteInGameThread(function()
        PrintLookingAt()
    end)
end)

local function ModStringTable()
    -- local dataTable = FindObject("DataTable", "/Game/Path/To/Your/DataTable.YourDataTable") -- Replace with the actual path

    -- if dataTable:IsValid() then
    --     -- Find the row by its key (e.g., "on")
    --     local row = dataTable:FindRow("on")

    --     if row then
    --         -- Update the value of a specific field in the row (e.g., "SourceString" or similar)
    --         -- The actual field name depends on the game's struct definition
    --         row.SomeStringField = "My Updated String"
    --     else
    --         print("Entry not found")
    --     end
    -- else
    --     print("Data table not found")
    -- end
    local stringTable = FindObject("StringTable", "/Game/LocalizationStringTables/ST_Terminal.ST_Terminal")
    if stringTable then
        print(string.format("[T1KTLCVoyageLogDumper] Found string table: %s\n", stringTable:GetFullName()))
        -- Dump all entries
        local ok, entries = pcall(function() return stringTable.Entries end)
        -- if ok and entries then
        --     for _, entry in ipairs(entries) do
        --         local key = entry.Key
        --         local value = entry.Value
        --         if key == "Camer_Transposium_998room" then
        --             value = "000"
        --             entry.Value = value  -- Update the value in the string table
        --         end
        --         print(string.format("  %s = %s\n", key, value))
        --     end
        -- else
        --     print("[T1KTLCVoyageLogDumper] Could not access string table entries\n")
        -- end

        local key = "Camer_Transposium_998room"

        local okRead, oldVal = pcall(function() return entries[key] end)
        if not okRead then
            print("[T1KTLCVoyageLogDumper] Failed reading key\n")
            return
        end

        print(string.format("[T1KTLCVoyageLogDumper] %s old = %s\n", key, tostring(oldVal.SourceString)))

        local okWrite = pcall(function() entries[key].SourceString = "000" end)
        if not okWrite then
            print("[T1KTLCVoyageLogDumper] Failed writing key\n")
            return
        end

    else
        print("[T1KTLCVoyageLogDumper] No VoyageStringTable found\n")
    end
end

-- f8
RegisterKeyBind(Key.F8, { }, function()
    ExecuteInGameThread(function()
        ModStringTable()
    end)
end)

local advanceOrder = {000, 001, 002, 003, 004, 005, 006, 007, 008, 009,
                      010, 014, 041, 098, 099, 104, 401
                    }
local advanceIndex = 1

local function AdvanceMatrixNumbers()
    local roomNumbers = FindAllOf("BP_Maze_RoomNumber_C")

    local num = advanceOrder[advanceIndex]
    advanceIndex = advanceIndex + 1
    if advanceIndex > #advanceOrder then
        advanceIndex = 1
    end

    for _, cmp in ipairs(roomNumbers) do
        local path = cmp:GetFullName()
        local pathParts = {}
        for part in string.gmatch(path, "[^%.]+") do
            table.insert(pathParts, part)
        end
        local class = pathParts[#pathParts]

        local room = GetMazeRoomInfo(class)
        -- room starts with X
        if room and string.sub(room, 1, 1) == "X" then
            local numStr = string.format("%03d", num)
            local digits = { tonumber(string.sub(numStr, 1, 1)), tonumber(string.sub(numStr, 2, 2)), tonumber(string.sub(numStr, 3, 3)) }
            for i, decal in ipairs({ cmp.Decal_0, cmp.Decal_1, cmp.Decal_2 }) do
                if decal then
                    local newMat = StaticFindObject(string.format("/Game/Materials/Decals/MI_Decal_Number_%d_Sharp.MI_Decal_Number_%d_Sharp", digits[i], digits[i]))
                    if newMat then
                        decal:SetDecalMaterial(newMat)
                        decal:SetVisibility(true, true)
                    end
                end
            end
            print(string.format("[T1KTLCVoyageLogDumper] Set room %s to %s\n", room, numStr))
        end
    end
end

RegisterKeyBind(Key.F9, { }, function()
    ExecuteInGameThread(function()
        AdvanceMatrixNumbers()
    end)
end)