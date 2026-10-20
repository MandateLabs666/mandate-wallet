import {createServer} from "node:http";
export async function rpcProxy(upstream:string){
  const controls={stallBeforeSend:false,dropAfterAccepted:false,hideAcceptedLookup:false,hideReceiptsAfterAccepted:false},counts={sendRequests:0,accepted:0,receiptRequests:0},acceptedHashes=new Set<string>();
  const server=createServer(async(req,res)=>{
    try{
      const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>131072)throw Error("RPC_TEST_BODY_LIMIT");chunks.push(chunk);}
      const body=Buffer.concat(chunks),call=JSON.parse(body.toString());
      if(call.method==="eth_sendRawTransaction"){
        counts.sendRequests++;
        if(controls.stallBeforeSend){await new Promise(r=>setTimeout(r,300));res.end();return;}
      }
      if(call.method==="eth_getTransactionReceipt")counts.receiptRequests++;
      if(controls.hideReceiptsAfterAccepted&&counts.accepted>0&&call.method==="eth_getTransactionReceipt"){req.socket.destroy();return;}
      if(controls.hideAcceptedLookup&&counts.accepted>0&&["eth_getTransactionReceipt","eth_getTransactionByHash"].includes(call.method)){req.socket.destroy();return;}
      const response=await fetch(upstream,{method:"POST",headers:{"content-type":"application/json"},body,signal:AbortSignal.timeout(5000)}),text=await response.text();
      if(call.method==="eth_sendRawTransaction"){
        const result=JSON.parse(text);if(result.result&&!acceptedHashes.has(result.result)){acceptedHashes.add(result.result);counts.accepted++;}
        if(controls.dropAfterAccepted){req.socket.destroy();return;}
      }
      res.writeHead(response.status,{"content-type":"application/json"});res.end(text);
    }catch{if(!res.headersSent)res.writeHead(503);res.end();}
  });
  await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const address=server.address();if(!address||typeof address==="string")throw Error("RPC_TEST_BIND_FAILED");
  return {rpc:`http://127.0.0.1:${address.port}`,controls,counts,close:async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}};
}
