# M7 独立工具安全复核

2026-10-15（新加坡时间）。本批采用第三方维护的 Slither 和 Semgrep CE 检查合约及 evidence verifier，逐条归档 113 个初始信号，并复现、修复、复验一个 Echo 本地加密密钥库问题。工具条件已经具备；完成标准沿用 M7 正式规格的“运行独立工具检查合约与 evidence verifier，跟踪实际发现和修复”。这不是非作者人工审计，不使用“第三方审计通过”标识。

## 实际范围与发现

固定 Slither 0.11.6、crytic-compile 0.4.2、Semgrep CE 1.181.0；规则源码、归档 SHA、完整依赖版本及编译参数均已保存。Slither 使用 102 个 detector 检查 Mandate／Echo Foundry 编译结果；Semgrep 使用官方固定快照的 188 条配置规则，覆盖 66 个 TypeScript 文件，包括独立验证器。扫描在本地运行，不登录或上传项目。

| 范围 | 初始信号 | 修复后信号 | 处理 |
| --- | ---: | ---: | --- |
| Mandate Solidity | 3 | 3 | 编译 pragma、标准接口命名和生成字节码的提示 |
| Echo Solidity | 45 | 45 | 重入保护／受限回调、到期与日计数、实现地址角色限制、测试 fixture 和信息项 |
| TypeScript | 65 | 64 | 一项 GCM 标签策略问题已修复；断言、分派、HTML 转义和 CORS 路径逐项复核 |

113 个初始结果全部保留具体 ID、源位置、工具严重级别、处置与理由，见 [逐项记录](../artifacts/m7/security/findings-triage.json)。修复后仍有 112 个原始提示，不能称为“零告警”。工具判定与作者路径复核分别记录。

SR-01 的复现：把真实随机测试密钥库的认证标签截为 12／8／4 字节，旧代码仍产生对原 signer 有效的签名。修复固定要求 16 字节，并为 cipher／decipher 指定 `authTagLength:16`。复验保留完整标签签署，所有截短标签拒绝。问题影响本地加密文件的完整性格式，不声称已窃取私钥或绕过链上授权。源码和 [修复前](../artifacts/m7/security/keystore-before.json)／[修复后](../artifacts/m7/security/keystore-after.json) 指纹分别保存；没有合约、ABI、部署 runtime 或研究协议变化。

Echo 的两个 High 重入余额提示经 EntryPoint 限制、entered 保护、实际余额差及原子支出路径复核；相关重入回归通过。保留批准 token 余额语义假设。实现地址本身可以收 ETH、ABI 无提款方法，单独记录为角色限制，不把它作为应充值的 EOA 账户。其他主要结论和未证明事项见 [英文工具复核](../competition/STATIC_TOOL_REVIEW.en.md)。

## 复验与任务状态

验收要求：完整扫描成功、原始结果与逐项处置一一对应、确认问题修复前后有实际复现、规则告警消失、20 项 Echo 客户端／27 项 Echo 合约／23 项 Mandate 合约及证据与服务回归通过、类型检查和敏感值排除检查通过。实际结果、源码和输出指纹以 [机器验收](../artifacts/m7/security/acceptance.json) 为准。

机器验收已通过：T10.10 已关闭，T10 全部十项完成；结合 T9 已完成，G4 已关闭，正式子项为 96/105。M6／G3 继续等待 T8 剩余路径与人工试用；M7 还包含 T11 的材料核查、最终冻结和官方确认，G6 继续开放。主网和正式提交边界保持不变。

复现入口为 `python3 scripts/m7-static-review.py bootstrap` 和 `python3 scripts/m7-static-review.py run --output artifacts/m7/security/<新目录>`；bootstrap 使用隔离 Python 3.12 环境和固定 requirements，扫描日志、非零退出码及 findings 全部保留。原受限环境的 Echo 测试未完成并中止，允许本地回环 RPC 的重跑结果另存，不覆盖或假称初次通过。
