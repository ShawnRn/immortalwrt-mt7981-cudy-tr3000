local i18n = require "luci.i18n"
local http = require "luci.http"
local util = require "luci.util"
local fs = require "nixio.fs"

module("luci.controller.quickstart", package.seeall)

local function json_response(result, success, extra)
	local payload = extra or {}

	payload.success = success or 0
	payload.result = result

	http.prepare_content("application/json")
	http.write_json(payload)
end

local function vue_lang()
	local lang = i18n.translate("quickstart_vue_lang")

	if lang == "quickstart_vue_lang" or lang == "" then
		lang = "en"
	end

	return lang
end

function index()
	entry({"admin", "quickstart"}, template("quickstart/home"), _("主页"), 1).leaf = true
	entry({"admin", "quickstart", "api", "system", "status"}, call("api_system_status")).leaf = true
	entry({"admin", "quickstart", "api", "u", "system", "version"}, call("api_system_version")).leaf = true
	entry({"admin", "quickstart", "api", "system", "check-update"}, call("api_check_update")).leaf = true
	entry({"admin", "quickstart", "api", "u", "network", "status"}, call("api_network_status")).leaf = true
	entry({"admin", "quickstart", "api", "network", "device", "list"}, call("api_device_list")).leaf = true
end

function quickstart_index(param)
	luci.template.render("quickstart/main", {
		prefix = luci.dispatcher.build_url(unpack(param.index)),
		lang = vue_lang()
	})
end

local function first_line(path)
	local data = fs.readfile(path)

	if not data then
		return nil
	end

	return data:match("([^\r\n]+)")
end

local function cpu_temperature_from_thermal()
	local best

	for zone in fs.glob("/sys/class/thermal/thermal_zone*") do
		local temp = tonumber(first_line(zone .. "/temp"))

		if temp then
			local zone_type = first_line(zone .. "/type") or ""

			if temp > 1000 then
				temp = temp / 1000
			end

			if zone_type:lower():find("cpu", 1, true) then
				return math.floor(temp * 10 + 0.5) / 10
			end

			best = best or temp
		end
	end

	if best then
		return math.floor(best * 10 + 0.5) / 10
	end

	return nil
end

local function cpu_temperature_from_ubus()
	local info = util.ubus("luci", "getTempInfo", {})

	if type(info) == "table" then
		for _, value in pairs(info) do
			if type(value) == "string" then
				local temp = tonumber(value:match("([%d%.]+)"))

				if temp then
					return temp
				end
			elseif type(value) == "number" then
				if value > 1000 then
					value = value / 1000
				end

				return math.floor(value * 10 + 0.5) / 10
			end
		end
	end

	return nil
end

local function cpu_temperature()
	return cpu_temperature_from_thermal() or cpu_temperature_from_ubus() or 0
end

local function cpu_usage()
	local load = tonumber((first_line("/proc/loadavg") or ""):match("^([%d%.]+)")) or 0
	local cores = tonumber(util.exec("grep -c '^processor' /proc/cpuinfo 2>/dev/null"):match("%d+")) or 1
	local usage = math.floor((load / math.max(cores, 1)) * 100 + 0.5)

	if usage < 0 then
		return 0
	end

	if usage > 100 then
		return 100
	end

	return usage
end

local function mem_available_percentage()
	local total
	local available

	for line in io.lines("/proc/meminfo") do
		local key, value = line:match("^(%S+):%s+(%d+)")

		if key == "MemTotal" then
			total = tonumber(value)
		elseif key == "MemAvailable" then
			available = tonumber(value)
		end
	end

	if total and available and total > 0 then
		return math.floor((available / total) * 100 + 0.5)
	end

	return 100
end

local function board_name()
	return first_line("/tmp/sysinfo/model") or first_line("/proc/device-tree/model") or "ShawnWrt"
end

local function firmware_version()
	local release = first_line("/etc/openwrt_release") or ""
	local version = release:match("DISTRIB_DESCRIPTION='([^']+)'") or release:match('DISTRIB_DESCRIPTION="([^"]+)"')

	return version or "ShawnWrt"
end

local function kernel_version()
	return first_line("/proc/sys/kernel/osrelease") or ""
end

local function uptime_seconds()
	return math.floor(tonumber((first_line("/proc/uptime") or ""):match("^([%d%.]+)")) or 0)
end

function api_system_status()
	json_response({
		cpuUsage = cpu_usage(),
		cpuTemperature = cpu_temperature(),
		memAvailablePercentage = mem_available_percentage(),
		localtime = os.date("%Y-%m-%d %H:%M:%S"),
		uptime = uptime_seconds()
	})
end

function api_system_version()
	json_response({
		model = board_name(),
		firmwareVersion = firmware_version(),
		kernelVersion = kernel_version()
	})
end

function api_check_update()
	json_response({
		needUpdate = false,
		msg = "disabled"
	})
end

function api_network_status()
	json_response({
		networkInfo = "netSuccess",
		uptimeStamp = uptime_seconds()
	})
end

function api_device_list()
	json_response({
		devices = {},
		hosts = {}
	})
end
