local newRectangleFixture = function(body, ...)
	local shape = love.physics.newRectangleShape(...)
	return love.physics.newFixture(body, shape, density)
end

local newPolygonFixture = function(body, ...)
	local shape = love.physics.newPolygonShape(...)
	return love.physics.newFixture(body, shape, density)
end

local newBody = function(world, x, y, inertia)
	local body = love.physics.newBody(world, x, y, "dynamic")
	if inertia then body:setInertia(inertia) end
	return body
end

local shapeList = {
	{-48,0, -16,0, 16,0, 48,0}, --I
	{-32,-16, 0,-16, 32,-16, 32,16}, --J
	{-32,-16, 0,-16, 32,-16, -32,16}, --L
	{-16,-16, -16,16, 16,16, 16,-16}, --O
	{-32, 16, 0,-16, 0,16, 32,-16}, --S
	{-32,-16, 0,-16, 32,-16, 0,16}, --T
	{-32,-16, 0,-16, 0,16, 32, 16}, --Z
}

local function newTetriFixture(body, kind, udata)
	local s = shapeList[kind]
	local fixtures = {}
	
	for i = 1, #s / 2 do
		local fixture = newRectangleFixture(body, s[2 * i - 1], s[2 * i], 32, 32)
		fixture:setUserData(udata)
		fixtures[i] = fixture
	end
	return fixtures
end

function gameB_load()
	gamestate = "gameB"
	
	pause = false
	
	difficulty_speed = 100

	scorescore = 0
	levelscore = 0
	linesscore = 40
	nextpiecerot = 0
	
	--PHYSICS--
	meter = 1
	world = love.physics.newWorld(0, 500, true)
	
	walls = {}
	
	tetribodies = {}
	
	walls = {}
	walls.body = love.physics.newBody(world, 32, -64, "static") --WALLS
	walls.fixture_l = newPolygonFixture(walls.body, 0, -64, 0,672, 32,672, 32,-64)
	walls.fixture_r = newPolygonFixture(walls.body, 352,-64, 352,672, 384,672, 384,-64)
	walls.fixture_g = newPolygonFixture(walls.body, 24,640, 24,672, 352,672, 352,640)
	walls.fixture_c = newPolygonFixture(walls.body, -8,-96, 384,-96, 384,-64, -8,-64)
	
	walls.fixture_l:setUserData("left")
	walls.fixture_l:setFriction(0.00001)
	walls.fixture_r:setUserData("right")
	walls.fixture_r:setFriction(0.00001)
	
	walls.fixture_g:setUserData("ground")
	walls.fixture_c:setUserData("ceiling")
	
	world:setCallbacks(collideB)
	-----------
	
	--FIRST "nextpiece"-
	nextpiece = 1--math.random(7)
	
	game_addTetriB()
	----------------
end

function game_addTetriB()
	--NEW BLOCK--
	randomblock = nextpiece
	createtetriB(randomblock, 1, 224, blockstartY)
	tetribodies[1].body:setLinearVelocity(0, difficulty_speed)
	
	--RANDOMIZE
	nextpiece = math.random(7)
end

function createtetriB(i, uniqueid, x, y)
	local image = newPaddedImage( "graphics/pieces/"..i..".png", scale )
	local kind = i
	
	local body = newBody(world, x, y, blockrot)
	local fixtures = newTetriFixture(body, i, uniqueid)
	
	body:setLinearDamping(0.5)
	body:setBullet(true)
	
	tetribodies[uniqueid] = {body = body, kind = kind, fixtures = fixtures, image = image}
end

function gameB_draw()
	--FULLSCREEN OFFSET
	if fullscreen then
		love.graphics.translate(fullscreenoffsetX, fullscreenoffsetY)
		
		--scissor
		love.graphics.setScissor(fullscreenoffsetX, fullscreenoffsetY, 160*scale, 144*scale)
	end
	
	--background--
	love.graphics.draw(gamebackground, 0, 0, 0, scale)
	---------------
	--tetrifixtures--
	for i,v in pairs(tetribodies) do
		if pause == false then
			love.graphics.draw( v.image, v.body:getX()*physicsscale, v.body:getY()*physicsscale, v.body:getAngle(), 1, 1, piececenter[v.kind][1]*scale, piececenter[v.kind][2]*scale)
		end
	end
	
	--Next piece
	if pause == false then
		love.graphics.draw(nextpieceimg[nextpiece], 136*scale, 120*scale, nextpiecerot, 1, 1, piececenterpreview[nextpiece][1]*scale, piececenterpreview[nextpiece][2]*scale)
	end
	----------------
	--start--
	if pause == true then
		love.graphics.draw(pausegraphic, 16*scale, 0, 0, scale)
	end
	---------
	
	--SCORES---------------------------------------
	--"score"--
	offsetX = 0
	
	scorestring = tostring(scorescore)
	for i = 1, scorestring:len() - 1 do
		offsetX = offsetX - 8*scale
	end
	love.graphics.print( scorescore, 144*scale + offsetX, 24*scale, 0, scale)
	
	
	--"level"--
	offsetX = 0
	
	scorestring = tostring(levelscore)
	for i = 1, scorestring:len() - 1 do
		offsetX = offsetX - 8*scale
	end
	love.graphics.print( levelscore, 136*scale + offsetX, 56*scale, 0, scale)
	
	--"tiles"--
	offsetX = 0
	
	scorestring = tostring(linesscore)
	for i = 1, scorestring:len() - 1 do
		offsetX = offsetX - 8*scale
	end
	love.graphics.print( linesscore, 136*scale + offsetX, 80*scale, 0, scale)
	-----------------------------------------------
	
	love.graphics.setColor(1, 0, 0)

	--DEBUG--
		love.graphics.scale(physicsscale)
		for i, v in pairs(tetribodies) do
			local body = v.body
			local x, y = body:getWorldCenter( )
			love.graphics.circle("line", x, y, 5)
			for k, f in pairs(v.fixtures) do
				local shape = f:getShape()
				love.graphics.polygon("line", body:getWorldPoints(shape:getPoints()))
			end
		end
		love.graphics.scale(1/physicsscale)
		
	love.graphics.setColor(1, 1, 1)
	
	--FULLSCREEN OFFSET
	if fullscreen then
		love.graphics.translate(-fullscreenoffsetX, -fullscreenoffsetY)
		
		--scissor
		love.graphics.setScissor()
	end
	
end
	
function gameB_update(dt)
	if newblock then
		game_addTetriB()
		newblock = false
	end

	--NEXTPIECE ROTATION (rotating allday erryday)
	nextpiecerot = nextpiecerot + nextpiecerotspeed*dt
	while nextpiecerot > math.pi*2 do
		nextpiecerot = nextpiecerot - math.pi*2
	end

	if gamestate == "gameB" then
		local body = tetribodies[1].body
		if love.keyboard.isDown( "x" ) then
			if body:getAngularVelocity() < 3 then
				body:applyTorque( 70 * meter)
			end
		end
		if love.keyboard.isDown( "y" ) or love.keyboard.isDown( "z" ) or love.keyboard.isDown( "w" ) then
			if body:getAngularVelocity() > -3 then
				body:applyTorque( -70 * meter)
			end
		end
	
		if love.keyboard.isDown( "left" ) then
			body:applyForce( -70 * meter, 0)
		end
		if love.keyboard.isDown( "right" ) then
			body:applyForce( 70 * meter, 0)
		end
		
		local x, y = body:getLinearVelocity( )
		if love.keyboard.isDown( "down" ) then
			--commented part limits the blackfallspeed
			if y > difficulty_speed*5 then
				body:setLinearVelocity(x, difficulty_speed*5)
			else
				body:applyForce( 0, 20 * meter)
			end
		else
			if y > difficulty_speed then
				body:setLinearVelocity(x, y-2000*dt)
			end
		end
	end
	
	world:update(dt)
	
	if gamestate == "failingB" then
		clearcheck = true
		for i,v in pairs(tetribodies) do
			if v.body:getY() < 648 then
				clearcheck = false
			end
		end
		
		if clearcheck then
			failed_load()
		end
	end
end

function collideB(a, b)
	a, b = a:getUserData(), b:getUserData()
	if a == 1 or b == 1 then
		if a ~= "left" and a ~= "right" and b ~= "left" and b ~= "right" then 
			if gamestate == "gameB" then
				endblockB()
			end
		end
	end
end

function endblockB()
	if tetribodies[1].body:getY() < losingY then
		--LOSE--
		gamestate = "failingB"
		if musicno < 4 then
			love.audio.stop(music[musicno])
		end
		love.audio.stop(gameover1)
		love.audio.play(gameover1)
	
		wallshapes[2]:destroy()
		wallshapes[2] = nil
	else
		--Transfer block from 1 to end of tetribodies
		local hb = highestbody()
		local fixtures = tetribodies[1].fixtures
		tetribodies[hb + 1] = tetribodies[1]
		
		for i, v in pairs(fixtures) do
			fixtures[i]:setUserData(hb + 1)
		end
		
		tetribodies[1] = nil
		---------------------------
		linesscore = linesscore + 1
		scorescore = linesscore * 100
		
		love.audio.stop(blockfall)
		love.audio.play(blockfall)
		
		newblock = true
	end
end