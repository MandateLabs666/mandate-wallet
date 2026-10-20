import {readFileSync,existsSync,lstatSync,unlinkSync,mkdirSync,realpathSync} from "node:fs";
import {join,dirname,resolve,basename} from "node:path";
import {randomBytes} from "node:crypto";
import {parse as parseTOML} from "smol-toml";
import {zipSync,strToU8} from "fflate";
import {atomicPrivate,digest,privateDirectory} from "./files.js";
export type AgentHost="claude-desktop"|"claude-code"|"codex";
type Edit={id:string;host:AgentHost;path:string;before:string;after:string;beforeHash:string;exists:boolean;added:string;appliedHash?:string;backup?:string};
const serverName="mandate_wallet_setup";
export class HostIntegration {
  private edits=new Map<string,Edit>();
  constructor(readonly options:{home:string;project:string;node:string;entry:string;connection:string;packageDirectory:string}){
    // macOS /var and /tmp are system aliases. Canonicalize trusted roots, then
    // reject symlinks introduced below them instead of rejecting these aliases.
    const canonical=(path:string)=>{let p=resolve(path);const tail:string[]=[];while(!existsSync(p)){tail.unshift(basename(p));p=dirname(p);}return join(realpathSync(p),...tail);};
    options.home=canonical(options.home);options.project=canonical(options.project);
  }
  private target(host:AgentHost,scope:"project"|"user"){
    if(host==="claude-desktop")throw Error("DESKTOP_IMPORT_CONFIRMATION_REQUIRED");
    return host==="codex"?join(scope==="user"?this.options.home:this.options.project,".codex/config.toml"):
      scope==="user"?join(this.options.home,".claude.json"):join(this.options.project,".mcp.json");
  }
  private safeTarget(path:string){
    for(let p=path;;p=dirname(p)){if(existsSync(p)&&lstatSync(p).isSymbolicLink())throw Error("HOST_CONFIG_SYMLINK_REJECTED");if(p===dirname(p))break;}
  }
  prepare(host:AgentHost,scope:"project"|"user"){
    const path=this.target(host,scope);this.safeTarget(path);
    const existed=existsSync(path),before=existed?readFileSync(path,"utf8"):"",args=[this.options.entry,"--connection",this.options.connection];
    let after:string,added:string;
    if(host==="codex"){
      const old=before?parseTOML(before):{},servers=(old as any).mcp_servers??{};
      if(Object.keys(servers).some(k=>k===serverName||JSON.stringify(servers[k]).includes("mandate-mcp")||JSON.stringify(servers[k]).includes("mandate-desktop")))throw Error("HOST_MANDATE_CONFIG_EXISTS");
      added=`[mcp_servers.${serverName}]\ncommand = ${JSON.stringify(this.options.node)}\nargs = ${JSON.stringify(args)}\nstartup_timeout_sec = 60\ntool_timeout_sec = 120\n`;
      after=before+(before.endsWith("\n")?"\n":"\n\n")+added;parseTOML(after);
    }else{
      const old=before?JSON.parse(before):{};
      if(!old||typeof old!=="object"||Array.isArray(old)||old.mcpServers&&(typeof old.mcpServers!=="object"||Array.isArray(old.mcpServers)))throw Error("HOST_CONFIG_FORMAT_REJECTED");
      const servers=old.mcpServers??{};
      if(Object.keys(servers).some(k=>k===serverName||JSON.stringify(servers[k]).includes("mandate-mcp")||JSON.stringify(servers[k]).includes("mandate-desktop")))throw Error("HOST_MANDATE_CONFIG_EXISTS");
      const entry={type:"stdio",command:this.options.node,args};added=JSON.stringify({mcpServers:{[serverName]:entry}},null,2);
      after=JSON.stringify({...old,mcpServers:{...servers,[serverName]:entry}},null,2)+"\n";
    }
    const edit:Edit={id:randomBytes(16).toString("hex"),host,path,before,after,beforeHash:digest(before),exists:existed,added};this.edits.set(edit.id,edit);
    // Return only the new stanza. Existing config may contain unrelated secrets.
    return {id:edit.id,host,scope,target:path,added,needsUserConfirmation:true,existingConfigurationPreserved:true};
  }
  apply(id:string){
    const e=this.edits.get(id);if(!e)throw Error("HOST_PREVIEW_REQUIRED");this.safeTarget(e.path);
    if(e.appliedHash)throw Error("HOST_PREVIEW_ALREADY_APPLIED");
    const current=existsSync(e.path)?readFileSync(e.path,"utf8"):"";
    if(digest(current)!==e.beforeHash||existsSync(e.path)!==e.exists)throw Error("HOST_CONFIG_CHANGED_REVIEW_AGAIN");
    mkdirSync(dirname(e.path),{recursive:true});
    if(e.exists){e.backup=e.path+".mandate-backup-"+e.id;atomicPrivate(e.backup,e.before);}
    atomicPrivate(e.path,e.after);e.appliedHash=digest(e.after);
    return {status:"configured",host:e.host,target:e.path,backup:e.backup??null,restartRequired:true,modelToolCallVerified:false};
  }
  undo(id:string){
    const e=this.edits.get(id);if(!e?.appliedHash)throw Error("HOST_APPLIED_CHANGE_REQUIRED");this.safeTarget(e.path);
    if(!existsSync(e.path)||digest(readFileSync(e.path,"utf8"))!==e.appliedHash)throw Error("HOST_CONFIG_CHANGED_CANNOT_UNDO");
    if(e.exists)atomicPrivate(e.path,e.before);else unlinkSync(e.path);
    this.edits.delete(id);return {status:"restored",target:e.path};
  }
  desktopPackage(){
    const directory=this.options.packageDirectory,files:Record<string,Uint8Array>={};
    for(const name of ["LICENSE","README.zh-CN.md","THIRD_PARTY_NOTICES.json","build.json","manifest.json","server/mandate-desktop.cjs"])files[name]=readFileSync(join(directory,name));
    const m=JSON.parse(Buffer.from(files['manifest.json']).toString('utf8'));
    // Claude keys an extension by its manifest identity. A bound package must
    // never collide with the generic/manual package, or with another task.
    const binding=digest(resolve(this.options.connection)).slice(0,12);
    m.name="mandate-wallet-guided-"+binding;
    m.display_name="Mandate Wallet · Guided "+binding.slice(0,6);
    m.description="Preconfigured Mandate connection. No Agent profile or Connection file selection is required.";
    m.long_description="This extension is bound to the wallet and fixed task prepared by the local Mandate setup wizard. Its configuration is supplied through a local connection descriptor. No file fields are required. Disable the older manual Mandate Wallet extension before using this guided connection. Installation does not expand the approved session or budget.";
    m.server.mcp_config={command:"node",args:["${__dirname}/server/mandate-desktop.cjs","--connection",resolve(this.options.connection)]};
    delete m.user_config;
    files['manifest.json']=strToU8(JSON.stringify(m,null,2));
    files['README.zh-CN.md']=strToU8(`# ${m.display_name}\n\n此接入包已绑定当前本机设置，无需填写 Agent profile 或 Connection file。\n\n请在 Claude Desktop 的 Settings → Extensions 中导入此包，核对扩展名称包含 Guided 和连接编号 ${binding.slice(0,6)}，再启用。旧的 Mandate Wallet 为手动扩展，请先停用，避免选择错误的服务。若仍看到两个文件字段，说明当前查看的是手动扩展。\n\n首次只调用 mandate_get_context，核对网络、钱包、任务与会话。安装扩展不会扩大预算或恢复已撤销、已到期的权限。此包仅适用于生成它的本机配置；它不包含连接令牌、私钥或数据库。\n`);
    return zipSync(files,{level:6});
  }
}
