controls = {}
controls.settings = {}

controls.settings.left = {"scancode", {"left"}}
controls.settings.right = {"scancode", {"right"}}
controls.settings.up = {"scancode", {"up"}}
controls.settings.down = {"scancode", {"down"}}
controls.settings["return"] = {"scancode", {"return", "kpenter"}}
controls.settings.escape = {"scancode", {"escape"}}
controls.settings.rotateleft = {"scancode", {"z"}}
controls.settings.rotateright = {"scancode", {"x"}}

--player 2
controls.settings.leftp2 = {"scancode", {"j"}}
controls.settings.rightp2 = {"scancode", {"k"}}
controls.settings.downp2 = {"scancode", {"m"}}
controls.settings.rotateleftp2 = {"scancode", {"o"}}
controls.settings.rotaterightp2 = {"scancode", {"p"}}

controls.scancode = nil

controls.menukeys = {
	logo = {x = "return"},
	credits = {x = "return"},
	title = {x = "return"},
	menu = {x = "return", z = "escape"},
	multimenu = {x = "return", z = "escape"},
	options = {z = "escape"},
	failed = {x = "return", z = "escape"},
	gameBmulti_results = {x = "return", z = "escape"},
	rocket = {x = "return"},
}

controls.held = {}

function controls.menukey(scancode)
	local state = gamestate or "logo"
	if state:sub(1, 6) == "rocket" then
		state = "rocket"
	end
	local keys = controls.menukeys[state]
	if keys and keys[scancode] then
		controls.held[scancode] = true
		return keys[scancode]
	end
	return scancode
end

function controls.check(t, key)
	local pressed = key
	if controls.settings[t][1] == "scancode" then
		pressed = controls.scancode
	end
	for i = 1, #controls.settings[t][2] do
		if pressed == controls.settings[t][2][i] then
			return true
		end
	end
	return false
end

function controls.isDown(t)
	local isDown = love.keyboard.isDown
	if controls.settings[t][1] == "scancode" then
		isDown = love.keyboard.isScancodeDown
	end
	for i = 1, #controls.settings[t][2] do
		local k = controls.settings[t][2][i]
		if isDown(k) and not controls.held[k] then
			return true
		end
	end
	return false
end
