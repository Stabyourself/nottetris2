function love.conf(t)
	t.title = "Not Tetris 2"
	t.author = "Maurice"
	t.identity = "not_tetris_2"

	if t.screen then
		t.screen.width = 800
		t.screen.height = 720
		t.screen.fsaa = 0
		t.screen.vsync = true
	end

	if t.window then
		t.window.width = 800
		t.window.height = 720
		t.window.fsaa = 16
		t.window.vsync = true
	end
end
