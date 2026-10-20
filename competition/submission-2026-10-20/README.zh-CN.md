# 比赛材料说明

本目录对应 2026 FinTechathon 的 Topic F（Agent Wallet），整理日期为 2026 年 10 月 20 日。材料使用英文，演示文稿的讲稿另附中文讲解提示。

`presentation/mandate-wallet-10min-final.pptx` 是可编辑的 14 页演示文稿，按十分钟安排讲解；同目录的 PDF 便于预览。第五、六页分别通过时序图说明账户与权限准备，以及 Agent 采购、登记、结算和返回结果的流程。`SPEAKER_NOTES.en.md` 包含逐页英文讲稿、预计用时和中文提示，正式演讲前仍需按实际语速排练。

`documents/mandate-wallet-technical-documentation.pdf` 为技术文档，说明产品用途、软件分工、授权规则、预算记账、x402 路线、恢复机制、研究问题、实验与局限。`mandate-wallet-security-self-assessment.pdf` 为安全自评，区分已实现的控制、已修复的问题与剩余风险；它不属于第三方人工审计。两份 PDF 均附可编辑的英文文本。

当前演示视频位于 `../video/claude-desktop-base-v1/`。无声画面长 4 分 50 秒，已完成账户准备、Rabby 授权、原生 Claude Desktop 接入、USDC 采购、故障恢复及撤销的剪辑。用户正在录制配音；收到录音后，还需完成声音合成、字幕对齐与成片复核。视频中的 ETH 指固定统计样本，付款资产始终为测试 USDC。

执行证据与视频放在同一目录，包括可独立解压的 ZIP、链上交易索引、收据、服务返回、撤销后拒绝记录及独立验证报告。唯一采购付款为 0.01 测试 USDC，钱包最后保留 0.14 测试 USDC。独立验证的必需财务检查通过，但 HTTPS 来源和完整历史缺少独立证明，因此整体报告仍为 `incomplete`。

源码仓库为 https://github.com/MandateLabs666/mandate-wallet 。源码归档、文件摘要及独立目录复现记录见 `../SOURCE_DELIVERY.en.md` 和 `artifacts/competition/source-delivery/submission20261020/`。公开材料不包含报名表、原始私有 proposal、私钥、连接凭据、数据库或本机绑定的接入包。

本次工作准备比赛文件，尚未向主办方提交。原项目剩余验收项仍按总任务清单管理，不因文档或仓库发布而自动完成。
