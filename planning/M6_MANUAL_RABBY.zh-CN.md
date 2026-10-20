# M6 Rabby 人工入口检查

2026-10-15（新加坡时间）。归属 T8 既有验收准备；没有新增完成条件，不关闭 T8.07/08/10 或 G3。当前仍为 97/105。操作步骤见[人工试用指南](M6_MANUAL_UAT.zh-CN.md)，证据见[入口检查包](../artifacts/m6/manual-rabby/r3/acceptance.json)。

用户已选择 Rabby，并授权隔离本地连接的 Ignore all。此前的[原生钱包流程](M6_CREATED_TASK_HANDOFF.zh-CN.md)已有独立记录；本轮交付一个供团队主动启动的人工入口，避免自动排查反复打开可见钱包。

## 实现及范围

`mandate/experiments/m6-manual-rabby.ts`要求显式`--visible`或`--smoke`；可见模式还要求交互终端。它只接受回环 HTTP、chain 31337 及独立 fixture，拒绝带 userinfo、查询或非根路径的 URL。每次使用全新 profile，配置 basic 密码存储和 mock keychain，不读取个人浏览器或密码库。

启动前核对固定官方 Rabby 0.94.12 ZIP 及 1153 个解压文件；使用扩展自身的欢迎页和真实 provider，不代填种子/密码、不导入账户、不签署。工作区连接凭据只交给本地 App，清空后才允许记录截图。捕获所有配置任务，明确不推断 App 当前所选 task；U1—U10 模板初始全部为`not-tested`。

## 实测

`scripts/m6-smoke-manual-rabby.py r3`验证 7 个拒绝条件：缺少模式、冲突模式、非交互终端的可见模式、远程 origin、远程 RPC、无效 URL、URL 包含 userinfo。全部在创建 profile 前拒绝；合成敏感 URL 片段没有进入异常输出。

一次独立 headless 本地运行加载真实 Rabby 和当前 f5d2f5fb 前端 bundle，通过工作区连接、凭据输入非空时拒绝截图、重新连接及 1280/390 视口 App 捕获。Owner nonce 保持 6，现金保持 1000000 最小单位，token 付款 0，钱包仍在未初始化欢迎页。fixture 正常停止；`pnpm typecheck`通过。本轮没有运行可见模式，没有 Owner 签名、公共交易或人工验收。

初次 r1 仅覆盖较小的入口检查；r2 新增截图保护后，重新连接仍停留 Security 页，测试驱动错误等待 Overview 元素而超时。修正驱动为重连后显式选择 Overview，r3 通过。失败日志和当次精确入口源码保留在证据包；没有将其计为产品故障，也没有重写历史结果。

可复现命令（需要现有可选浏览器运行时及已构建的本地合约/前端，运行名必须全新）：

```sh
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.runtime/browser-wallet/browsers"
export RUNTIME_NODE_MODULES="/Users/jeff/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules"
python3 scripts/m6-smoke-manual-rabby.py fresh-revision
pnpm typecheck
```

## 仍需验收

本入口供人独立操作并反馈 U1—U10，自动启动检查不替代钱包签署、可用性或实体设备覆盖。当前私有托管原生钱包复验另等 service-access token 交给测试器的明确授权；此前 Ignore all 授权不覆盖此凭据转交。公开源码候选 rc6、已部署静态页面及视频均保留各自版本；本轮只新增测试工具、证据和说明，不重新发布产品。
