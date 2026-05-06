--[[
LuCI - Lua Configuration Interface
Copyright 2026 Shawn Rain <shawn@shawnwrt.lan>
]]--

module("luci.controller.index", package.seeall)

function index()
    entry({"admin", "index"}, view("index/home"), _("主页"), 1).leaf = true
    entry({"admin", "index", "api", "system", "status"}, call("api_system_status")).leaf = true
    entry({"admin", "index", "api", "u", "system", "version"}, call("api_system_version")).leaf = true
    entry({"admin", "index", "api", "system", "check-update"}, call("api_check_update")).leaf = true
end

function get_json_lib()
    local ok, json = pcall(require, "luci.jsonc")
    if ok then 
        -- In luci.jsonc, it's stringify
        if json.stringify then return json, json.stringify end
    end
    ok, json = pcall(require, "luci.json")
    if ok then 
        -- In old luci.json, it's encode
        if json.encode then return json, json.encode end
    end
    return nil, nil
end

function api_system_status()
    local uci = require "luci.model.uci".cursor()
    local sys = require "luci.sys"
    local utl = require "luci.util"
    local http = require "luci.http"
    local json_lib, encode = get_json_lib()

    local result = {
        hostname = sys.hostname(),
        uptime = sys.uptime(),
        cpuUsage = 0,
        memoryUsage = 0,
        cpuTemperature = 0,
        wan_ip = "0.0.0.0",
        traffic = { rx_bytes = 0, tx_bytes = 0 },
        interfaces = {}
    }

    -- CPU Usage
    local f = io.open("/proc/stat", "r")
    if f then
        local line = f:read("*l")
        f:close()
        if line then
            local user, nice, system, idle = line:match("cpu%s+(%d+)%s+(%d+)%s+(%d+)%s+(%d+)")
            if user then
                local total = tonumber(user) + tonumber(nice) + tonumber(system) + tonumber(idle)
                local busy = tonumber(user) + tonumber(nice) + tonumber(system)
                result.cpuUsage = math.floor((busy / total) * 100)
            end
        end
    end

    -- Memory
    local mem = sys.memory()
    if mem and mem.total and mem.total > 0 then
        result.memoryUsage = math.floor(((mem.total - mem.free - mem.buffered - mem.cached) / mem.total) * 100)
    end

    -- Temperature
    local temp = utl.exec("cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null"):gsub("\n", "")
    if temp == "" then
        temp = utl.exec("ubus call luci getTempInfo 2>/dev/null | grep -oE '[0-9.]+' | head -n1"):gsub("\n", "")
    end
    if temp ~= "" then
        local t = tonumber(temp)
        if t then
            result.cpuTemperature = t > 1000 and (t / 1000) or t
        end
    end

    -- WAN IP
    local wan_if = uci:get("network", "wan", "device") or uci:get("network", "wan", "ifname") or "eth0"
    result.wan_ip = utl.exec("ifconfig " .. wan_if .. " 2>/dev/null | grep 'inet addr' | cut -d: -f2 | awk '{print $1}'"):gsub("\n", "")
    if result.wan_ip == "" then
        result.wan_ip = utl.exec("ip -4 addr show " .. wan_if .. " 2>/dev/null | grep inet | awk '{print $2}' | cut -d/ -f1 | head -n1"):gsub("\n", "")
    end

    result.traffic.rx_bytes = tonumber(utl.exec("cat /sys/class/net/" .. wan_if .. "/statistics/rx_bytes 2>/dev/null")) or 0
    result.traffic.tx_bytes = tonumber(utl.exec("cat /sys/class/net/" .. wan_if .. "/statistics/tx_bytes 2>/dev/null")) or 0

    -- Interfaces
    local ifnames = {"wan", "lan", "eap"}
    for _, n in ipairs(ifnames) do
        local dev = uci:get("network", n, "device") or uci:get("network", n, "ifname")
        if dev then
            local ip = utl.exec("ifconfig " .. dev .. " 2>/dev/null | grep 'inet addr' | cut -d: -f2 | awk '{print $1}'"):gsub("\n", "")
            if ip == "" then
                ip = utl.exec("ip -4 addr show " .. dev .. " 2>/dev/null | grep inet | awk '{print $2}' | cut -d/ -f1 | head -n1"):gsub("\n", "")
            end
            local speed = utl.exec("ethtool " .. dev .. " 2>/dev/null | grep Speed | grep -oE '[0-9]+' | head -n1"):gsub("\n", "")
            table.insert(result.interfaces, {
                name = n:upper(),
                device = dev,
                ip = (ip ~= "") and ip or nil,
                speed = (speed ~= "") and speed or nil
            })
        end
    end

    http.prepare_content("application/json")
    if encode then
        http.write(encode(json_lib, {result = result}))
    else
        http.write('{"result":{"hostname":"' .. result.hostname .. '"}}')
    end
end

function api_check_update()
    local utl = require "luci.util"
    local http = require "luci.http"
    local _, encode = get_json_lib()
    local check = utl.exec("/usr/bin/shawnwrt-ota status 2>/dev/null")
    local update = (check:find("Update Available") or check:find("发现新版本")) and true or false
    http.prepare_content("application/json")
    if encode then
        http.write(encode({update_available = update}))
    else
        http.write('{"update_available":' .. (update and 'true' or 'false') .. '}')
    end
end

function api_system_version()
    local utl = require "luci.util"
    local http = require "luci.http"
    local _, encode = get_json_lib()
    local version = utl.exec("cat /etc/shawnwrt_version 2>/dev/null || cat /etc/openwrt_version"):gsub("\n", "")
    http.prepare_content("application/json")
    if encode then
        http.write(encode({version = version}))
    else
        http.write('{"version":"' .. version .. '"}')
    end
end
