# M7 实际钱包演示与材料更新

2026-10-15（SG）。当前仍 96/105 子项验收。此轮提升已交付材料并修复实际演练发现的问题，不关闭 T8.07/08/10、T11.08/09 或 G3/G6。

## 本轮交付

- [幻灯片 v3](../competition/presentation/mandate-wallet-v3.pptx)：12 页、964 词讲稿，115 词/分钟加 50 秒停顿估算 552.96 秒。实际 MetaMask 截图替换旧 fixture 截图；安全工具复核及剩余边界更新。6 个原生表格、2 个原生图表，原图表和嵌入 workbook 逐字节保留。最终 12 页渲染逐一检查，package/layout/font/chart/import 检查通过；没有人工试讲或 PowerPoint 原生打开声明。[验收](../artifacts/competition/presentation-v3/acceptance.json)。
- [实际 MetaMask 视频](../competition/video/mandate-wallet-demo-wallet-v3.mp4)：214.35 秒，12 阶段、408 个实际浏览器帧，1280×900 H.264/AAC。新 root 在录制前用原生钱包创建；录制包含会话授权、MetaMask 确认、0.01 mock USDC 付款后 500、同 hash 恢复、独立检查、原生撤销确认及下一步拒绝。3 笔 Owner 交易、恰 1 笔付款；完整 AV 解码、音频峰值−1.5dB、旁白无重叠和 12 个最终阶段画面检查通过。[验收](../artifacts/competition/wallet-video/wallet-v3/acceptance.json)、[字幕与复现](../competition/video/README.en.md)。
- [实际钱包竞态修复](M6_OWNER_CONCURRENCY.zh-CN.md)：新任务状态刷新后再关闭审核弹窗；并发 Owner 状态观察仅对特定版本冲突重新读取验证，不重试签名/广播。修复前 7 通过/1 失败，修复后 8 项 Web 及 3 项 OwnerStatus 测试通过；TypeScript 通过。补充静态扫描与原已处置信号集合一致。[机器验收](../artifacts/m6/owner-concurrency/acceptance.json)。
- README、技术报告、构建指南、交付清单和展示说明同步当前结论，保留旧 deck/video/rc2 的历史证据。

## 限制与后续工作

此次视频是本地链 31337、受控商户和 mock USDC。MetaMask 为固定官方未修改解压扩展，使用原生 UI 自动操作；不是人工试用、Chrome Store 安装、实体手机或恶意宿主隔离验收。连接及密码/助记词输入在录制前完成，未注入 provider。金融与关联检查通过，但缺少 HTTPS 来源和完整历史保证，因此 overall 保持 incomplete。完整检查报告单独导出，部分下方检查未出现在录制视口。

初次完整录制在原生控件等待阶段超时，没有冒记成功；后续新 profile 完整运行通过。更早快速演练复现的产品竞态与失败摘要保留在并发修复验收中。所有活动仅使用本地免费工具，公共交易新增 0，没有正式提交或对外消息。

已托管 Sites 保持既有部署版本，rc2 源码包仍固定 901cadda 历史提交。本轮改动尚未进入该源码包；更新后的源码候选必须重新导出、干净目录复现和隐私检查。接下来执行 T11.08 跨材料数据/地址/安全边界核对，并继续 T8 实际账户切换等可自动验证路径。人工钱包体验、官方/报名及此前工作授权问题仍需原有外部输入；最终冻结不因这些材料存在而自动通过。
