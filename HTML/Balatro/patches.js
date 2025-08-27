window.patches = {
    "bit.lua": `local M = {_TYPE='module', _NAME='bitop.funcs', _VERSION='1.0-0'}

local floor = math.floor

local MOD = 2^32
local MODM = MOD-1

local function memoize(f)

  local mt = {}
  local t = setmetatable({}, mt)

  function mt:__index(k)
    local v = f(k)
    t[k] = v
    return v
  end

  return t
end

local function make_bitop_uncached(t, m)
  local function bitop(a, b)
    local res,p = 0,1
    while a ~= 0 and b ~= 0 do
      local am, bm = a%m, b%m
      res = res + t[am][bm]*p
      a = (a - am) / m
      b = (b - bm) / m
      p = p*m
    end
    res = res + (a+b) * p
    return res
  end
  return bitop
end

local function make_bitop(t)
  local op1 = make_bitop_uncached(t, 2^1)
  local op2 = memoize(function(a)
    return memoize(function(b)
      return op1(a, b)
    end)
  end)
  return make_bitop_uncached(op2, 2^(t.n or 1))
end

-- ok? probably not if running on a 32-bit int Lua number type platform
function M.tobit(x)
  return x % 2^32
end

M.bxor = make_bitop {[0]={[0]=0,[1]=1},[1]={[0]=1,[1]=0}, n=4}
local bxor = M.bxor

function M.bnot(a)   return MODM - a end
local bnot = M.bnot

function M.band(a,b)
  return ((a+b) - bxor(a,b))
end
local band = M.band

function M.bor(a,b)
  return MODM - band(MODM - a, MODM - b)
end
local bor = M.bor

local lshift, rshift -- forward declare

function M.rshift(a,disp) -- Lua5.2 insipred
  if disp < 0 then return lshift(a,-disp) end
  return floor(a % 2^32 / 2^disp)
end
rshift = M.rshift

function M.lshift(a,disp) -- Lua5.2 inspired
  if disp < 0 then return rshift(a,-disp) end
  return (a * 2^disp) % 2^32
end
lshift = M.lshift

function M.tohex(x, n) -- BitOp style
  n = n or 8
  local up
  if n <= 0 then
    if n == 0 then return '' end
    up = true
    n = - n
  end
  x = band(x, 16^n-1)
  return ('%0'..n..(up and 'X' or 'x')):format(x)
end
local tohex = M.tohex

function M.extract(n, field, width) -- Lua5.2 inspired
  width = width or 1
  return band(rshift(n, field), 2^width-1)
end
local extract = M.extract

function M.replace(n, v, field, width) -- Lua5.2 inspired
  width = width or 1
  local mask1 = 2^width-1
  v = band(v, mask1) -- required by spec?
  local mask = bnot(lshift(mask1, field))
  return band(n, mask) + lshift(v, field)
end
local replace = M.replace

function M.bswap(x)  -- BitOp style
  local a = band(x, 0xff); x = rshift(x, 8)
  local b = band(x, 0xff); x = rshift(x, 8)
  local c = band(x, 0xff); x = rshift(x, 8)
  local d = band(x, 0xff)
  return lshift(lshift(lshift(a, 8) + b, 8) + c, 8) + d
end
local bswap = M.bswap

function M.rrotate(x, disp)  -- Lua5.2 inspired
  disp = disp % 32
  local low = band(x, 2^disp-1)
  return rshift(x, disp) + lshift(low, 32-disp)
end
local rrotate = M.rrotate

function M.lrotate(x, disp)  -- Lua5.2 inspired
  return rrotate(x, -disp)
end
local lrotate = M.lrotate

M.rol = M.lrotate  -- LuaOp inspired
M.ror = M.rrotate  -- LuaOp insipred


function M.arshift(x, disp) -- Lua5.2 inspired
  local z = rshift(x, disp)
  if x >= 0x80000000 then z = z + lshift(2^disp-1, 32-disp) end
  return z
end
local arshift = M.arshift

function M.btest(x, y) -- Lua5.2 inspired
  return band(x, y) ~= 0
end

--
-- Start Lua 5.2 "bit32" compat section.
--

M.bit32 = {} -- Lua 5.2 'bit32' compatibility


local function bit32_bnot(x)
  return (-1 - x) % MOD
end
M.bit32.bnot = bit32_bnot

local function bit32_bxor(a, b, c, ...)
  local z
  if b then
    a = a % MOD
    b = b % MOD
    z = bxor(a, b)
    if c then
      z = bit32_bxor(z, c, ...)
    end
    return z
  elseif a then
    return a % MOD
  else
    return 0
  end
end
M.bit32.bxor = bit32_bxor

local function bit32_band(a, b, c, ...)
  local z
  if b then
    a = a % MOD
    b = b % MOD
    z = ((a+b) - bxor(a,b)) / 2
    if c then
      z = bit32_band(z, c, ...)
    end
    return z
  elseif a then
    return a % MOD
  else
    return MODM
  end
end
M.bit32.band = bit32_band

local function bit32_bor(a, b, c, ...)
  local z
  if b then
    a = a % MOD
    b = b % MOD
    z = MODM - band(MODM - a, MODM - b)
    if c then
      z = bit32_bor(z, c, ...)
    end
    return z
  elseif a then
    return a % MOD
  else
    return 0
  end
end
M.bit32.bor = bit32_bor

function M.bit32.btest(...)
  return bit32_band(...) ~= 0
end

function M.bit32.lrotate(x, disp)
  return lrotate(x % MOD, disp)
end

function M.bit32.rrotate(x, disp)
  return rrotate(x % MOD, disp)
end

function M.bit32.lshift(x,disp)
  if disp > 31 or disp < -31 then return 0 end
  return lshift(x % MOD, disp)
end

function M.bit32.rshift(x,disp)
  if disp > 31 or disp < -31 then return 0 end
  return rshift(x % MOD, disp)
end

function M.bit32.arshift(x,disp)
  x = x % MOD
  if disp >= 0 then
    if disp > 31 then
      return (x >= 0x80000000) and MODM or 0
    else
      local z = rshift(x, disp)
      if x >= 0x80000000 then z = z + lshift(2^disp-1, 32-disp) end
      return z
    end
  else
    return lshift(x, -disp)
  end
end

function M.bit32.extract(x, field, ...)
  local width = ... or 1
  if field < 0 or field > 31 or width < 0 or field+width > 32 then error 'out of range' end
  x = x % MOD
  return extract(x, field, ...)
end

function M.bit32.replace(x, v, field, ...)
  local width = ... or 1
  if field < 0 or field > 31 or width < 0 or field+width > 32 then error 'out of range' end
  x = x % MOD
  v = v % MOD
  return replace(x, v, field, ...)
end


--
-- Start LuaBitOp "bit" compat section.
--

M.bit = {} -- LuaBitOp "bit" compatibility

function M.bit.tobit(x)
  x = x % MOD
  if x >= 0x80000000 then x = x - MOD end
  return x
end
local bit_tobit = M.bit.tobit

function M.bit.tohex(x, ...)
  return tohex(x % MOD, ...)
end

function M.bit.bnot(x)
  return bit_tobit(bnot(x % MOD))
end

local function bit_bor(a, b, c, ...)
  if c then
    return bit_bor(bit_bor(a, b), c, ...)
  elseif b then
    return bit_tobit(bor(a % MOD, b % MOD))
  else
    return bit_tobit(a)
  end
end
M.bit.bor = bit_bor

local function bit_band(a, b, c, ...)
  if c then
    return bit_band(bit_band(a, b), c, ...)
  elseif b then
    return bit_tobit(band(a % MOD, b % MOD))
  else
    return bit_tobit(a)
  end
end
M.bit.band = bit_band

local function bit_bxor(a, b, c, ...)
  if c then
    return bit_bxor(bit_bxor(a, b), c, ...)
  elseif b then
    return bit_tobit(bxor(a % MOD, b % MOD))
  else
    return bit_tobit(a)
  end
end
M.bit.bxor = bit_bxor

function M.bit.lshift(x, n)
  return bit_tobit(lshift(x % MOD, n % 32))
end

function M.bit.rshift(x, n)
  return bit_tobit(rshift(x % MOD, n % 32))
end

function M.bit.arshift(x, n)
  return bit_tobit(arshift(x % MOD, n % 32))
end

function M.bit.rol(x, n)
  return bit_tobit(lrotate(x % MOD, n % 32))
end

function M.bit.ror(x, n)
  return bit_tobit(rrotate(x % MOD, n % 32))
end

function M.bit.bswap(x)
  return bit_tobit(bswap(x % MOD))
end

return M`,
// -------------------------------------------------------------------------------
    "web_patches.lua": `-- Other patches not in this file:
-- Disable steam integration
-- F_SOUND_THREAD = false

love.system.getOS = function()
  return "Windows"
end

local _format = string.format
function string:format(key, ...)
    local args = {...}
    -- Replace nil with empty string
    local ok, ret = pcall(function() return _format(self, key, unpack(args)) end)
    if ok then
        return ret
    else
        return key
    end
end

function override_setMipmapFilter(texture)
    getmetatable(texture).__index.setMipmapFilter = function() end
    return texture
end

local _newImage = love.graphics.newImage
love.graphics.newImage = function(path, config)
    config.mipmaps = false -- Disable mipmaps for web compatibility
    return override_setMipmapFilter(_newImage(path, config))
end


local _quit = love.event.quit
love.event.quit = function()
    print("Quitting game...")
    _quit()
end

local _randomSeed = math.randomseed
math.randomseed = function(seed)
    if math.floor(seed) ~= seed then -- Non integer seeds do not work on web contexts
        _randomSeed(seed * 999999999) -- Should be big enough
        return
    end
    _randomSeed(seed)
end

local prevthread = nil

local FakeThread = {}

function FakeThread:new(thread)
    -- This is a fake thread class to replace love.thread.Thread
    local obj = {}
    obj._thread = thread or coroutine.create(function() end) -- Default to a no-op coroutine
    setmetatable(obj, self)
    self.__index = self
    return obj
end

function FakeThread:start(...)
    -- Resume the coroutine, passing any arguments
    return coroutine.resume(self._thread, ...)
end

local FakeChannel = {}

function FakeChannel:new(name)
    local obj = {}
    obj.queue = {}
    obj._thread = prevthread and prevthread._thread or nil -- Associate with the previous thread
    obj.name = name or "unnamed_channed_"..math.random(1,100) -- Name of the channel
    obj._state = "paused"
    setmetatable(obj, self)
    self.__index = self
    return obj
end

function FakeChannel:push(value)
    if self.name == "save_request" and value == "done" then
        return
    end
    print("Pushing value to channel: ", value.type .. " - " .. self.name)
    table.insert(self.queue, value)
    if self._thread and coroutine.status(self._thread) == "suspended" then
        coroutine.resume(self._thread) -- Resume the previous thread when a value is pushed
    end
end

function FakeChannel:pop()
    print("Popping value from channel" .. " - " .. self.name)
    return table.remove(self.queue, 1)
end

function FakeChannel:demand()
    while #self.queue == 0 do
        coroutine.yield() -- Yield until a value is pushed
        print("Channel" .. self.name .. " received data.")
    end
    return self:pop()
end

love.thread.newThread = function(path)
    -- Replace threads with coroutines

    local f = loadstring("local arg = nil\\n"..love.filesystem.read(path))

    local thread = coroutine.create(f)

    prevthread = FakeThread:new(thread)

    return prevthread
end

-- Also replace channels
local channels = {}
love.thread.getChannel = function(name)
    if not channels[name] then
        channels[name] = FakeChannel:new(name)
    end
    return channels[name]
end

-- Fix Log
local _log = math.log
math.log = function(x, base)
  if base then
    return _log(x) / _log(base)
  end
  return _log(x)
end

-- Patch load for smods
-- btw, mod support is pretty nonexistent
load = loadstring`,
// -------------------------------------------------------------------------------
  "nativefs.lua": `-- faknativefs.lua
local nativefs = {}

function join_path(a, b)
    if b:find("^/") then
        return b
    end
    if not a:find("/$") then
        a = a .. "/"
    end
    return a .. b
end

nativefs.workingDirectory = ""

-- Read a file from the game's source or save directory
function nativefs.read(filename)
    if love.filesystem.getInfo(join_path(nativefs.workingDirectory, filename)) then
        return love.filesystem.read(join_path(nativefs.workingDirectory, filename))
    else
        return nil, "File does not exist"
    end
end

-- Write to a file in the save directory
function nativefs.write(filename, contents)
    return love.filesystem.write(join_path(nativefs.workingDirectory, filename), contents)
end

-- Check if a path exists and get info
function nativefs.getInfo(path)
    return love.filesystem.getInfo(join_path(nativefs.workingDirectory, path))
end

function nativefs.getDirectoryItemsInfo(path)
    -- { type: "directory" | "file", name: "..." }
    local files = love.filesystem.getDirectoryItems(join_path(nativefs.workingDirectory, path))
    local out = {}
    for i, v in ipairs(files) do
        local info = love.filesystem.getInfo(join_path(join_path(nativefs.workingDirectory, path), v))
        out[i] = { name = v, type = info.type }
    end
    return out
end

-- Check if a file exists
function nativefs.exists(path)
    return love.filesystem.getInfo(join_path(nativefs.workingDirectory, path)) ~= nil
end

-- List directory contents
function nativefs.getDirectoryItems(path)
    return love.filesystem.getDirectoryItems(join_path(nativefs.workingDirectory, path))
end

-- Create a directory
function nativefs.mkdir(path)
    return love.filesystem.createDirectory(join_path(nativefs.workingDirectory, path))
end

-- Remove a file or directory
function nativefs.remove(path)
    return love.filesystem.remove(join_path(nativefs.workingDirectory, path))
end

-- Load Lua file as chunk
function nativefs.load(filename)
    local contents, err = love.filesystem.read(join_path(nativefs.workingDirectory, filename))
    if not contents then return nil, err end
    return load(contents, '@' .. filename)
end

function nativefs.newFileData(path)
    return love.filesystem.newFileData(join_path(nativefs.workingDirectory, path))
end

function nativefs.setWorkingDirectory(path)
    nativefs.workingDirectory = join_path(nativefs.workingDirectory, path)
    print("Navigated to "..nativefs.workingDirectory)
end

function nativefs.getWorkingDirectory()
    return nativefs.workingDirectory
end

-- Read as lines (like nativefs.lines)
function nativefs.lines(filename)
    local content = nativefs.read(filename)
    local i = 1
    return function()
        if not content then return nil end
        local next_newline = content:find("\\n", i)
        if not next_newline then
            local line = content:sub(i)
            content = nil
            return line
        else
            local line = content:sub(i, next_newline - 1)
            i = next_newline + 1
            return line
        end
    end
end

return nativefs`,
// -------------------------------------------------------------------------------
  "lovely.lua": `local lovely = {}

lovely.version = "1.0.0-WEB"
lovely.mod_dir = "Mods/"

return lovely`
}