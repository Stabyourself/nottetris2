-- conf.lua (Ported to LÖVE 11.5)
function love.conf(t)
	t.identity = "not_tetris_2"
	t.version = "11.5"
	t.console = true
	t.window.title = "Not Tetris 2"
	t.window.width = 800
	t.window.height = 720
	t.window.msaa = 0
	t.window.vsync = true
end
