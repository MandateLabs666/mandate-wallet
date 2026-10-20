# SDK 快速开始（仓库本地安装）

环境要求为 Node 24.x（>=24.2）、pnpm 11.25.0、Python 3.12+ 和 Foundry 1.5.1，Solidity 固定为 0.8.26。在新目录中准备本仓库的完整源码和锁文件即可，无需复制 .runtime、node_modules 或私有报名材料。目前尚未发布 npm SDK，请按下方步骤从源码安装。

首次使用时，先运行 `node --version` 和 `npm --version`。如果命令不存在，或 Node 版本不符合要求，请先安装 [Node.js 24.x](https://nodejs.org/en/download)，再重新打开终端。在 macOS 或 Linux 中，如果尚未安装 pnpm，可执行：

```sh
npm install --global --prefix "$HOME/.local" pnpm@11.25.0
export PATH="$HOME/.local/bin:$PATH"
pnpm --version
```

最后一条命令应输出 `11.25.0`。请同时将 `export PATH="$HOME/.local/bin:$PATH"` 加入终端启动文件；zsh 对应 `~/.zshrc`，否则新终端可能仍找不到 pnpm。此方式将程序安装到当前用户目录，无需 `sudo`。[npm 官方文档](https://docs.npmjs.com/cli/v11/configuring-npm/folders/#executables)说明了安装目录与 PATH 的关系。

随后检查 `python3 --version`、`forge --version` 和 `anvil --version`。Python 应为 3.12 或以上；如缺少 Forge 或 Anvil，请先安装 [Foundry 1.5.1](https://getfoundry.sh/introduction/installation/)。下方的 bootstrap 命令仅下载并校验上游源码，不会安装上述开发工具。

## 从源码到有证据的采购

在仓库根依次运行：

```sh
python3 scripts/bootstrap-sdk.py
CI=true pnpm install --frozen-lockfile
MANDATE_BUILD_REPORT_DIR=artifacts/sdk-build pnpm sdk:build
pnpm sdk:demo artifacts/sdk-demo
```

bootstrap 下载指定版本的 x402、forge-std 和 OpenZeppelin 源码，核对源码包及逐文件 SHA，不执行上游 setup。install 按锁文件和现有供应链规则安装，不更新包版本。build 编译选定的官方 x402 包、正式合约、MCP、只读验证器和 Web 页面，不启动同步节点。

如果 bootstrap 已输出三个上游项目的校验结果，随后出现 `zsh: command not found: pnpm`，请完成前面的 pnpm 安装和 PATH 设置，再从 `CI=true pnpm install --frozen-lockfile` 继续。已经通过的源码校验无需重跑。

demo 会启动临时 Anvil，部署六位小数的 TestUSDC 和正式 MandateAccount，将总预算设为 0.15、单笔上限设为 0.10，并批准两个受限会话。测试商户、最小 Agent 和 CLI 分别在独立进程运行，服务收费为 0.01 测试 USDC。

首次付款后，服务返回 HTTP 500。CLI 重新打开原订单，沿用原交易 hash 和订单重试，再导出允许披露的公开测试数据。独立验证进程只读取公开 JSON 和 RPC。最后，可信的本地测试程序以账户所有者身份签署撤销，确认后续步骤被拒绝。演示结束时，会关闭本次启动的商户和 Anvil。

输出目录包括 first-agent.json、recovered.json、evidence-bundle.json、trusted-config.json、verification.json、revoke-request.json、after-revoke.json 和 summary.json。成功 summary 中的 paidAtomic=10000、sameHashOnRecovery/independentChecksPassed/revocationConfirmed/laterStepRejected 均为 true。overall=incomplete 仍明确缺少 HTTPS 来源和未记录的历史保证。

这些记录来自实际运行的本地 EVM 交易和 HTTP 请求，使用可铸造测试代币，不代表公共链或真实 DEX 成交。所有者密钥只由可信初始化程序持有，Agent 和 CLI 只加载 session、operator 文件。进程虽分开运行，但共用同一操作系统，无法防范恶意宿主。公开测试助记词不得用于真实资产。私有运行文件保存在临时目录，权限为 0600；公开输出不包含真实签名器、连接凭据或付款签名。

## 已有测试网配置

使用 gateway/README.zh-CN.md 中的合法 v2 配置、独立 session/operator 私钥文件及 connectionToken 文件。验证配置另外固定 wallet/asset/owner/chain/runtimeHash 和 RPC；不能从待验证 bundle 自报的身份生成信任。钱包和资金必须已存在；当前公共部署地址见 VERSIONS.json，历史授权可能已到期，历史钱包现金并非可用授权额度。

```sh
pnpm sdk:cli context --config PRIVATE_GATEWAY.json --credential-file CONNECTION.json
pnpm sdk:cli quote --config PRIVATE_GATEWAY.json --credential-file CONNECTION.json --service SERVICE_ID
pnpm sdk:cli call --config PRIVATE_GATEWAY.json --credential-file CONNECTION.json --service SERVICE_ID --output ORDER.json
pnpm sdk:cli reconcile --config PRIVATE_GATEWAY.json --credential-file CONNECTION.json
pnpm sdk:cli evidence --config PRIVATE_GATEWAY.json --credential-file CONNECTION.json --verification-file VERIFY_PROFILE.json --service SERVICE_ID --output BUNDLE.json
pnpm sdk:cli verify --config PRIVATE_GATEWAY.json --credential-file CONNECTION.json --verification-file VERIFY_PROFILE.json --service SERVICE_ID --output CHECKS.json
```

重试时必须使用原 task、service 和数据库，不能因超时更换 nonce 或另建订单。paid/serviceFailed 表示应按原订单获取服务；pending/consumedUnknown 表示付款仍需核对，预留额度继续保留。

撤销根授权后无法恢复。暂停或修改策略版本会使旧会话失效，取消暂停后还需恢复服务范围并批准新会话。创建、修改和撤销命令只生成待签名请求，由账户所有者在可信外部钱包中签署。获得交易 hash 后，先用 owner-broadcast 记录，再用 owner-reconcile 核对是否生效。SDK 不代替账户所有者签名或广播。

```sh
pnpm sdk:cli owner-create --config PRIVATE_GATEWAY.json --credential-file CONNECTION.json --description "Approved statistics task" --budget 150000 --max 100000 --ttl 3600 --output REVIEW.json
pnpm sdk:cli owner-action --config PRIVATE_GATEWAY.json --credential-file CONNECTION.json --input OWNER_ACTION.json --output REVIEW.json
pnpm sdk:cli owner-broadcast --config PRIVATE_GATEWAY.json --credential-file CONNECTION.json --request REQUEST_ID --hash TRANSACTION_HASH
pnpm sdk:cli owner-reconcile --config PRIVATE_GATEWAY.json --credential-file CONNECTION.json --request REQUEST_ID
```

OWNER_ACTION.json 示例：`{"action":"revokeSession","taskId":"实际任务的32字节ID"}`。只读操作和生成草稿不需要管理钱包私钥。签名前，账户所有者应确认金额、范围、有效期和版本。受控测试 provider 的结果不能代替真实浏览器扩展验收。

VERIFY_PROFILE.json 采用 VerificationProfileSchema：schemaVersion=1、chainId、wallet、asset、owner、walletRuntimeHash、rpcs 和 disclosurePolicy={request:false,result:false}。RPC 用于验证；不要把带服务密钥的 URL 当公开文件分发。管理员可以仅对公开数据 fixture 批准两项 true；CLI/Web 的--disclose-request/--disclose-result 只能进一步选择这些已批准字段，不能扩大权限。默认隐藏结果及其可猜测摘要，其他步骤保留 checkpoint 但不披露正文。链上 requestHash/nonce/预算等仍是公开元数据，不提供匿名性或抵抗所有字典攻击。

## 程序接口与独立商户

Node 导入 `mandate/sdk/index.ts`；浏览器导入 `mandate/sdk/browser.ts`，不能把 Node 入口打包到浏览器。使用 node --import tsx 运行源码；实际可运行 Agent 见 examples/minimal-agent.ts，商户见 examples/controlled-merchant.ts。MCP 仍使用已编译 dist/mandate-mcp.js 及 gateway 安装文档；8 个工具继续复用同一 PurchaseClient/OwnerStatus 规则。

```ts
import {loadGateway, MandateWorkspace} from './mandate/sdk/index.js';
const runtime = await loadGateway(configPath, connectionToken);
try {
  const workspace = await MandateWorkspace.create(runtime.tools, verificationProfile);
  await workspace.quote(taskId, serviceId);
  const order = await workspace.call(taskId, serviceId);
  const state = await workspace.snapshot(taskId);
  const bundle = await workspace.evidence(taskId, serviceId);
} finally { runtime.close(); }
```

商户配置 schema 与受控价格写在 controlled-merchant.ts；独立 quote/facilitator 文件 0600，禁止与 owner 角色混用。仅支持 31337/84532/11155111，默认测试价格 10000/USDC6、签署 offer/receipt、持久化原订单。它不是生产 facilitator 托管服务，不自动增补资金。主网付款和付费服务继续等待明确授权。
