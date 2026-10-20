# M6 采购结果、兼容拒绝与现金预检

2026-10-15（SG）。本批修复 T5 客户端的一项低资金处理，并推进 T8.07/08/10。正式子项仍 97/105、G3 开放；人工试用尚未验收。

## 可见结果与后续操作

固定前端`f554395`的本地实测中，后台已经确认付款且商户返回 500，Services 卡片仍只显示运行按钮。付款、服务、结果信息要到其他视图查找；原客户端虽保持业务幂等，用户难以判断下一步。

现在服务卡片直接显示 Payment / Service / Result、原付款金额与结算 hash，给出独立后续入口：

| 实际状态 | 界面行为 |
| --- | --- |
| paid / failed 或 unknown / unchecked | Recover same order，使用原付款，不创建新订单 |
| paid / returned / valid | View evidence，说明来源/历史检查仍独立 |
| paid / returned / invalid | Inspect evidence，保留原付款，避免再次购买同一步骤 |
| registering / reserved / pending | Reconcile same step，保留原承诺和占用 |
| 未付款且授权暂停、过期、撤销或旧版本 | 说明具体 Owner 恢复动作，进入 Mandates |
| nonce 使用不明、取消或承诺已释放 | Inspect payment record，不创建替代付款 |
| 已知现金不足 | 提示 Owner 在正确网络向原钱包补充批准资产；预算上调不会增加现金 |

失败/待解决提示用现有 amber 样式，raw reason code 放在可展开详情中。报价不兼容提示明确当前 network/asset/recipient/amount 及 EIP-3009 边界；它保留原`QUOTE_OUTSIDE_AUTHORIZATION`错误码，不凭该聚合码猜测唯一失败条件。Services 与概览/付款表共用后续操作逻辑；采购期间按 task/service 禁用重复界面操作，完成后仅更新仍在查看的原连接与任务。

## 现金预检与证据角色

PurchaseClient 在付款参数/签名/链上登记前读取批准资产的当前余额。余额不足时保持`draft`，记录`WALLET_CASH_INSUFFICIENT`，不形成登记或付款签名、不广播、不占用预算。补款不要求重新生成 policy 或 session，可以继续原业务步骤和确定 nonce。现金是当前快照；最终余额仍由 token 结算检查，快照不会预留现金或保证以后一定足够。

已登记/已付款的恢复先复用原记录，不因当前现金不足而改成新付款。启用证据时，现金不足可以签署`MandateSessionEvidence / SessionAttestation`决策检查点；这与`RegisterPayment`和`TransferWithAuthorization`签名分开。字段保留 draft 和错误原因，后续付款检查点仍能与其连接。链上预算、授权、nonce、到期释放和最终结算规则未改。

## 验证范围

[验收记录](../artifacts/m6/purchase-feedback/acceptance.json)保存源码/驱动 hash、旧版复现和最终 13 个独立本地 EVM 链和 HTTP 服务/浏览器场景。可信 Node fixture 负责构造故障；浏览器没有钱包 provider，没有 Owner 签署，不以此代替原生 MetaMask 或人工试用。

- 付款后 500→同 hash 恢复；实际付款恰 1 次、occupied10000、结果最终 valid。
- 暂停、过期、旧版本、session 撤销、root 撤销：实际调用拒绝，登记/付款签署 0、operator nonce 不变、付款 0、占用 0。
- 错误 network、asset、scheme、Permit2 及超限 amount：实际 HTTP 报价拒绝，签署/登记/付款 0。
- 现金 5000 不足 10000 报价→保持 draft；可信 fixture 补 5000 后沿用同一 policy/session 采购，现金最终 0。独立服务集成测试另验证签名决策证据、付款后 500 及现金 0 时原 hash 恢复。
- 已付款且结果检查 invalid：实际付款 1 次，但界面不显示任务完成，引导检查证据。

27 项服务/网关、8 项 Web 回归及 TypeScript 通过；浏览器与 MCP 构建不含私有运行文件。所有 token 付款均为独立 fixture 中的 mock USDC；公共交易 0。

补充静态复核：Slither 仍 3 个 Mandate/45 个 Echo 信号；Semgrep 扫描 67 个 TS 文件、67 个原始信号、解析错误 0。相对上次 64 个 TS 信号增加 3 处 HTML 模板插值提示。逐项检查新增模板的`esc`、固定 action/class 和属性编码；独立恶意文本显示探针使用可执行正向对照，确认 payload 在 App 中仅作文字显示，真实链占用与记录不变。[处置记录](../artifacts/m7/security/purchase-feedback-recheck/disposition.json)。原 M7 工具报告的 113/112 数字保留其原始源码范围，不冒称新扫描仍为 112 或零告警。

## 限制与复验

同链不同测试用例使用独立 Anvil；没有新增公共部署、主网付款或第三方商户验收。13 个有限用例不证明全部钱包/facilitator 兼容或恶意宿主隔离。实验 driver 的早期 r1 源码在提示样式定稿前运行，最终采用 r2 指纹，未覆写旧结果。研究性能数值保留原实验协议/源码，本批不宣称重测了性能。

```sh
node --import tsx mandate/experiments/m6-purchase-feedback.ts FRESH paid-failed after
node --import tsx mandate/experiments/m6-purchase-feedback.ts FRESH paid-failed before f554395
node --import tsx mandate/experiments/m6-purchase-render-probe.ts FRESH
MANDATE_BUILD_REPORT_DIR=NEW_BUILD_DIR pnpm m4:test
pnpm m6:test
```

浏览器使用已安装的可选 Playwright/Chromium 及`RUNTIME_NODE_MODULES`/`PLAYWRIGHT_BROWSERS_PATH`。可选场景为`paid-failed/paused/expired/stale/revoked/root-revoked/network/asset/scheme/permit2/amount/cash/invalid-result`。每次拒绝覆盖已有运行名。实际人工操作仍按[U1—U10](M6_MANUAL_UAT.zh-CN.md)记录；本地 fixture 不提供跨设备手机连接。
