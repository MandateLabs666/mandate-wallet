# 比赛材料说明

本目录对应 2026 FinTechathon 的 Topic F（Agent Wallet），整理日期为 2026 年 10 月 20 日。材料使用英文，演示文稿的讲稿另附中文讲解提示。

`presentation/mandate-wallet-10min-final.pptx` 是依据新版技术文档修订的可编辑 14 页演示文稿，沿用网站的黑白蓝配色，并加入金属曲面、蓝色光效和纹理背景。全体成员姓名与学校信息已移至第一页。第 3 页为系统架构图，第 5、6 页为账户接入及六方付款时序图，第 9—11 页展开研究问题、证据关联和宿主干预边界。图表均可在 PPTX 中编辑，同目录的 PDF 用于预览。`SPEAKER_NOTES.en.md` 已同步更新为约 1,075 词的英文讲稿，并附中文讲解提示；`TIMING.zh-CN.md` 将 14 页的讲解、换页和指图停顿分配到累计 600 秒。正式演讲前仍需按实际语速排练确认。

书面报告现已统一改用 LaTeX。以下四份英文 PDF 的首页均列出全体成员、团队分工、专业、年级、学校、邮箱及导师信息。

| 报告 | 内容与文件 |
| --- | --- |
| 技术文档，28 页 | [PDF](documents/mandate-wallet-technical-documentation.pdf)：7 张可编辑 TikZ 图表、协议对象与消息、签名域、预算不变量、并发与恢复、证据结构、攻击分析、实验和部署案例。 |
| 安全自评，8 页 | [PDF](documents/mandate-wallet-security-self-assessment.pdf)：威胁模型、控制措施、修复记录、残余风险和自评范围。 |
| 执行证据说明，6 页 | [PDF](documents/mandate-wallet-execution-evidence.pdf)：八笔公共交易、操作恢复时序、证据文件、独立验证方法和结论限制。 |
| 复现与部署指南，6 页 | [PDF](documents/mandate-wallet-reproduction-and-deployment.pdf)：环境、构建、测试、本地体验、Claude Desktop 图形界面接入及测试网部署与恢复。 |

可编辑源码位于 [documents/latex/](documents/latex/README.en.md)，主技术文档入口为 `main.tex`。下载 [LaTeX 源码包](documents/mandate-wallet-latex-sources.zip) 后，可按说明使用 `latexmk` 编译四个独立入口。文献采用 BibTeX 管理，引用标准、协议官方文档、论文及固定版本的项目证据；原始私有 proposal 不随源码包分发。早期 Markdown 报告继续保留，当前完整书面材料以本目录的 LaTeX 和 PDF 为准。

当前演示视频位于 `../video/claude-desktop-base-v1/`。无声画面长 4 分 50 秒，已完成账户准备、Rabby 授权、原生 Claude Desktop 接入、USDC 采购、故障恢复及撤销的剪辑。用户正在录制配音；收到录音后，还需完成声音合成、字幕对齐与成片复核。视频中的 ETH 指固定统计样本，付款资产始终为测试 USDC。

执行证据与视频放在同一目录，包括可独立解压的 ZIP、链上交易索引、收据、服务返回、撤销后拒绝记录及独立验证报告。唯一采购付款为 0.01 测试 USDC，钱包最后保留 0.14 测试 USDC。独立验证的必需财务检查通过，但 HTTPS 来源和完整历史缺少独立证明，因此整体报告仍为 `incomplete`。

源码仓库为 https://github.com/MandateLabs666/mandate-wallet 。源码归档、文件摘要及独立目录复现记录见 `../SOURCE_DELIVERY.en.md` 和 `artifacts/competition/source-delivery/submission20261020/`。公开材料不包含报名表、原始私有 proposal、私钥、连接凭据、数据库或本机绑定的接入包。

本次工作准备比赛文件，尚未向主办方提交。原项目剩余验收项仍按总任务清单管理，不因文档或仓库发布而自动完成。
