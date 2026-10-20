# Mandate 正式协议

本目录属于 M3 及后续正式实现；T2 原型保留在根目录 contracts/packages。实现规格见[正式 M3 规格](../planning/M3_SPEC.zh-CN.md)，验收见[M3 记录](../planning/M3_ACCEPTANCE.zh-CN.md)。

`contracts/`提供固定 owner、asset、chain 的 MandateAccount 与无升级管理权限的 MandateFactory。`sdk/`提供统一 ABI、付款/报价 typed data、nonce、owner 待签动作、预算查询、登记后付款数据与真实转账对账。标准 65 字节付款签名仅在已有链上预算承诺和最新权限均满足时有效。完整 Agent 入口、商户客户端和 Web App 由后续阶段验收。

采购金额、gas 与服务结果分开记账。链上 occupied 包含 paid、pending 和 consumed_unknown，付款不能再次从可用余额扣除；只有严格过期且未用 nonce 可释放。usedStep 不会因版本替换或释放清除。暂停/恢复提高版本后，owner 需重新批准策略范围及新 grant。

运行`pnpm m3:build:contracts`、`pnpm m3:abi`、`pnpm m3:test:contracts`及`pnpm m3:test`。不需要同步公共节点；本机测试临时使用 Anvil。测试网部署仍须网络与资产实测，Base 主网仅只读。

许可证：本项目 MIT；固定 OpenZeppelin/forge-std 来源与许可记录沿用 artifacts/upstreams.json。M1 fixture 仅用于明确标记的测试，正式 Base 集成使用核查后的原生测试 USDC。密钥与私有记录只存忽略的.runtime，不提交到公开材料。
