# M6 SDK、示例和证据操作验收

2026-10-15（SG）；T9.01—T9.07 已验收，T9 完成。T8.07/08/10 仍继续，M6/G3 开放。未新增公共付款；实际钱包扩展尚未验收，Sites 尚未发布。

统一 Node/browser 入口、CLI 和 MCP 复用 PurchaseClient/OwnerStatus/Workspace 及证据规则。CLI 提供授权请求、发现/报价/采购、同订单对账、脱敏 receipt、选择披露和独立验证；不加载管理钱包私钥。最小 Agent、独立受控商户、初始化 fixture 和恢复/撤销例子可运行；支持矩阵明确未知 wallet/scheme/facilitator 不自动付款，协议 v2/ABI/schema/地址/runtime 在 VERSIONS.json 固定。没有 npm 发布声明。

## 干净目录实际执行

复制 1017 个公开源文件到全新临时目录，排除.git/node_modules/.runtime/私有报名/原 proposal 和运行数据库。依次执行[快速开始](../mandate/sdk/QUICKSTART.zh-CN.md)的四条命令：固定源 bootstrap、CI 冻结 install、完整 SDK build、sdk:demo。没有手工修改复制后的源码。使用宿主已声明的 Node/pnpm/Python/Foundry 和包缓存，不把它描述为全新 OS。

取得并逐文件核对 x402 338、forge-std 68、OpenZeppelin 837 个文件；安装 460 个锁定依赖；Solidity0.8.26 编译成功，CLI/MCP/Web/只读 verifier 及 typecheck 通过。单独商户、Agent、CLI 进程实际运行本地 EVM 链和 HTTP 服务付款 0.01；第一次 HTTP500，重开原记录恢复同 hash，选择披露公开 fixture 并在干净只读进程确认金融/关联检查；owner 可信 fixture 签署撤销，后续步骤拒绝。正常报告 overall=incomplete 保留 HTTPS/未记录的历史缺口。

[干净执行记录](../artifacts/m6/sdk/clean-environment/execution.json)保存源文件 SHA 和实际命令；[结果](../artifacts/m6/sdk/clean-environment/summary.json)、[独立检查](../artifacts/m6/sdk/clean-environment/verification.json)、[公开包](../artifacts/m6/sdk/clean-environment/evidence-bundle.json)及各阶段输出都保留。示例资金是可 mint 本地 token，owner 在初始化 fixture，不在 Agent/CLI；同一操作系统无法防范恶意宿主。

## Web证据操作

导出使用原付款 session/signer；换 session 后不重签历史。管理员验证配置固定部署身份、runtime/RPC 及最大披露范围，Web 选择不能扩大；选定步骤之外仅保留 checkpoint，不披露其他步骤正文。隐藏结果同时隐藏可猜测的结果摘要；公开链上的请求 hash/预算等仍可能揭示低熵元数据，不能声称匿名性。

浏览器实际运行本地付款后 500 及按原订单重试，再检查默认隐藏包、管理员允许的公开 request/result 披露包，显示逐项 source/guarantee/status。资金检查 passed=true，HTTPS/history 仍 incomplete。实际浏览器下载 schema2、5 个 checkpoint 的 bundle，已复制到[浏览器导出](../artifacts/m6/sdk/browser/exported-bundle.json)。桌面/390px 无页面 overflow，未见 JS error。下载等待发生异常长延迟，后续调用须使用明确超时；不以此延迟冒充协议性能数据。

## 回归与实际发现

7 项 Web/SDK 证据测试、26 项 M4 及 25 项 M5 回归通过。覆盖原 session 恢复、跨步骤隐私、管理员限制、损坏包拒绝、独立进程无私有输入。初次示例发现 call 命令拒绝--output，已修复并完整复跑；诊断留私有目录，失败阶段没有被当作成功证据。

干净构建的 unreachable 警告揭示旧 BudgetInvariant 驱动在非 cancel 分支也无条件 return，旧 8192 调用没有覆盖实际 settle。已把 return 限定到 cancel 分支，并增加真实商户余额 20000、钱包 980000、占用 50000 的单测；修正后的 128×64=8192 invariant 调用、2739 次 settleOrCancel 入口、0revert 与实际结算单测通过。[回归](../artifacts/m6/sdk/invariant-harness-regression.json)。这是测试覆盖缺陷修复，未改变任何已部署合约源码/ABI，不改写旧报告。原正常/公共采购证据仍保留；后续 M7 继续安全复核，不能把本修复当完整 T10.10。

最终实现/证据指纹与逐项 T9 映射见[验收清单](../artifacts/m6/sdk/acceptance.json)。完整管理钱包浏览器和实际扩展仍按 T8 分别验收；公共测试网只读状态核对、网站准确 private 版本发布及 M7 材料继续。

实现检查点：`89b333e`。干净目录保存其实际执行时的逐文件快照，后续 README/构建报告路径改进与仅测试驱动修复分别留证，未手工修改干净副本。

M7 后续修复：SDK/Web 启动日志已脱敏，recorder 在重组后为新 canonical 上下文追加服务观察。当前 79 项相关回归及 SDK 独立进程采购/恢复/撤销通过，见[M7 运维验收](M7_OPERATIONS_ACCEPTANCE.zh-CN.md)。原 M6 干净安装为历史版本证据，本轮没有新增依赖；T9 仍已完成，真实外部钱包验收继续保留。
