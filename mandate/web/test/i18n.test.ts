import {expect,it} from "vitest";
import {translateDisplay} from "../i18n.js";
it("translates visible actions and recovery guidance without changing their meaning",()=>{
  expect(translateDisplay("Recover same order","zh-CN")).toBe("重试原订单");
  expect(translateDisplay("Checks passed. Source gaps remain.","zh-CN")).toContain("尚不完整");
  expect(translateDisplay("This mandate has expired. The owner must approve a current policy and finite session.","zh-CN")).toContain("所有者");
});
it("preserves numeric values and chain observations while localizing display templates",()=>{
  expect(translateDisplay("paid · 0.010001 USDC","zh-CN")).toBe("已付款 · 0.010001 USDC");
  expect(translateDisplay("Block 42 · 2026-10-16T10:00:00.000Z · 6-decimal USDC","zh-CN")).toBe("区块 42 · 2026-10-16T10:00:00.000Z · USDC（6 位小数）");
});
it("leaves identifiers, error codes and unknown user text untouched",()=>{
  for(const value of ["0x1234aBcD","OWNER_REVIEW_CONTEXT_MISMATCH","My private research task","GET /stats?asset=ETH","MandateWallet v2"]){expect(translateDisplay(value,"zh-CN")).toBe(value);}
});
it("preserves source whitespace and restores English display strings",()=>{
  expect(translateDisplay("  Open workspace ","zh-CN")).toBe("  打开工作区 ");
  expect(translateDisplay("Recover same order","en")).toBe("Recover same order");
});
it("retains the exact original owner request identifier in localized feedback",()=>{
  const id="0x"+"ab".repeat(32),message=`Owner request ${id}: Signature cancelled. No permission was activated.`;
  expect(translateDisplay(message,"zh-CN")).toBe(`授权操作 ${id}：签名已取消，没有启用任何新权限。`);
});
it("localizes compound guide status while preserving the selected asset",()=>{
  expect(translateDisplay("Needs attention · ETH data","zh-CN")).toBe("需要处理 · ETH 数据");
  expect(translateDisplay("In progress · BTC data","zh-CN")).toBe("处理中 · BTC 数据");
});
