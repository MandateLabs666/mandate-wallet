# TLSNotary 公开 HTTPS 可复现实验

上游为 [TLSNotary v0.1.0-alpha.15](https://github.com/tlsnotary/tlsn/tree/v0.1.0-alpha.15)，四个文件改编自 crates/examples/basic/basic.rs 和 attestation/{prove,present,verify}.rs。保留上游 MIT OR Apache-2.0 许可与作者归属；[上游许可声明](https://github.com/tlsnotary/tlsn/blob/v0.1.0-alpha.15/README.md#license)适用于这些衍生文件。源码包、Cargo.lock 及改编文件的 SHA-256 在 source.json。没有复制上游的实验私钥。

请求无认证的 https://api.github.com/rate_limit。Prover 与 notary 通过 MPC-TLS 合作取得真实 TLS 1.2 会话；使用 Mozilla 根证书，公开呈现本次响应，再在另一进程验证证书/域名、transcript 和外部固定的 notary 公钥。运行者需要信任 notary；本实验的两个逻辑角色处于同一宿主，不提供管理隔离。[官方 FAQ](https://tlsnotary.org/docs/faq/)及[快速开始](https://tlsnotary.org/docs/quick_start/)解释协议与工具前提。

需要 Python 3.12+、Docker、互联网。首次构建最多使用 2 CPU/4 GiB；不运行区块链同步节点。Rust 1.90 的实际失败记录保留，锁定依赖需要 Rust 1.95。本轮使用镜像 digest sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1。

```sh
python3 scripts/m5-tlsnotary-bootstrap.py
docker run --rm --cpus=2 --memory=4g --pids-limit=256 \
  --mount type=bind,src="$PWD/.runtime/m5/tlsnotary/tlsn-0.1.0-alpha.15",dst=/work \
  --workdir /work \
  rust:1.95.0-bookworm@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1 \
  cargo build --locked --release -p tlsn-examples --example mandate_public \
  --example mandate_prove --example mandate_present --example mandate_verify
python3 scripts/m5-tlsnotary-run.py
```

网络失败会停止实验。重新执行会产生新的证明/时间与公共报告，先保留要比较的旧证据；它不新增任何付款。私钥、attestation secrets 和原始运行文件只保存在忽略的 .runtime。公开产物只有 presentation、公钥、退出码/耗时和本次公开响应日志。上游示例中的 SECRET 是固定演示字符串，不是钱包或 notary 私钥。

结果见 artifacts/m5/https/tlsnotary-evaluation.json：证明生成 1.876 秒、呈现 0.230 秒、独立文件验证 0.235 秒，presentation 15,583 字节。改错期望域名、篡改响应一个字节、改错固定公钥均被拒绝。这是单次公开 API 实验，不代表生产吞吐或商户服务 SLA。

首版保留可选研究示例。受控付款商户仍是回环 HTTP，不能借此升级其 HTTPS 来源等级；把该机制纳入付款路径前，还需独立管理的 notary、信任/密钥轮换和服务端 TLS 兼容性验收。
