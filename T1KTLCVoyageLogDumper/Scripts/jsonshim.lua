-- Basic function to convert Lua table to JSON string
function toJSON(value, indent, keyOrder)
    indent = indent or ""
    local valueType = type(value)
    
    if valueType == "table" then
        local isArray = true
        local count = 0
        
        -- Check if it's an array
        for k, v in pairs(value) do
            count = count + 1
            if type(k) ~= "number" or k ~= count then
                isArray = false
                break
            end
        end
        
        if isArray then
            -- Array format
            local result = "[\n"
            for i, v in ipairs(value) do
                result = result .. indent .. "  " .. toJSON(v, indent .. "  ", keyOrder)
                if i < #value then result = result .. "," end
                result = result .. "\n"
            end
            result = result .. indent .. "]"
            return result
        else
            -- Object format
            local result = "{\n"
            local first = true
            
            -- Use keyOrder if provided, otherwise use pairs
            if keyOrder then
                for _, k in ipairs(keyOrder) do
                    local v = value[k]
                    if v ~= nil then
                        if not first then result = result .. ",\n" end
                        first = false
                        result = result .. indent .. "  \"" .. tostring(k) .. "\": " .. toJSON(v, indent .. "  ", keyOrder)
                    end
                end
                -- Add any remaining keys not in keyOrder
                for k, v in pairs(value) do
                    local found = false
                    for _, orderedKey in ipairs(keyOrder) do
                        if k == orderedKey then
                            found = true
                            break
                        end
                    end
                    if not found then
                        if not first then result = result .. ",\n" end
                        first = false
                        result = result .. indent .. "  \"" .. tostring(k) .. "\": " .. toJSON(v, indent .. "  ", keyOrder)
                    end
                end
            else
                for k, v in pairs(value) do
                    if not first then result = result .. ",\n" end
                    first = false
                    result = result .. indent .. "  \"" .. tostring(k) .. "\": " .. toJSON(v, indent .. "  ", keyOrder)
                end
            end
            
            result = result .. "\n" .. indent .. "}"
            return result
        end
    elseif valueType == "string" then
        -- Escape special characters
        local escaped = value:gsub("\\", "\\\\"):gsub("\"", "\\\""):gsub("\n", "\\n"):gsub("\r", "\\r"):gsub("\t", "\\t")
        return "\"" .. escaped .. "\""
    elseif valueType == "number" or valueType == "boolean" then
        return tostring(value)
    elseif value == nil then
        return "null"
    else
        return "\"" .. tostring(value) .. "\""
    end
end
