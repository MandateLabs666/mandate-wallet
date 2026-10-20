# 单次运维监测与恢复验证

本模块归属 M7/T10。监测不加载 owner/session/operator key，不调用交易广播；只读取配置范围内的状态和签名检查点，将告警及恢复记录保存在单独 SQLite 中。它是本机运维工具，不是独立见证者或已经部署的常驻监控服务。

## 运行

```sh
cp mandate/operations/monitor.example.json /absolute/private/monitor.json
chmod 600 /absolute/private/monitor.json
# 修改三个数据库绝对路径；仅使用自己批准的网络/钱包/任务范围。
pnpm m7:monitor /absolute/private/monitor.json artifacts/monitor-report.json
```

示例固定为已验收的 Base Sepolia 历史订单，用于读取和对账，不能创建新采购权限。当前该钱包现金为零，历史授权已到期/耗尽。新任务需要更新 scope、stepId、deadline 与可信检查点；目录发现、配置修改及运行监测都不会自动授权付款。首次运行无需额外服务、资金、常驻进程或浏览器登录。

配置和输入 DB 应为当前用户拥有的普通 0600 文件，程序拒绝 group/world 可访问文件和符号链接；现有 WAL/SHM 也检查访问权限。状态 DB 必须与采购/证据 DB 分离。输入数据库通过只读连接与读事务取得一致快照。应用层只接收选定状态列及检查点头，不选择或输出付款 payload、raw 事务、服务 result body 或 Merkle 私有 leaves；SQLite 仍有读取输入 DB 的权限，这不是进程隔离。输出不会覆盖配置或任何输入数据库。

退出码 0 表示命令完成且没有 critical/incomplete 来源，并不表示没有 warning；2 表示 critical 告警或来源未完整核查；1 表示启动/配置/输出错误。stdout 仅有计数，stderr 使用固定错误码，不打印 JSON 解析片段或 RPC 异常正文。输出以 0600 临时文件原子替换。

## 覆盖与处理

- 网络：两个公开 RPC 在共同 finalized 高度核对固定 runtime、owner、asset 和 domain，记录 USDC 现金、root/grant 预算及占用。状态分歧/超时记为来源不明，保留之前告警，不能将未确认结果标为已恢复。
- 订单：业务键绑定 chain/wallet/root/step，分开观察 payment/service/result。pending 年龄优先取连续未解决状态的 audit 起点，无 audit 时明确采用创建时间作为保守起点；重复对账不会用 updatedAt 重置年龄。nonce 已使用但无付款证据、已付款未交付、结果未验证各自报警。
- 预期任务：deadline 后没有订单或没有完成三组结果分别报警，不根据付款推断服务完成。
- 检查点：核对 scope、ECDSA 签名、序号、前根、版本/epoch 和时间。超过 deadline 缺少指定 kind 时报警；与配置 trustedHead 或本机之前保留的头不符时报告删除/回滚/fork。未来时间或损坏历史不更新保留头。
- 告警：相同问题更新 lastAt，保持原 firstAt 且不重复增加 event；实际恢复记录 resolved，再出现记录 reopened。配置外的旧任务不导出。

RPC 或 HTTP 状态不明时，先对账原订单/hash；不要自动换 nonce、重新签名或把保守占用释放。链重组恢复沿用原始签名事务和支付 nonce，保留旧证据前缀，追加新 canonical 登记/付款/服务观察。监测本身不执行这些写操作。

## 证据与限制

`pnpm m7:test`包含真实 OS worker 退出/竞争、真实本地 RPC 连接故障、nonce 被其他交易占用、实际 Anvil 链重组，以及存储/日志/告警/检查点测试。原始数据位于 artifacts/m7/operations/；版本和验收见 planning/M7_OPERATIONS_ACCEPTANCE.zh-CN.md。

本机管理员仍能更改数据库或停止监测。没有预先固定的可信头时，首次观察之前被删除的尾部可能不可见；本机旧头不是独立外部留存。HTTP 交付状态是本机记录，不能由网络快照或 session 签名升级为 HTTPS 来源证明。报告给出 coverage 与这些限制，不把单次巡检称为完整审计或一般安全证明。
