function gameB_load()
	gamestate = "gameB"
	
	pause = false
	
	difficulty_speed = 100

	scorescore = 0
	levelscore = 0
	linesscore = 40
	nextpiecerot = 0
	
	--PHYSICS--
	love.physics.setMeter(meter)
	world = love.physics.newWorld(0, 500, true )

	tetrikind = {}

	wallshapes = {}
	wallfixtures = {}

	tetrifixtures = {}
	tetribodies = {}

	newblock = false

	wallbodies = love.physics.newBody(world, 32, -64, "static") --WALLS
	wallshapes[0] = love.physics.newPolygonShape( 0, -64, 0,672, 32,672, 32,-64)
	wallshapes[1] = love.physics.newPolygonShape( 352,-64, 352,672, 384,672, 384,-64)
	wallshapes[2] = love.physics.newPolygonShape( 24,640, 24,672, 352,672, 352,640)
	wallshapes[3] = love.physics.newPolygonShape( -8,-96, 384,-96, 384,-64, -8,-64)

	wallfixtures[0] = newtetrifixture(wallbodies, wallshapes[0])
	wallfixtures[0]:setUserData("left")
	wallfixtures[0]:setFriction(0.00001)

	wallfixtures[1] = newtetrifixture(wallbodies, wallshapes[1])
	wallfixtures[1]:setUserData("right")
	wallfixtures[1]:setFriction(0.00001)

	wallfixtures[2] = newtetrifixture(wallbodies, wallshapes[2])
	wallfixtures[2]:setUserData("ground")

	wallfixtures[3] = newtetrifixture(wallbodies, wallshapes[3])
	wallfixtures[3]:setUserData("ceiling")

	world:setCallbacks(collideB)
	-----------

	--FIRST "nextpiece"-
	nextpiece = math.random(7)

	game_addTetriB()
	----------------
end

function game_addTetriB()
	--NEW BLOCK--
	randomblock = nextpiece
	createtetriB(randomblock, 1, 224, blockstartY)
	tetribodies[1]:setLinearVelocity(0, difficulty_speed)
	
	--RANDOMIZE
	nextpiece = math.random(7)
end

function createtetriB(i, uniqueid, x, y)

	tetriimages[uniqueid] = nextpieceimg[i]
	tetrikind[uniqueid] = i

	tetribodies[uniqueid] = love.physics.newBody(world, x, y, "dynamic")
	tetribodies[uniqueid]:setLinearDamping(0.5)
	tetribodies[uniqueid]:setBullet(true)

	local shapes = newtetrishapes(i)
	tetrifixtures[uniqueid] = {}
	for j, shape in ipairs(shapes) do
		tetrifixtures[uniqueid][j] = newtetrifixture(tetribodies[uniqueid], shape)
		tetrifixtures[uniqueid][j]:setUserData(uniqueid)
	end
	settetrimass(tetribodies[uniqueid], shapes)
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
			love.graphics.draw( tetriimages[i], v:getX()*physicsscale, v:getY()*physicsscale, v:getAngle(), 1, 1, piececenter[tetrikind[i]][1]*scale, piececenter[tetrikind[i]][2]*scale)
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
		if love.keyboard.isDown( "x" ) then
			if tetribodies[1]:getAngularVelocity() < 3 then
				tetribodies[1]:applyTorque( blocktorque )
			end
		end
		if love.keyboard.isDown( "y" ) or love.keyboard.isDown( "z" ) or love.keyboard.isDown( "w" ) then
			if tetribodies[1]:getAngularVelocity() > -3 then
				tetribodies[1]:applyTorque( -blocktorque )
			end
		end
	
		if love.keyboard.isDown( "left" ) then
			local x, y = tetribodies[1]:getWorldCenter()
			tetribodies[1]:applyForce( -blockforce, 0, x, y )
		end
		if love.keyboard.isDown( "right" ) then
			local x, y = tetribodies[1]:getWorldCenter()
			tetribodies[1]:applyForce( blockforce, 0, x, y )
		end
		
		local x, y = tetribodies[1]:getLinearVelocity( )
		if love.keyboard.isDown( "down" ) then
			--commented part limits the blackfallspeed
			if y > difficulty_speed*5 then
				tetribodies[1]:setLinearVelocity(x, difficulty_speed*5)
			else
				local cx, cy = tetribodies[1]:getWorldCenter()
				tetribodies[1]:applyForce( 0, blockdownforce, cx, cy )
			end
		else
			if y > difficulty_speed then
				tetribodies[1]:setLinearVelocity(x, y-2000*dt)
			end
		end
	end
	
	world:update(dt, velocityiterations, positioniterations)

	if gamestate == "failingB" then
		clearcheck = true
		for i,v in pairs(tetribodies) do
			if v:getY() < 648 then
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
	if tetribodies[1]:getY() < losingY then
		--LOSE--
		gamestate = "failingB"
		if musicno < 4 then
			love.audio.stop(music[musicno])
		end
		love.audio.stop(gameover1)
		love.audio.play(gameover1)
	
		wallfixtures[2]:destroy()
		wallfixtures[2] = nil
else
		--Transfer block from 1 to end of tetribodies
		tetrikind[highestbody()+1] = tetrikind[1]
		
		tetriimages[highestbody()+1] = tetriimages[1]
		tetribodies[highestbody()+1] = tetribodies[1]
		
		tetrifixtures[highestbody()] = {}

		for i, v in pairs(tetrifixtures[1]) do
			tetrifixtures[highestbody()][i] = tetrifixtures[1][i]
			tetrifixtures[highestbody()][i]:setUserData({highestbody()})
			tetrifixtures[1][i] = nil
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