-- wrk Lua script for generating unique POST /orders requests
local counter = 0
local thread_id = 0

function setup(thread)
   thread:set("id", thread_id)
   thread_id = thread_id + 1
end

function init(args)
   counter = 0
end

function request()
   counter = counter + 1
   local user_id = "u_" .. id .. "_" .. counter .. "_" .. os.time()
   local payload = '{"userId":"' .. user_id .. '","productId":"p_load_write_test"}'
   
   return wrk.format("POST", "/orders", {
      ["Content-Type"] = "application/json"
   }, payload)
end
