import {it,expect} from "vitest";
import {restartGuide,restoreGuide,navigateGuide,selectGuideHost,confirmGuideHost} from "./guide-state.js";
it("an existing account with successful independent MCP checks still starts at step one",()=>{
  expect(restoreGuide({stage:3,connectionCheck:{passed:true}},"existing-wallet",true,true).stage).toBe(0);
  const g=navigateGuide(restartGuide("existing-wallet"),2,true,true);
  expect(restoreGuide(g,"existing-wallet",true,true).stage).toBe(2);
  expect(()=>navigateGuide(g,3,true,true)).toThrow("GUIDE_STEP_NOT_READY");
});
it("restart clears only guide state and cannot retain an application confirmation",()=>{
  const confirmed=confirmGuideHost(navigateGuide(restartGuide("same-account"),2,true,true),true,"2026-10-18T08:00:00Z");
  const reset=restartGuide(confirmed.identity);
  expect(reset).toEqual({version:2,identity:"same-account",stage:0,host:"claude-desktop"});
  expect(restoreGuide(reset,"same-account",true,true).stage).toBe(0);
});
it("a user confirmation is distinct from an independent check and does not transfer to another host",()=>{
  const g=navigateGuide(restartGuide("wallet"),2,true,true),confirmed=confirmGuideHost(g,true,"2026-10-18T08:00:00Z");
  expect(restoreGuide(confirmed,"wallet",true,true).stage).toBe(3);
  expect(selectGuideHost(confirmed,"codex")).toMatchObject({stage:2,host:"codex"});
  expect(selectGuideHost(confirmed,"codex").hostConfirmedAt).toBeUndefined();
});
it("a new task or missing runtime invalidates saved progress instead of implying connection success",()=>{
  const g=confirmGuideHost(navigateGuide(restartGuide("old-task"),2,true,true),true,"2026-10-18T08:00:00Z");
  expect(restoreGuide(g,"new-task",true,true).stage).toBe(0);
  expect(restoreGuide(g,"old-task",true,false).stage).toBe(1);
  expect(restoreGuide(g,"old-task",true,false).hostConfirmedAt).toBeUndefined();
  expect(restoreGuide(g,"old-task",false,false).stage).toBe(0);
  expect(()=>confirmGuideHost({...g,stage:2},false,"2026-10-18T08:00:00Z")).toThrow("GUIDE_HOST_NOT_READY");
});
it("malformed local progress cannot skip ahead or supply a host confirmation",()=>{
  for(const raw of [null,{}, {version:2,identity:"a",stage:99,host:"codex"},{version:2,identity:"a",stage:3,host:"codex",hostConfirmedAt:"invalid"}]){
    expect(restoreGuide(raw,"a",true,true).stage).toBeLessThan(3);
  }
});
