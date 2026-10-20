import {encodeAbiParameters,keccak256,toHex,type Hex,type Address} from "viem";
type Artifact={deployedBytecode:{object:Hex;immutableReferences?:Record<string,{start:number;length:number}[]>}};
type Identifiers=Record<string,{name:string;contract:string}>;
export function domainSeparator(name:string,version:string,chainId:number,address:Address) {
  return keccak256(encodeAbiParameters([{type:"bytes32"},{type:"bytes32"},{type:"bytes32"},{type:"uint256"},{type:"address"}],
    [keccak256(toHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")),keccak256(toHex(name)),keccak256(toHex(version)),BigInt(chainId),address]));
}
function shortString(value:string):Hex {
  const encoded=Buffer.from(value,"utf8");if(encoded.length>31)throw new Error("LONG_STRING_IMMUTABLE_UNSUPPORTED");
  return ("0x"+encoded.toString("hex")+"00".repeat(31-encoded.length)+encoded.length.toString(16).padStart(2,"0")) as Hex;
}
// Fill every compiler-declared immutable from constructor parameters; never erase or ignore bytes.
export function materializeRuntime(artifact:Artifact,identifiers:Identifiers,context:{chainId:number;address:Address;owner?:Address;asset?:Address;tokenDomain:Hex}) {
  const values:Record<string,Hex>={
    _cachedDomainSeparator:domainSeparator("MandateWallet","2",context.chainId,context.address),
    _cachedChainId:toHex(BigInt(context.chainId),{size:32}),_cachedThis:toHex(BigInt(context.address),{size:32}),
    _hashedName:keccak256(toHex("MandateWallet")),_hashedVersion:keccak256(toHex("2")),_name:shortString("MandateWallet"),_version:shortString("2"),
    deploymentChainId:toHex(BigInt(context.chainId),{size:32}),tokenDomain:context.tokenDomain,DOMAIN_SEPARATOR:context.tokenDomain,
  };
  if(context.owner)values.owner=toHex(BigInt(context.owner),{size:32});
  if(context.asset)values.asset=toHex(BigInt(context.asset),{size:32});
  let code=artifact.deployedBytecode.object;
  for(const [id,locations] of Object.entries(artifact.deployedBytecode.immutableReferences??{})) {
    const name=identifiers[id]?.name,value=values[name];
    if(!name || !value)throw new Error("UNKNOWN_IMMUTABLE:"+id);
    for(const {start,length} of locations) {
      if(length!==32 || start<0 || (start+length)*2>code.length-2)throw new Error("INVALID_IMMUTABLE_LOCATION");
      code=(code.slice(0,2+start*2)+value.slice(2)+code.slice(2+(start+length)*2)) as Hex;
    }
  }
  return code;
}
