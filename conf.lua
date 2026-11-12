function love.conf(t)
	t.version = "11.5"
	t.identity = "not_tetris_2"
	t.window.title = "Not Tetris 2"
	t.window.width = 800
	t.window.height = 720
	t.window.msaa = 0
	t.window.vsync = 1

	if love._os == "Web" then
		t.window.resizable = true
		t.window.highdpi = true
	end
end
