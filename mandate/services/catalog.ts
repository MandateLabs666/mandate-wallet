import {DatabaseSync} from "node:sqlite";
import {mkdirSync,chmodSync} from "node:fs";
import {dirname} from "node:path";
import {z} from "zod";
import {keccak256,toHex,type Address} from "viem";
import {SafeHttp} from "./http.js";
import {atomicAmount,canonicalJson,MandateError} from "../sdk/model.js";
export const RequirementsSchema=z.object({scheme:z.string().max(64),network:z.string().max(64),asset:z.string().max(128),amount:z.string().max(80),payTo:z.string().max(128),maxTimeoutSeconds:z.number().int().positive().max(86400),extra:z.record(z.unknown()).default({})}).passthrough();
export const CatalogItemSchema=z.object({resource:z.string().url().max(4096),description:z.string().max(8192).optional(),type:z.string().max(32),x402Version:z.number().int(),accepts:z.array(RequirementsSchema).max(32).default([]),extensions:z.record(z.unknown()).optional(),lastUpdated:z.string().max(128).optional()}).passthrough();
export type CatalogItem=z.infer<typeof CatalogItemSchema>;
export const SearchSchema=z.object({query:z.string().trim().min(1).max(300),network:z.string().regex(/^eip155:[1-9][0-9]*$/).optional(),asset:z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),payTo:z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),maxAmountAtomic:z.string().regex(/^(0|[1-9][0-9]*)$/).optional(),limit:z.number().int().min(1).max(20).default(10)}).strict();
export type Snapshot={schemaVersion:2;sourceUrl:string;receivedAt:string;stale:boolean;items:CatalogItem[];rejectedItems:number;pagination?:{limit:number;offset:number;total:number};partialResults:boolean;searchMethod?:string;errorCode?:string;metadataTrust:"untrusted-directory"};
export class CatalogCache {
  private db:DatabaseSync;
  constructor(path:string) {
    mkdirSync(dirname(path),{recursive:true,mode:0o700});this.db=new DatabaseSync(path);chmodSync(path,0o600);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS snapshots(key TEXT PRIMARY KEY,json TEXT NOT NULL)");
  }
  get(key:string):Snapshot|undefined{const row=this.db.prepare("SELECT json FROM snapshots WHERE key=?").get(key) as {json:string}|undefined;return row?JSON.parse(row.json):undefined;}
  set(key:string,value:Snapshot){this.db.prepare("INSERT INTO snapshots VALUES(?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json").run(key,JSON.stringify(value));}
  close(){this.db.close();}
}
function parseSnapshot(data:unknown,url:string,receivedAt:string):Snapshot {
  const page=z.object({items:z.array(z.unknown()).max(100).optional(),resources:z.array(z.unknown()).max(100).optional(),pagination:z.object({limit:z.number().int().min(1).max(100),offset:z.number().int().nonnegative(),total:z.number().int().nonnegative()}).optional(),partialResults:z.boolean().optional(),searchMethod:z.string().max(64).optional()}).passthrough().parse(data);
  if(!page.items && !page.resources)throw new MandateError("CATALOG_SCHEMA_UNSUPPORTED");
  const items:CatalogItem[]=[];let rejectedItems=0;
  for(const raw of page.items??page.resources??[]) {const parsed=CatalogItemSchema.safeParse(raw);if(parsed.success)items.push(parsed.data);else rejectedItems++;}
  return {schemaVersion:2,sourceUrl:url,receivedAt,stale:false,items,rejectedItems,pagination:page.pagination,partialResults:page.partialResults??false,searchMethod:page.searchMethod,metadataTrust:"untrusted-directory"};
}
export class BazaarClient {
  constructor(readonly http:SafeHttp,readonly cache:CatalogCache,readonly base="https://api.cdp.coinbase.com/platform/v2/x402/discovery/") {}
  private async load(url:string,offline=false):Promise<Snapshot> {
    const key=keccak256(toHex(url)),cached=this.cache.get(key);
    if(offline){if(!cached)throw new MandateError("CATALOG_CACHE_MISSING");return {...cached,stale:true,errorCode:"CATALOG_OFFLINE"};}
    try {const r=await this.http.json(url);if(r.status!==200)throw new MandateError("CATALOG_HTTP_"+r.status);const result=parseSnapshot(r.data,url,r.receivedAt);this.cache.set(key,result);return result;}
    catch(error){if(cached)return {...cached,stale:true,errorCode:error instanceof MandateError?error.code:"CATALOG_UNAVAILABLE"};throw error;}
  }
  async search(input:z.input<typeof SearchSchema>,offline=false) {
    const q=SearchSchema.parse(input),url=new URL("search",this.base);
    for(const key of ["query","network","asset","payTo"] as const)if(q[key])url.searchParams.set(key,q[key]!);
    url.searchParams.set("limit",String(q.limit));
    if(q.maxAmountAtomic!==undefined){const v=atomicAmount(q.maxAmountAtomic);url.searchParams.set("maxUsdPrice",`${v/1000000n}.${(v%1000000n).toString().padStart(6,"0")}`);}
    return this.load(url.href,offline);
  }
  async page(offset=0,limit=100,offline=false) {
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new MandateError("CATALOG_PAGINATION_INVALID");
    const url=new URL("resources",this.base);url.searchParams.set("type","http");url.searchParams.set("limit",String(limit));url.searchParams.set("offset",String(offset));return this.load(url.href,offline);
  }
  async browse(maxPages=3,offline=false) {
    if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>10)throw new MandateError("CATALOG_PAGE_LIMIT");
    const pages:Snapshot[]=[];let offset=0;
    for(let i=0;i<maxPages;i++) {
      const page=await this.page(offset,100,offline);pages.push(page);
      if(page.stale || !page.pagination || page.items.length+page.rejectedItems===0 || page.pagination.offset+page.pagination.limit>=page.pagination.total)break;
      const next=page.pagination.offset+page.pagination.limit;if(next<=offset)throw new MandateError("CATALOG_PAGINATION_STALLED");offset=next;
    }
    const unique=new Map(pages.flatMap(p=>p.items).map(i=>[serviceId(i),i]));
    return {schemaVersion:2,pages,items:[...unique.values()],truncated:pages.length===maxPages && !!pages.at(-1)?.pagination && pages.at(-1)!.pagination!.offset+pages.at(-1)!.pagination!.limit<pages.at(-1)!.pagination!.total};
  }
}
export function serviceId(item:Pick<CatalogItem,"resource"|"type">){return keccak256(toHex(canonicalJson({type:item.type,url:new URL(item.resource).href})));}
export type CompatibilityPolicy={chainId:number;asset:Address;maxPerPayment:bigint;approvedPayTo:Address[];approvedUrls:string[];verifiedFacilitator:boolean;readOnly?:boolean};
export function filterService(item:CatalogItem,policy:CompatibilityPolicy) {
  const reasons:string[]=[];
  if(item.type!=="http" || item.x402Version!==2)reasons.push("PROTOCOL_UNSUPPORTED");
  const routes=item.accepts.filter(r=>r.scheme==="exact" && r.network===`eip155:${policy.chainId}` && r.asset.toLowerCase()===policy.asset.toLowerCase() && (r.extra.assetTransferMethod===undefined || r.extra.assetTransferMethod==="eip3009"));
  if(!routes.length)reasons.push("PAYMENT_ROUTE_UNSUPPORTED");
  const affordable=routes.filter(r=>{try{return atomicAmount(r.amount)>0n && atomicAmount(r.amount)<=policy.maxPerPayment;}catch{return false;}});
  if(routes.length && !affordable.length)reasons.push("PRICE_OUTSIDE_LIMIT");
  if(!policy.approvedUrls.includes(new URL(item.resource).href))reasons.push("OWNER_RESOURCE_APPROVAL_REQUIRED");
  if(!affordable.some(r=>policy.approvedPayTo.some(p=>p.toLowerCase()===r.payTo.toLowerCase())))reasons.push("OWNER_MERCHANT_APPROVAL_REQUIRED");
  if(!policy.verifiedFacilitator)reasons.push("FACILITATOR_NOT_VERIFIED");
  if(policy.readOnly)reasons.push("NETWORK_READ_ONLY");
  return {serviceId:serviceId(item),discoverable:true,eligibleForLiveQuote:reasons.length===0,automaticPaymentAllowed:false,reasons,requiredNextCheck:"LIVE_ENDPOINT_QUOTE_AND_CHAIN_AUTHORITY"};
}
