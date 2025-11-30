print("[T1KTLCVoyageLogDumper] Mod loaded\n")

require("jsonshim")

local function dumpVoyageLogs()
    print("[T1KTLCVoyageLogDumper] Dumping voyage logs...\n")
    local voyageLogs = FindAllOf("VoyageLogData")
    local voyageFragments = FindAllOf("VoyageLogFragment")
    local frags = {}
    local dump = {}
    print(string.format("[T1KTLCVoyageLogDumper] Found %d voyage logs and %d fragments\n", #voyageLogs, #voyageFragments))

    for _, fragment in ipairs(voyageFragments) do
        local path = fragment:GetFullName()
        --split path by . and take last part
        local pathParts = {}
        for part in string.gmatch(path, "[^%.]+") do
            table.insert(pathParts, part)
        end
        path = pathParts[#pathParts]
        --split path by : and make parent first part
        local parent = string.match(path, "([^:]+)")

        table.insert(frags, {
            id = path,
            title = fragment.Name:ToString(),
            description = fragment.Text:ToString(),
            parent = parent,
        })
    end

    for _, log in ipairs(voyageLogs) do
        local logId = log:GetFName():ToString()
        local fragments = {}
        
        -- Find matching fragments for this log
        for _, frag in ipairs(frags) do
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

    -- DumpObject(voyageFragments[1])

    local file = io.open("voyage_logs_dump.json", "w")
    if file then
        file:write(toJSON(dump, "  ", {"id", "title", "description", "footer", "fragments", "parent"}))
        file:close()
        print("[T1KTLCVoyageLogDumper] Voyage logs dumped to voyage_logs_dump.json\n")
    else
        print("[T1KTLCVoyageLogDumper] Failed to open file for writing\n")
    end
end

-- Register key bind for Control + F3
-- RegisterKeyBind(Key.F3, { ModifierKey.CONTROL }, function()
RegisterKeyBind(Key.F3, { }, function()
    ExecuteInGameThread(function()
        dumpVoyageLogs()
    end)
end)
