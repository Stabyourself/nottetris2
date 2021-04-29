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

local function newTetriFixture(body, kind, udata, mask)
	local s = shapeList[kind]
	local fixtures = {}
	
	for i = 1, #s / 2 do
		local fixture = newRectangleFixture(body, s[2 * i - 1], s[2 * i], 32, 32)
		fixture:setUserData(udata)
		fixture:setUserData(udata)
		fixtures[i] = fixture
	end
	return fixtures
end


function gameBmulti_load()
	if musicno < 4 then
		love.audio.stop(music[musicno])
	end
	
	gamestate = "gameBmulti"
	gamestarted = false
	
	beeped = {false, false, false}
	
	--figure out the multiplayer scale
	mpscale = scale
	while 274*mpscale > desktopwidth do
		mpscale = mpscale - 1
	end
	physicsmpscale = mpscale/4
	print(mpscale, physicsmpscale)
	
	mpfullscreenoffsetX = (desktopwidth-274*mpscale)/2
	mpfullscreenoffsetY = (desktopheight-144*mpscale)/2
	
	if not fullscreen then
		graphics_setMode( 274*mpscale, 144*mpscale, fullscreen, vsync, 16 )
	end
	
	--nextpieces
	nextpieceimgmp = {}
	for i = 1, 7 do
		nextpieceimgmp[i] = newPaddedImage( "graphics/pieces/"..i..".png", mpscale )
	end
	
	difficulty_speed = 100

	p1fail = false
	p2fail = false
	
	p1color = {255 / 255, 50 / 255, 50 / 255}
	p2color = {50 / 255, 255 / 255, 50 / 255}
	
	--p1color = {116 / 255, 92 / 255, 73 / 255}
	--p2color = {209 / 255, 174 / 255, 145 / 255}
	
	scorescorep1 = 0
	linesscorep1 = 0
	
	scorescorep2 = 0
	linesscorep2 = 0
	
	counterp1 = 0 --first piece is 1
	counterp2 = 0 --first piece is 1
	
	randomtable = {}
	nextpiecep1 = nil
	nextpiecep2 = nil
	
	nextpiecerot = 0
	
	--PHYSICS--
	meter = 30
	world = love.physics.newWorld(0, 500, true )
	
	
	tetribodiesp1 = {}
	tetribodiesp2 = {}
	
	--WALLS P1--
	wallbodiesp1 = love.physics.newBody(world, 32, -64, "static")
	wallshapesp1 = {}
	
	wallshapesp1[0] = newPolygonFixture( wallbodiesp1,164, 0, 164,672, 196,672, 196, 0)
	wallshapesp1[0]:setUserData("leftp1")
	wallshapesp1[0]:setFriction(0.0001)
	
	wallshapesp1[1] = newPolygonFixture( wallbodiesp1,516,0, 516,672, 548,672, 548,0)
	wallshapesp1[1]:setUserData("rightp1")
	wallshapesp1[1]:setCategory( 2 )
	wallshapesp1[1]:setFriction(0.0001)
	
	wallshapesp1[2] = newPolygonFixture( wallbodiesp1,196,640, 196,672, 516,672, 516,640)
	wallshapesp1[2]:setUserData("groundp1")
	
	--WALLS P2--
	wallbodiesp2 = love.physics.newBody(world, 32, -64, "static")
	wallshapesp2 = {}
	
	wallshapesp2[0] = newPolygonFixture( wallbodiesp2,484, 0, 484,672, 516,672, 516, 0)
	wallshapesp2[0]:setUserData("leftp2")
	wallshapesp2[0]:setCategory( 3 )
	wallshapesp2[0]:setFriction(0.0001)
	
	wallshapesp2[1] = newPolygonFixture( wallbodiesp2,836,0, 836,672, 868,672, 868,0)
	wallshapesp2[1]:setUserData("rightp2")
	wallshapesp2[1]:setFriction(0.0001)
	
	wallshapesp2[2] = newPolygonFixture( wallbodiesp2,516,640, 516,672, 836,672, 836,640)
	wallshapesp2[2]:setUserData("groundp2")
	-----------	
	world:setCallbacks(collideBmulti)
	-----------
	
	randomtable[1] = math.random(7)
	starttimer = love.timer.getTime()
	--first piece! hooray.
end

function gameBmulti_draw()
	if fullscreen then
		love.graphics.translate(mpfullscreenoffsetX, mpfullscreenoffsetY)
		
		love.graphics.setScissor(mpfullscreenoffsetX, mpfullscreenoffsetY, 274*mpscale, 144*mpscale)
	end

	--background--
	if gamestate ~= "gameBmulti_results" then
		love.graphics.draw(gamebackgroundmulti, 0, 0, 0, mpscale)
	else
		love.graphics.draw(multiresults, 0, 0, 0, mpscale)
	end
	---------------
	if gamestarted == false then
		if newtime - starttimer > 2 then
			love.graphics.draw( number1, 73*mpscale, 48*mpscale, 0, mpscale)
			love.graphics.draw( number1, 153*mpscale, 48*mpscale, 0, mpscale)
		elseif newtime - starttimer > 1 then
			love.graphics.draw( number2, 73*mpscale, 48*mpscale, 0, mpscale)
			love.graphics.draw( number2, 153*mpscale, 48*mpscale, 0, mpscale)
		elseif newtime - starttimer > 0 then
			love.graphics.draw( number3, 73*mpscale, 48*mpscale, 0, mpscale)
			love.graphics.draw( number3, 153*mpscale, 48*mpscale, 0, mpscale)
		end
	end
	--tetrishapes P1--
	
	for i,v in pairs(tetribodiesp1) do
		local body = v.body

		love.graphics.setColor(1, 1, 1)
		--set color:
		if gamestate == "failingBmulti" or gamestate == "failedBmulti" then
			timepassed = love.timer.getTime() - colorizetimer
			if body:getY() > 576 - (576*(timepassed/colorizeduration)) then
				love.graphics.setColor(p1color)
			end
		end
		
		love.graphics.draw( v.image, body:getX()*physicsmpscale, body:getY()*physicsmpscale, 
			body:getAngle(), 1, 1, piececenter[v.kind][1]*mpscale, piececenter[v.kind][2]*mpscale)
	end
	
	if p1fail == false and nextpiecep1 then
		--Next piece
		love.graphics.draw(nextpieceimgmp[nextpiecep1], 24*mpscale, 120*mpscale, -nextpiecerot, 1, 1, piececenterpreview[nextpiecep1][1]*mpscale, piececenterpreview[nextpiecep1][2]*mpscale)
	end
	
	----------------
	--tetrishapes P2--	
	for i,v in pairs(tetribodiesp2) do
		local body = v.body
		
		love.graphics.setColor(1, 1, 1)
		--set color:
		if gamestate == "failingBmulti" or gamestate == "failedBmulti" then
			timepassed = love.timer.getTime() - colorizetimer
			if body:getY() > 576 - (576*(timepassed/colorizeduration)) then
				love.graphics.setColor(p2color)
			end
		end
		
		love.graphics.draw( v.image, body:getX()*physicsmpscale, body:getY()*physicsmpscale, 
			body:getAngle(), 1, 1, piececenter[v.kind][1]*mpscale, piececenter[v.kind][2]*mpscale)
		
		love.graphics.setColor(1, 0, 0)
		local x, y = body:getWorldCenter( )
		love.graphics.circle("line", x, y, 5)
		for k, f in pairs(v.fixtures) do
			local shape = f:getShape()
			love.graphics.polygon("line", body:getWorldPoints(shape:getPoints()))
		end
	end
	----------------	
	love.graphics.setColor(1, 1, 1)
	
	if p2fail == false and nextpiecep2 then
		--Next piece
		love.graphics.draw(nextpieceimgmp[nextpiecep2], 250*mpscale, 120*mpscale, nextpiecerot, 1, 1, piececenterpreview[nextpiecep2][1]*mpscale, piececenterpreview[nextpiecep2][2]*mpscale)
	end
	--SCORES P1---------------------------------------
	
	--"score"--
	offsetX = 0
	
	scorestring = tostring(scorescorep1)
	for i = 1, scorestring:len() - 1 do
		offsetX = offsetX - 8*mpscale
	end
	love.graphics.print( scorescorep1, 36*mpscale + offsetX, 24*mpscale, 0, mpscale)
	
	--"tiles"--
	offsetX = 0
	
	scorestring = tostring(linesscorep1)
	for i = 1, scorestring:len() - 1 do
		offsetX = offsetX - 8*mpscale
	end
	love.graphics.print( linesscorep1, 28*mpscale + offsetX, 80*mpscale, 0, mpscale)
	-----------------------------------------------
	
	--SCORES P2---------------------------------------
	--"score"--
	offsetX = 0
	
	scorestring = tostring(scorescorep2)
	for i = 1, scorestring:len() - 1 do
		offsetX = offsetX - 8*mpscale
	end
	love.graphics.print( scorescorep2, 262*mpscale + offsetX, 24*mpscale, 0, mpscale)
	
	--"tiles"--
	offsetX = 0
	
	scorestring = tostring(linesscorep2)
	for i = 1, scorestring:len() - 1 do
		offsetX = offsetX - 8*mpscale
	end
	love.graphics.print( linesscorep2, 254*mpscale + offsetX, 80*mpscale, 0, mpscale)
	-----------------------------------------------
	
	if gamestate == "gameBmulti_results" then
		--win counter
		if p1wins < 10 then
			love.graphics.print( "0"..p1wins, 111*mpscale, 128*mpscale, 0, mpscale)
		else
			love.graphics.print( p1wins, 111*mpscale, 128*mpscale, 0, mpscale)
		end
		
		if p2wins < 10 then
			love.graphics.print( "0"..p2wins, 193*mpscale, 128*mpscale, 0, mpscale)
		else
			love.graphics.print( p2wins, 193*mpscale, 128*mpscale, 0, mpscale)
		end
		
		if winner == 1 then
			--mario
			if jumpframe == false then
				love.graphics.draw( marioidle, mariobody:getX()*physicsmpscale, mariobody:getY()*physicsmpscale, mariobody:getAngle(), mpscale, mpscale, 12, 13.5)
			else
				love.graphics.draw( mariojump, mariobody:getX()*physicsmpscale, mariobody:getY()*physicsmpscale, mariobody:getAngle(), mpscale, mpscale, 12, 13.5)
			end
			
			--luigi
			if cryframe == false then
				love.graphics.draw( luigicry1, 162*mpscale, 66*mpscale,  0, mpscale, mpscale)
			else
				love.graphics.draw( luigicry2, 162*mpscale, 66*mpscale,  0, mpscale, mpscale)
				love.graphics.print( "mario", 93*mpscale, 20*mpscale, 0, mpscale)
				love.graphics.print( "wins!", 141*mpscale, 20*mpscale, 0, mpscale)
				for i = 1, 5 do
					love.graphics.draw( congratsline, (86+(8*i-1))*mpscale, 28*mpscale, 0, mpscale, mpscale)
					love.graphics.draw( congratsline, (134+(8*i-1))*mpscale, 28*mpscale, 0, mpscale, mpscale)
				end
			end
		elseif winner == 2 then
			--luigi
			if jumpframe == false then
				love.graphics.draw( luigiidle, luigibody:getX()*physicsmpscale, luigibody:getY()*physicsmpscale, luigibody:getAngle(), mpscale, mpscale, 14, 15.5)
			else
				love.graphics.draw( luigijump, luigibody:getX()*physicsmpscale, luigibody:getY()*physicsmpscale, luigibody:getAngle(), mpscale, mpscale, 14, 15.5)
			end
			
			--mario
			if cryframe == false then
				love.graphics.draw( mariocry1, 83*mpscale, 66*mpscale, 0, mpscale, mpscale)
			else
				love.graphics.draw( mariocry2, 83*mpscale, 66*mpscale, 0, mpscale, mpscale)
				love.graphics.print( "luigi", 93*mpscale, 20*mpscale, 0, mpscale)
				love.graphics.print( "wins!", 141*mpscale, 20*mpscale, 0, mpscale)
				for i = 1, 5 do
					love.graphics.draw( congratsline, (86+(8*i-1))*mpscale, 28*mpscale, 0, mpscale, mpscale)
					love.graphics.draw( congratsline, (134+(8*i-1))*mpscale, 28*mpscale, 0, mpscale, mpscale)
				end
			end
		else --draw
			--mario
			love.graphics.draw( marioidle, 84*mpscale, 69*mpscale, 0, mpscale, mpscale)
			if cryframe == false then
				love.graphics.print( "draw", 160*mpscale, 40*mpscale, 0, mpscale)
			end
			
			--luigi
			love.graphics.draw( luigiidle, 162*mpscale, 65*mpscale,  0, mpscale, mpscale)
			if cryframe == false then
				love.graphics.print( "draw", 80*mpscale, 40*mpscale, 0, mpscale)
			end
			
		end
	end
	
	if fullscreen then
		love.graphics.translate(-mpfullscreenoffsetX, -mpfullscreenoffsetY)
		
		love.graphics.setScissor()
	end
end
	
function gameBmulti_update(dt)
	if newblockp1 then game_addTetriBmultip1(); newblockp1 = false end
	if newblockp2 then game_addTetriBmultip2(); newblockp2 = false end
	
	--NEXTPIECE ROTATION (rotating allday erryday)
	nextpiecerot = nextpiecerot + nextpiecerotspeed*dt
	while nextpiecerot > math.pi*2 do
		nextpiecerot = nextpiecerot - math.pi*2
	end

	world:update(dt)
	newtime = love.timer.getTime()
	if gamestarted == false then
		if newtime - starttimer > 3 then
			if musicno < 4 then
				love.audio.play(music[musicno])
			end
			startgame()
			gamestarted = true
		elseif newtime - starttimer > 2 and beeped[3] == false then
			beeped[3] = true
			love.audio.stop(highscorebeep)
			love.audio.play(highscorebeep)
		elseif newtime - starttimer > 1 and beeped[2] == false then
			beeped[2] = true
			love.audio.stop(highscorebeep)
			love.audio.play(highscorebeep)
		elseif newtime - starttimer > 0 and beeped[1] == false then
			beeped[1] = true
			love.audio.stop(highscorebeep)
			love.audio.play(highscorebeep)
		end
		
	elseif gamestate == "gameBmulti" then
		--PLAYER 1--
		if p1fail == false then
			local tbodyp1 = tetribodiesp1[counterp1].body
			
			if love.keyboard.isDown( "h" ) then --clockwise
				if tbodyp1:getAngularVelocity() < 3 then
					tbodyp1:applyTorque( 70 )
				end
			end
			if love.keyboard.isDown( "g" ) then --counterclockwise
				if tbodyp1:getAngularVelocity() > -3 then
					tbodyp1:applyTorque( -70 )
				end
			end
		   
			if love.keyboard.isDown( "a" ) then --left
				tbodyp1:applyForce(-70, 0)
			end
			if love.keyboard.isDown( "d" ) then --right
				tbodyp1:applyForce(70, 0)
			end
			
			local x, y = tbodyp1:getLinearVelocity()
			if love.keyboard.isDown( "s" ) then --down
				if y > difficulty_speed*5 then
					tbodyp1:setLinearVelocity(x, difficulty_speed*5)
				else
					tbodyp1:applyForce( 0, 20)
				end
			else
				if y > difficulty_speed then
					tbodyp1:setLinearVelocity(x, y-2000*dt)
				end
			end
		end
		--PLAYER 2--
		if p2fail == false then
			local tbodyp2 = tetribodiesp2[counterp2].body
			
			if love.keyboard.isDown( "kp2" ) then --clockwise
				if tetribodiesp2[counterp2]:getAngularVelocity() < 3 then
					tetribodiesp2[counterp2]:applyTorque( 70 )
				end
			end
			if love.keyboard.isDown( "kp1" ) then --counterclockwise
				if ttbodyp2:getAngularVelocity() > -3 then
					tbodyp2:applyTorque( -70 )
				end
			end
		   
			if love.keyboard.isDown( "left" ) then --left
				tbodyp2:applyForce(-70, 0)
			end
			if love.keyboard.isDown( "right" ) then --right
				tbodyp2:applyForce(70, 0)
			end
			
			local x, y = tbodyp2:getLinearVelocity()
			if love.keyboard.isDown( "down" ) then --down
				if y > difficulty_speed*5 then
					tbodyp2:setLinearVelocity(x, difficulty_speed*5)
				else
					tbodyp2:applyForce( 0, 20)
				end
			else
				if y > difficulty_speed then
					tbodyp2:setLinearVelocity(x, y-2000*dt)
				end
			end
		end
	elseif gamestate == "failingBmulti" then
		timepassed = love.timer.getTime() - colorizetimer
		if timepassed > colorizeduration then
			gamestate = "failedBmulti"
			
			wallshapesp1[2]:destroy()
			wallshapesp2[2]:destroy()
			
			love.audio.stop(gameover2)
			love.audio.play(gameover2)
		end
	elseif gamestate == "failedBmulti" then
		clearcheck = true
		for i,v in pairs(tetribodiesp1) do
			if v.body:getY() < 162*mpscale then
				clearcheck = false
			end
		end
		
		for i,v in pairs(tetribodiesp2) do
			if v.body:getY() < 162*mpscale then
				clearcheck = false
			end
		end
		
		if clearcheck then --RESULTS SCREEN INI!--
			gamestate = "gameBmulti_results"
			jumptimer = love.timer.getTime()
			crytimer = love.timer.getTime()
			
			love.audio.play(musicresults)
			
			resultsfloorbody = love.physics.newBody(world, 32, -64, "static")
			resultsfloorshape = newPolygonFixture( resultsfloorbody,196,448, 196,480, 836,480, 836,448)
			resultsfloorshape:setUserData("resultsfloor")
			
			if winner == 1 then
				mariobody = love.physics.newBody(world, 388, 320, "dynamic")
				marioshape = newRectangleFixture( mariobody, 0, 0, 64, 108)
				marioshape:setMask(3)
				marioshape:setUserData("mario")
				mariobody:setLinearDamping(0.5)
				--mariobody:setMassFromShapes()
			elseif winner == 2 then
				luigibody = love.physics.newBody(world, 704, 320, "dynamic")
				luigishape = newRectangleFixture( luigibody, 0, 0, 64, 124)
				luigishape:setMask(2)
				luigishape:setUserData("luigi")
				luigibody:setLinearDamping(0.5)
				--luigibody:setMassFromShapes()
			end
			
			if winner == 1 then
				mariobody:setY(mariobody:getY()-1)
				x, y = mariobody:getLinearVelocity( )
				mariobody:setLinearVelocity(x, -300)
			elseif winner == 2 then
				luigibody:setY(luigibody:getY()-1)
				x, y = luigibody:getLinearVelocity( )
				luigibody:setLinearVelocity(x, -300)
			end
			jumpframe = true
		end
	elseif gamestate == "gameBmulti_results" then
		jumptimepassed = love.timer.getTime() - jumptimer
		if jumptimepassed > 2 then
			jumptimer = love.timer.getTime()
			jumpframe = true
			if winner == 1 then
				mariobody:setY(mariobody:getY()-1)
				x, y = mariobody:getLinearVelocity( )
				mariobody:setLinearVelocity(x, -300)
			elseif winner == 2 then
				luigibody:setY(luigibody:getY()-1)
				x, y = luigibody:getLinearVelocity( )
				luigibody:setLinearVelocity(x, -300)
			end
		end
		
		crytimepassed = love.timer.getTime() - crytimer
		if crytimepassed > 0.4 then
			cryframe = not cryframe
			crytimer = love.timer.getTime()
		end
		
		if winner == 1 then
			if love.keyboard.isDown ("a") then
				x, y = mariobody:getWorldCenter()
				mariobody:applyForce( -30, 0, x, y-8 )
			end
			if love.keyboard.isDown ("d") then
				x, y = mariobody:getWorldCenter()
				mariobody:applyForce( 30, 0, x, y-8 )
			end
		elseif winner == 2 then
			if love.keyboard.isDown ("left") then
				x, y = luigibody:getWorldCenter()
				luigibody:applyForce( -30, 0, x, y-8 )
			end
			if love.keyboard.isDown ("right") then
				x, y = luigibody:getWorldCenter()
				luigibody:applyForce( 30, 0, x, y-8 )
			end
		end
	end
end

function startgame()
	--FIRST "nextpiece" for p1 (Which gets immediately removed, duh)--
	if randomtable[1] == 2 then
		nextpiecep1 = 3
	elseif randomtable[1] == 3 then
		nextpiecep1 = 2
	elseif randomtable[1] == 5 then
		nextpiecep1 = 7
	elseif randomtable[1] == 7 then
		nextpiecep1 = 5
	else
		nextpiecep1 = randomtable[1]
	end
	
	----------------
	--FIRST "nextpiece" for p2 (Which gets immediately removed, duh)--
	nextpiecep2 = randomtable[1]
	
	----------------
	game_addTetriBmultip1()
	game_addTetriBmultip2()
end

function game_addTetriBmultip1()
	counterp1 = counterp1 + 1
	--NEW BLOCK--
	randomblockp1 = nextpiecep1
	createtetriBmultip1(randomblockp1, counterp1, 388, blockstartY)
	tetribodiesp1[counterp1].body:setLinearVelocity(0, difficulty_speed)
	
	--RANDOMIZE
	if counterp1 > #randomtable then
		table.insert(randomtable, math.random(7))
	end
	--MIRROR PIECES
	if randomtable[counterp1] == 2 then
		nextpiecep1 = 3
	elseif randomtable[counterp1] == 3 then
		nextpiecep1 = 2
	elseif randomtable[counterp1] == 5 then
		nextpiecep1 = 7
	elseif randomtable[counterp1] == 7 then
		nextpiecep1 = 5
	else
		nextpiecep1 = randomtable[counterp1]
	end
	
end

function game_addTetriBmultip2()
	counterp2 = counterp2 + 1
	--NEW BLOCK--
	randomblockp2 = nextpiecep2
	createtetriBmultip2(randomblockp2, counterp2, 708, blockstartY)
	tetribodiesp2[counterp2].body:setLinearVelocity(0, difficulty_speed)
	
	--RANDOMIZE
	if counterp2 > #randomtable then
		table.insert(randomtable, math.random(7))
	end
	nextpiecep2 = randomtable[counterp2]
end

function createtetriBmultip1(i, uniqueid, x, y)
	local image = newPaddedImage( "graphics/pieces/"..i..".png", scale )
	local kind = i
	
	local body = newBody(world, x, y, blockrot)
	local fixtures = newTetriFixture(body, i, "p1-" .. uniqueid, 3)
	
	body:setLinearDamping(0.5)
	body:setBullet(true)
	
	tetribodiesp1[uniqueid] = {body = body, kind = kind, fixtures = fixtures, image = image}
end

function createtetriBmultip2(i, uniqueid, x, y)
	local image = newPaddedImage( "graphics/pieces/"..i..".png", scale )
	local kind = i
	
	local body = newBody(world, x, y, blockrot)
	local fixtures = newTetriFixture(body, i, "p2-" .. uniqueid, 2)
	
	body:setLinearDamping(0.5)
	body:setBullet(true)
	
	tetribodiesp2[uniqueid] = {body = body, kind = kind, fixtures = fixtures, image = image}
end

function collideBmulti(a, b)
	a, b = a:getUserData(), b:getUserData()
	if (a == "p1-"..counterp1 and b ~= "p2-"..counterp2) or (b == "p1-"..counterp1 and b ~= "p2-"..counterp2) then --One of the pieces is the current piece and the other isn't the other player's one
		if p1fail == false and a ~= "leftp1" and a ~= "rightp1" and b ~= "leftp1" and b ~= "rightp1" then 
			endblockp1()
		end
	elseif (a == "p2-"..counterp2 and b ~= "p1-"..counterp1) or (b == "p2-"..counterp2 and a ~= "p1-"..counterp1) then
		if p2fail == false and a ~= "leftp2" and a ~= "rightp2" and b ~= "leftp2" and b ~= "rightp2" then 
			endblockp2()
		end
	elseif gamestate == "gameBmulti_results" then
		if (a == "mario" and b == "resultsfloor") or (b == "mario" and a == "resultsfloor") then
			jumpframe = false
		elseif (a == "luigi" and b == "resultsfloor") or (b == "luigi" and a == "resultsfloor") then
			jumpframe = false
		end
	end
end

function endblockp1()
	local tbp1 = tetribodiesp1[counterp1]
	if gameno == 2 then
		for i, v in pairs(tbp1.fixtures) do --make shapes pass through the center
			v:setMask(3, 2)
		end
	end
	
	if tbp1.body:getY() < losingY then --P1 hit the top
		--FAIL P1--
		p1fail = true
		
		
		if p2fail == true then --Both players have hit the top
			endgame()
		end
	else --P1 didn't hit the top yet
		love.audio.stop(blockfall)
		love.audio.play(blockfall)
		linesscorep1 = linesscorep1 + 1
		scorescorep1 = linesscorep1 * 100
		newblockp1 = true --game_addTetriBmultip1()
	end
end

function endblockp2()
	local tbp2 = tetribodiesp2[counterp2]
	if gameno == 2 then
		for i, v in pairs(tbp2.fixtures) do --make shapes pass through the center
			v:setMask(2, 3)
		end
	end
	
	if tbp2.body:getY() < losingY then --P2 hit the top
		--FAIL P2--
		p2fail = true
		
		if p1fail == true then --Both players have hit the top
			endgame()
		end
	else --P2 didn't hit the top yet
		love.audio.stop(blockfall)
		love.audio.play(blockfall)
		linesscorep2 = linesscorep2 + 1
		scorescorep2 = linesscorep2 * 100
		newblockp2 = true --game_addTetriBmultip2()
	end
end

function endgame()
	colorizetimer = love.timer.getTime()
	gamestate = "failingBmulti"
	
	if musicno < 4 then
		love.audio.stop(music[musicno])
	end
	
	love.audio.stop(gameover1)
	love.audio.play(gameover1)
	
	if scorescorep1 > scorescorep2 then
		p1wins = p1wins + 1
		winner = 1
	elseif scorescorep1 < scorescorep2 then
		p2wins = p2wins + 1
		winner = 2
	else
		winner = 3
	end
	if p1wins > 99 then
		p1wins = math.mod(p1wins, 100)
	end
	if p2wins > 99 then
		p2wins = math.mod(p2wins, 100)
	end
end