# Base Sepolia 与 Claude Desktop 演示视频

2026 年 10 月 19 日更新。公共测试网操作及画面剪辑已完成，英文人声配音待用户录制。

[观看无声视频](mandate-base-sepolia-demo.silent.mp4)。时长为 **4 分 50 秒**，分辨率为 **2560×1440**，帧率为 **30 fps**，已加入英文字幕。视频逐步演示账户准备、有限授权、Claude Desktop 接入、采购 ETH 统计样本、故障恢复和会话撤销。ETH 表示所购买的数据，付款资产始终为测试 USDC。

[英文配音稿](VOICEOVER.en.md)共 **527 词**，分为十二段。录音时朗读各段正文即可，可分段录制。[英文 SRT 字幕](captions.en.srt)含 35 条字幕，目前按画面暂定时间；收到录音后还需对齐、混音并复查五分钟限制。此前带 `draft` 的文件及阶段剪辑作为历史材料保留，当前以本页链接为准。`competition/MATERIALS.json` 已指向本轮画面、讲稿和证据；有声成片仍待完成，尚未向比赛方提交。

## 操作结果

本轮使用 Base Sepolia 智能账户 `0xa794DAa86ff10920B75a4de3b0E752586e8703D2`，测试 USDC 为 `0x036CbD53842c5426634e7929541eC2318f3dCF7e`。owner 在外部 Rabby 签署管理交易，Claude 使用 `Mandate Wallet · Guided ec0539` 0.2.1 的有限会话。owner 私钥没有交给 Claude。

账户收到 0.15 测试 USDC。成功案例的预算为 0.15，单笔上限为 0.10，会话有效期为两小时。Claude 为 ETH 固定样本支付一次 **0.01 测试 USDC**。受控商户在结算后故意返回一次 HTTP 500，随后按同一订单恢复；付款 nonce 和结算 hash 均未改变。第二次请求返回 HTTP 200，结果检查通过，Claude 据此生成简报。钱包最后保留 **0.14 测试 USDC**。

[唯一一笔采购付款](https://sepolia.basescan.org/tx/0xc23d943b69c94a5a8468ab32ee9b454ab6b57f7681ba4b93f16e4d58ae840c5d)与[会话撤销](https://sepolia.basescan.org/tx/0x5ba3feb1febde1fc2637c524ac031aa17e0a9f583bf39fc843bb865162d69a6e)均已确认。撤销后，Claude 对未购买的 BTC 样本执行一次受控检查，收到 `AGENT_GRANT_INACTIVE`。状态为 `rejected / not_requested / unchecked`，未生成付款授权、登记或结算交易。BTC 样本没有购买。

八笔关键交易的回执与区块 hash 均通过 PublicNode、Base 官方 RPC 核对。最终读取时，两家服务报告的共同 finalized 高度为 48325041，八笔交易均不晚于该高度。该核对信任 RPC 服务方，不构成独立共识证明。

## 执行证据及复核

[下载执行证据包](mandate-base-sepolia-execution-evidence.zip)，或从 [run.json](execution-evidence/run.json) 开始查看。包内包括完整交易、双 RPC 记录、费用、授权和付款事件、HTTP 失败与恢复顺序、撤销与拒绝证据、源码摘要及场景对应关系。没有私钥、连接令牌、付款授权签名或原始签名交易；公开的会话证据和商户签名保留用于复核。

[独立验证报告](execution-evidence/independent-verification.json)确认了 checkpoint 完整性、请求、ActionProof、登记时的授权、预算、付款、商户报价和回执，以及固定样本结果。`requiredChecksPassed=true`，但 `overall=incomplete`：本轮没有 HTTPS 独立见证或外部历史锚点，不宣称证明了 HTTPS 来源或完整执行历史。当前工作区连接未配置可信验证 profile，页面按钮曾返回 `TRUSTED_VERIFICATION_PROFILE_REQUIRED`；报告来自使用显式公开 trust 文件的独立验证器，不冒称该页面按钮通过。复核命令见[证据说明](execution-evidence/README.en.md)。

本轮使用受控商户、受控 facilitator 和固定样本，不能据此宣称主网采购、第三方 facilitator、实时行情或独立安全审计已通过。样本有三条观察值，均值 110；该数字没有价格单位或市场时间含义。

## 录制过程与版本范围

主系统在镜头中持续保留，钱包、Claude 和 BaseScan 随操作重点切换。画面来自本轮实际界面采集，经过裁切、缩放及停留时间调整；等待、人工签署交接和排查过程已剪去。并列画面不是同步直播。授权详情的补充镜头回看了已确认的审核记录，未再次授权。详见[逐镜头记录](mandate-base-sepolia-demo.silent.json)。

早期 ETH 订单已登记，但客户端未及时识别回执，原付款承诺在五分钟后到期，未结算 USDC。原错误已归并为通用错误，无法恢复确切 RPC 原因。修复增加原 hash 的有限重查、只读对账、过期提示及脱敏分阶段诊断，82 项相关回归和类型检查通过。

owner 随后明确批准在同一钱包内创建新 ETH 任务及两小时会话。成功任务为 `0x65a5386f35ae1dc848584bd51d1a8211110aa02b8c5264238aa4d4aa7d5a8c89`，会话为 `0x0263e35063f897a6639f0272e8d6b8a3ff3d19c772f5d8b04baf05ae7c4ebd47`。钱包和资金继续复用，未重新部署或注资。此前交易和 0.2.0→0.2.1 安装更新记录见[录制历史](execution-evidence/recording-history.json)。

当前产品仍需源码运行环境，尚无签名独立安装包，本地链停止后的自动恢复也未完成。本轮完成 T12.03，并验收 T12.08 的 Base Sepolia 与原生 Claude 调用部分；发行、其他系统及人工设备要求继续保留。视频结尾仅说明 Local 体验选项，不展开该路线。
