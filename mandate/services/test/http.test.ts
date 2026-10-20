import {it,expect,vi} from "vitest";
import {createServer} from "node:http";
import {SafeHttp,publicIp} from "../http.js";
it("rejects non-public IPv4/IPv6 including mapped, numeric and padded aliases",async()=>{
  for(const ip of ["127.0.0.1","10.0.0.1","169.254.169.254","100.64.0.1","172.31.0.1","192.168.1.1","198.19.0.1","203.0.113.3","::1","::ffff:127.0.0.1","fc00::1","fe80::1","2001:db8::1","2001:0000::1","2::1"])expect(publicIp(ip),ip).toBe(false);
  expect(publicIp("8.8.8.8")).toBe(true);expect(publicIp("2606:4700:4700::1111")).toBe(true);
  await expect(new SafeHttp().request("https://2130706433/path")).rejects.toThrow("PRIVATE_OR_RESERVED_ADDRESS");
});
it("rejects DNS rebinding to a private address and does not allow mixed DNS answers",async()=>{
  const resolver=vi.fn().mockResolvedValueOnce([{address:"8.8.8.8",family:4},{address:"127.0.0.1",family:4}]);
  await expect(new SafeHttp({resolver}).request("https://merchant.example")).rejects.toThrow("PRIVATE_OR_RESERVED_ADDRESS");
  resolver.mockResolvedValue([{address:"169.254.169.254",family:4}]);
  await expect(new SafeHttp({resolver}).request("https://merchant.example")).rejects.toThrow("PRIVATE_OR_RESERVED_ADDRESS");
});
it("loopback is explicitly scoped; pins the resolved address, refuses redirects and limits bytes/time",async()=>{
  const server=createServer((req,res)=>{
    if(req.url==="/redirect"){res.writeHead(302,{location:"http://169.254.169.254"});return res.end();}
    if(req.url==="/large")return res.end("x".repeat(200));
    if(req.url==="/slow")return;
    res.end(JSON.stringify({host:req.headers.host}));
  });
  await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const address=server.address();if(!address||typeof address==="string")throw new Error("BIND");
  const origin=`http://merchant.test:${address.port}`;
  const resolver=vi.fn(async()=>[{address:"127.0.0.1",family:4}]);
  const http=new SafeHttp({testLoopbackOrigins:[origin],allowOrigins:[origin],resolver,maxBytes:100,timeoutMs:100});
  try {
    expect((await http.json(origin+"/ok")).data).toEqual({host:`merchant.test:${address.port}`});
    expect(resolver).toHaveBeenCalledTimes(1); // Connection uses the pinned callback, no second DNS resolution.
    await expect(http.request(origin+"/redirect")).rejects.toThrow("REDIRECT_REJECTED");
    await expect(http.request(origin+"/large")).rejects.toThrow("RESPONSE_TOO_LARGE");
    await expect(http.request(origin+"/slow")).rejects.toThrow("HTTP_TRANSPORT_UNKNOWN");
    await expect(new SafeHttp().request(origin)).rejects.toThrow("HTTPS_REQUIRED");
    await expect(http.request(origin,{headers:{host:"another.example"}})).rejects.toThrow("UNSAFE_REQUEST_HEADERS");
    resolver.mockResolvedValue([{address:"169.254.169.254",family:4}]);
    await expect(http.request(origin)).rejects.toThrow("PRIVATE_OR_RESERVED_ADDRESS");
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
