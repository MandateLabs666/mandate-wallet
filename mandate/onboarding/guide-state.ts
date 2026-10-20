export type GuideStage=0|1|2|3;
export type GuideHost="claude-desktop"|"claude-code"|"codex";
export type GuideState={version:2;identity:string;stage:GuideStage;host:GuideHost;hostConfirmedAt?:string};
export function restartGuide(identity:string):GuideState{return {version:2,identity,stage:0,host:"claude-desktop"};}
export function restoreGuide(raw:unknown,identity:string,exists:boolean,ready:boolean):GuideState{
  const g=raw as Partial<GuideState>|null;
  if(!g||g.version!==2||g.identity!==identity||![0,1,2,3].includes(g.stage!)||!["claude-desktop","claude-code","codex"].includes(g.host!))return restartGuide(identity);
  const confirmed=typeof g.hostConfirmedAt==="string"&&Number.isFinite(Date.parse(g.hostConfirmedAt));
  return {version:2,identity,host:g.host!,stage:Math.min(g.stage!,!exists?0:!ready?1:!confirmed?2:3) as GuideStage,...(confirmed&&ready?{hostConfirmedAt:g.hostConfirmedAt}:{} )};
}
export function navigateGuide(g:GuideState,stage:GuideStage,exists:boolean,ready:boolean):GuideState{
  if(stage>0&&!exists||stage>1&&!ready||stage===3&&!g.hostConfirmedAt)throw Error("GUIDE_STEP_NOT_READY");
  return {...g,stage};
}
export function selectGuideHost(g:GuideState,host:GuideHost):GuideState{
  if(host===g.host)return g;
  return {version:2,identity:g.identity,stage:2,host};
}
export function confirmGuideHost(g:GuideState,ready:boolean,at:string):GuideState{
  if(!ready||g.stage!==2||!Number.isFinite(Date.parse(at)))throw Error("GUIDE_HOST_NOT_READY");
  return {...g,stage:3,hostConfirmedAt:at};
}
