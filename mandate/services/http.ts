import {request as httpRequest} from "node:http";
import {request as httpsRequest} from "node:https";
import {lookup} from "node:dns/promises";
import {isIP} from "node:net";
import type {IncomingHttpHeaders} from "node:http";
import {MandateError} from "../sdk/model.js";
type Address={address:string;family:number};
export type HttpPolicy={allowOrigins?:string[];testLoopbackOrigins?:string[];timeoutMs?:number;maxBytes?:number;resolver?:(hostname:string)=>Promise<Address[]>};
export type HttpResponse={status:number;headers:IncomingHttpHeaders;body:Buffer;url:string;resolvedAddresses:string[];receivedAt:string};
export function publicIp(ip:string):boolean {
  const family=isIP(ip);if(!family)return false;
  if(family===4) {
    const [a,b,c]=ip.split(".").map(Number);
    return !(a===0 || a===10 || a===127 || a===169&&b===254 || a===172&&b>=16&&b<=31 || a===192&&b===168 || a===100&&b>=64&&b<=127 || a>=224 || a===192&&b===0&&c===0 || a===192&&b===0&&c===2 || a===192&&b===88&&c===99 || a===198&&(b===18||b===19||b===51&&c===100) || a===203&&b===0&&c===113);
  }
  const lower=new URL(`http://[${ip}]`).hostname.replace(/^\[|\]$/g,"").toLowerCase();
  // Restrict IPv6 to global-unicast 2000::/3, excluding documentation and special transition ranges.
  const [first,second]=lower.split(":");
  return parseInt(first,16)>=0x2000 && parseInt(first,16)<=0x3fff && !(first==="2001" && ["","0","2","10","20","db8"].includes(second)) && first!=="2002";
}
function loopback(ip:string){return ip==="127.0.0.1" || ip==="::1";}
export class SafeHttp {
  constructor(readonly policy:HttpPolicy={}) {}
  async request(raw:string,options:{method?:"GET"|"POST";headers?:Record<string,string>;body?:Buffer}={}):Promise<HttpResponse> {
    const url=new URL(raw);
    if(Object.entries(options.headers??{}).some(([k,v])=>["host","connection","content-length","transfer-encoding","proxy-authorization",":authority"].includes(k.toLowerCase()) || /[\r\n]/.test(v)))throw new MandateError("UNSAFE_REQUEST_HEADERS");
    if(url.username || url.password || url.hash || !["https:","http:"].includes(url.protocol))throw new MandateError("RESOURCE_URL_REJECTED");
    const test=this.policy.testLoopbackOrigins?.includes(url.origin)??false;
    if(url.protocol!=="https:" && !test)throw new MandateError("HTTPS_REQUIRED");
    if(this.policy.allowOrigins && !this.policy.allowOrigins.includes(url.origin))throw new MandateError("ORIGIN_NOT_APPROVED");
    const host=url.hostname.replace(/^\[|\]$/g,"");
    const addresses=isIP(host)?[{address:host,family:isIP(host)}]:await (this.policy.resolver??(h=>lookup(h,{all:true,verbatim:true})))(host);
    if(!addresses.length || addresses.some(a=>test?!loopback(a.address):!publicIp(a.address)))throw new MandateError("PRIVATE_OR_RESERVED_ADDRESS");
    const pinned=addresses.map(a=>({...a}));
    const max=this.policy.maxBytes??1024*1024;
    if(options.body && options.body.length>max)throw new MandateError("REQUEST_TOO_LARGE");
    return new Promise((resolve,reject)=>{
      const transport=url.protocol==="https:"?httpsRequest:httpRequest;
      const req=transport(url,{method:options.method??"GET",headers:options.headers,agent:false,signal:AbortSignal.timeout(this.policy.timeoutMs??10000),maxHeaderSize:32768,
        lookup:((hostname:string,opts:{all?:boolean;family?:number},callback:(...args:unknown[])=>void)=>{
          if(hostname!==host)return callback(new MandateError("DNS_HOST_CHANGED"));
          const candidates=opts.family?pinned.filter(a=>a.family===opts.family):pinned;
          if(!candidates.length)return callback(new MandateError("ADDRESS_FAMILY_UNAVAILABLE"));
          return opts.all?callback(null,candidates):callback(null,candidates[0].address,candidates[0].family);
        }) as never,
      },res=>{
        if(res.statusCode && res.statusCode>=300 && res.statusCode<400){res.destroy();return reject(new MandateError("REDIRECT_REJECTED"));}
        const length=res.headers["content-length"];
        if(length && (!/^[0-9]+$/.test(length) || BigInt(length)>BigInt(max))){res.destroy();return reject(new MandateError("RESPONSE_TOO_LARGE"));}
        const chunks:Buffer[]=[];let bytes=0;
        res.on("data",chunk=>{bytes+=chunk.length;if(bytes>max){res.destroy(new MandateError("RESPONSE_TOO_LARGE"));}else chunks.push(Buffer.from(chunk));});
        res.once("error",reject);
        res.once("end",()=>resolve({status:res.statusCode??0,headers:res.headers,body:Buffer.concat(chunks),url:url.href,resolvedAddresses:pinned.map(a=>a.address),receivedAt:new Date().toISOString()}));
      });
      req.once("error",error=>reject(error instanceof MandateError?error:new MandateError("HTTP_TRANSPORT_UNKNOWN")));
      req.end(options.body);
    });
  }
  async json(url:string,options:Parameters<SafeHttp["request"]>[1]={}) {
    const response=await this.request(url,options);
    try{return {...response,data:JSON.parse(response.body.toString("utf8")) as unknown};}catch{throw new MandateError("INVALID_JSON_RESPONSE");}
  }
}
