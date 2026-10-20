# 测试网资源准备核对

2026 年 10 月 14 日只读核查，两条链分别固定观察区块/hash 并重查 canonical 一致性。原始记录见 [资源快照](../artifacts/preparation/testnet-resources.json)；这是余额与元数据观察，不是正式部署/付款验收，也不授权追加资金。

## 现有资源

| 网络/资源 | 观察结果 | 使用边界 |
| --- | --- | --- |
| Ethereum Sepolia M2 deployer | 0.014 测试 ETH | 已有 M2 资金分配，保持原预算与用途 |
| Ethereum Sepolia M2 owner | 0.003 测试 ETH | EntryPoint deposit 上限 0.002，剩余用于原 owner 操作 |
| Ethereum Sepolia M2 executor / utility | 0.0015 / 0.0005 测试 ETH | 自建 bundler 角色；总分配 0.019、含资金准备费用上限 0.02 不变 |
| Ethereum Sepolia 原生测试 USDC | 本次观察的原 funder 与全部 M2 角色均为 0 | 若后续选择该路线，需免费测试币和实际兼容/结算；元数据不能代替它们 |
| Base Sepolia 原 owner | 19 测试 USDC、约 0.004789 测试 ETH | 已有实验资源；新部署先模拟费用，不因余额充足扩大采购预算 |
| Base Sepolia operator | 约 0.000196 测试 ETH | 原参考 facilitator 实验角色，正式配置另验 |
| Base Sepolia M1 采购钱包 | 0.90 测试 USDC、旧授权 occupied0.10 | 原实验钱包；旧授权已到期，不能作为新的有效任务复用 |
| Base Sepolia 原商户 | 0.10 测试 USDC | 原 M1 付款结果，不是未来采购预算 |

M1 旧授权到期不取消已完成的历史验收，也不自动释放已付款占用。正式 M3 钱包和授权独立创建/验证；不要把历史 manifest 直接作为新 CLI 可执行授权。

两条链资产地址已从 [Circle 官方地址表](https://developers.circle.com/stablecoins/usdc-contract-addresses)核对，并读取实际 code、代理实现、name/version/decimals 及 DOMAIN_SEPARATOR。Ethereum Sepolia 与 Base Sepolia 的域不同，签名不能跨链/跨资产复用。实现源码、ERC-1271 行为、facilitator 和实际结算仍须各自验证。

首次未启用 RPC batching 的盘点中，Ethereum 查询未完成，该结果标为 unavailable 而不是余额 0；原记录见 testnet-resources-attempt1.json。启用标准批量只读 RPC 后两条链均观察成功。所有盘点提交交易数为 0。

复查命令：

```sh
pnpm prep:resources
```

脚本只读取公开地址 manifest，不加载私钥、不创建 wallet client、不发付款。公共 RPC 用于只读盘点，不替代 M2 自建节点/严格 Alto 验收。快照随区块变化，正式广播前重查余额、最大费用、链 ID 和原交易 journal。

总任务仍按依赖推进：T3/T4 正式实现等待 G1；默认采购预算 0.15 测试 USDC、单笔 0.10 保持不变。新资金或主网付款需要用户明确授权。
