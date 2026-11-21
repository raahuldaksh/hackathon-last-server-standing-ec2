-- wrk Lua script simulating 100% accurate competition mixed workload:
-- 60% GET /products/:id
-- 15% GET /products?category=...
-- 20% POST /orders
-- 5%  GET /users/:userId/orders

local counter = 0
local thread_id = 0

function setup(thread)
   thread:set("id", thread_id)
   thread_id = thread_id + 1
end

function init(args)
   counter = 0
   math.randomseed(os.time() + id * 1000)
end

function request()
   counter = counter + 1
   local r = math.random(100)

   if r <= 60 then
      -- 60% Product detail read
      return wrk.format("GET", "/products/p_bench_50k")
   elseif r <= 75 then
      -- 15% Category list read
      return wrk.format("GET", "/products?category=electronics&limit=20")
   elseif r <= 95 then
      -- 20% Flash purchase write
      local user_id = "u_mix_" .. id .. "_" .. counter .. "_" .. os.time()
      local payload = '{"userId":"' .. user_id .. '","productId":"p_load_write_test"}'
      return wrk.format("POST", "/orders", {
         ["Content-Type"] = "application/json"
      }, payload)
   else
      -- 5% User order history read
      local user_id = "u_mix_" .. id .. "_" .. math.random(1, math.max(1, counter)) .. "_" .. os.time()
      return wrk.format("GET", "/users/" .. user_id .. "/orders")
   end
end
