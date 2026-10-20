# 比赛官方要求复查

核查日期：2026 年 10 月 14 日，新加坡时间。范围为国际赛道 Topic F。此文件是等待 M2 节点同步期间的材料准备，不表示 T11 已验收，也不表示已取得组委会答复或已提交作品。

## 核对来源与结果

主网站需要 JavaScript；已用浏览器选择 International Track，而不是读取默认显示的 Domestic Tracks。官方附件已下载并用 bundled renderer 渲染为 5 页，逐页检查；前 4 页有正文，第 5 页为空白。原附件、段落索引和渲染保存在忽略的 .runtime/competition-sources/，公开来源指纹保存在 [核查记录](../artifacts/competition/requirements-review.json)。

| 项目 | 官方来源与观察 | 本项目处理 |
| --- | --- | --- |
| 语言/赛道 | 国际赛道使用英文；选择六个方向之一，Topic F 为 Agent Wallet | 材料和最终演示准备英文版本，中文用于内部计划。[规则页](https://fintechathon.g-ican.com/#/en/rule) |
| 截止 | 国际网页写 20 October 24:00 UTC+8；附件写 23:59 UTC+8；IEEE 写 10 月 20 日 | 使用较早的 2026 年 10 月 20 日 23:59 新加坡时间作为准备边界，不假定截止后可换版本。[附件](https://fintechathon.g-ican.com/templates/international-topics-rules-en.docx)、[IEEE](https://www.ieee-cis-singapore.org/2026-fintechathon) |
| 核心评分 | 任务完成 40%，安全/合规 30%，创新/交互 30%；挑战/实现加分上限 5 | 主演示必须包括有用任务、安全拒绝、澄清与恢复，而非仅展示合约或界面。[国际规则](https://fintechathon.g-ican.com/#/en/rule) |
| 链上证据 | 国际规则的 Topic F 任务评价使用交易哈希；附件要求链上题的真实链上交易记录 | 保存真实钱包/支付/失败/撤销的交易与事件；UI 模拟不能替代。测试网和受控商户是否足够仍未获官方确认。[附件](https://fintechathon.g-ican.com/templates/international-topics-rules-en.docx) |
| 幻灯片 | 国际网页和附件均要求演示幻灯片，展示不超过 10 分钟 | 准备有证据的英文 deck 及讲稿；形式存在不代表已录制/验收。[规则页](https://fintechathon.g-ican.com/#/en/rule) |
| 视频 | 国际网页标为必交、不超过 5 分钟；附件标为可选、同样限 5 分钟 | 按必交准备真实演示视频，仍询问最新适用要求。[网页](https://fintechathon.g-ican.com/#/en/rule)、[附件](https://fintechathon.g-ican.com/templates/international-topics-rules-en.docx) |
| 源码/安全/执行证据 | 国际网页整体列为可选；附件清单列源码、README、仓库链接、部署/测试、安全自评和执行证据 | 完整交付这些资料；“整体可选”不解释为 Topic F 可以缺少链上证据。[附件](https://fintechathon.g-ican.com/templates/international-topics-rules-en.docx) |
| 更新 | 附件明确截止前以最新收到版本为准，截止后不接受修改 | 截止前冻结提交 commit/依赖/部署/证据；入围后的展示更新规则须取得答复。[附件第 5 节](https://fintechathon.g-ican.com/templates/international-topics-rules-en.docx) |
| 参赛资料 | 2—5 位成员、全日制境外院校、至少 60%非中国籍、每人仅一个队；主网页说明人数向上取整 | 4 人队伍需要至少 3 位符合该国籍条件的成员。实际报名及确认邮件是私有验收事项，不能根据本地文件认定外部提交无误。[国际规则](https://fintechathon.g-ican.com/#/en/rule) |
| 复用/许可 | 国际规则要求第三方材料有使用授权，保持独立完成及真实信息 | 说明 Echo 复用、M2 修复、Mandate 新增及 proposal 研究方向；保留固定源码与许可，不声称提案中的全部成果已实现。[规则页](https://fintechathon.g-ican.com/#/en/rule) |

附件本地时间 23:59 与其括号内 16:00 UTC 有一分钟不一致；23:59 UTC+8 实际对应 15:59 UTC。以明确的 UTC+8 时间为准备基准，不使用错误的跨时区换算。该复查不安排个人工期，也不改变用户“只规划任务”的偏好。

IEEE 列在线评审为 10 月 23—28 日；当前国际规则页列 10 月 22—23 日。两者都列 10 月 31 日入围公布。登记这些差异，最终安排以组委会正式通知为准，不擅自认定哪一页已被替代。[IEEE](https://www.ieee-cis-singapore.org/2026-fintechathon)、[主规则](https://fintechathon.g-ican.com/#/en/rule)

## 需要官方或用户证据的事项

1. Base Sepolia 原生测试 USDC、Ethereum Sepolia、自建严格 bundler 及受控 API 的真实公共交易是否满足 Topic F；是否要求主网、第三方商户或外部 facilitator。
2. 视频、源码、安全自评与执行证据的必交范围及提交格式/大小/渠道。
3. 截止后的源码/部署/最终展示更新是否允许，如何保留初评冻结版本。
4. 截止时间和评审日期来源差异，以哪份正式通知为准。
5. 报名确认邮件、成员资格和实际附件；此前检查发现的文件名重复需由实际提交附件核实。

主网页与 IEEE 国际赛道联系方式为 fintechathon@ican-x.com；附件另列 info@ican-x.com。询问草稿使用国际赛道地址，保存为 [英文问题草稿](ORGANIZER_QUESTIONS.en.md)，尚未发送。取得答复仍属于 T11.01；仅完成网页核查不能关闭整项。

## 当前证据与材料边界

M1 有 Base Sepolia 原生 USDC 结算/撤销拒绝证据；M2 代码、本地严格 Alto 及 17 项客户端回归已有证据，公共验收尚待节点就绪。正式 Mandate 合约、MCP/两个宿主、UI 真实连接、SDK/独立证据及最终实验仍按 M3—M7 实施。

设计截图只能说明界面准备；不能加入视频作为已上线或已连接钱包的画面。最终材料清单见 [英文交付清单](DELIVERY_CHECKLIST.en.md)。本轮不勾选 T11、不发送邮件、不进行正式提交；准备工作不会缩减完整比赛测试网产品目标。


## 2026-10-15公开来源复查

重新用浏览器选择[官方 International Track 规则](https://fintechathon.g-ican.com/#/en/rule)，并下载英文附件：附件 15670 字节及 SHA 与 14 日完全一致。网页仍将视频列为必交、源码/安全/执行证据列为可选，Topic F 仍按链上 hash 评价；规则正文没有新的测试网/主网明确说明。IEEE 与主站评审日期差异仍在。见[复查指纹](../artifacts/competition/requirements-recheck-2026-10-15.json)。这些公开页面不能代替组委会对测试网、附件差异或更新方式的答复；T11.01 继续开放，未发送邮件。

上文“当前证据与材料边界”属于 14 日准备时点。现 M2/G1、M3—M5、SDK/T10 已验收，原生 MetaMask 流程和私有静态站点更新已有证据；T8 人工试用仍保留，正式子项 97/105。当前源码候选为[rc5](SOURCE_DELIVERY.en.md)，不把旧准备状态当作当前实施状态。
