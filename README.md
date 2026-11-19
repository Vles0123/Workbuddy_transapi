# Workbuddy_transapi

把 **Docker API 转发**与 **WorkDaddy 多账号备份**连接起来：本机同步已登录账号，容器提供 OpenAI Chat Completions 兼容接口，遇到明确的积分耗尽结果时尝试另一个已授权账号。

本项目是独立的本地集成工具，非腾讯、WorkBuddy、WorkDaddy 或 DeepSeek 官方产品。仅接入你本人拥有或获准使用的账号；不会提供账号、积分或登录凭据。不是 WorkDaddy 的完整替代品，也不包含其桌面应用。

## 来源与致谢

- [babygoton/WorkDaddy](https://github.com/babygoton/WorkDaddy)：本机多账号独立备份与托管工具。本项目读取它保存的账号备份，不复制或重新打包其应用代码。
- [dsh-workbuddy-connect@0.7.8](https://www.npmjs.com/package/dsh-workbuddy-connect)：公开 npm 适配依赖，作者 corrinehu，MIT 许可；本项目复用其公开导出的登录态读取、刷新、请求转换及上游客户端。
- npm 包标注的原始仓库为 [corrinehu/dsh-workbuddy-connect](https://github.com/corrinehu/dsh-workbuddy-connect)。发布核查时该公开地址返回 404；来源以固定版本 npm 包元数据及包内许可证为依据，没有将其他分支冒认为原作。
- [WorkBuddy 官方客户端](https://www.workbuddy.cn/)：由用户自行安装并完成登录。

Docker 编排、本机凭据同步、API 包装与账号池调度是在已有本地集成脚本上整理形成的。完整出处与上游许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 组成

```text
WorkBuddy / WorkDaddy 已登录账号（macOS）
          │ 本机读取/解密，每 30 秒同步
          ▼
runtime/accounts/*.info（本机私有，容器只读挂载）
          │
          ▼
Docker：API + 账号池 + 上游适配器
          └─ http://127.0.0.1:3081/v1
```

所有账号与刷新缓存保留在用户本机。macOS 加密凭据的读取依赖本机 WorkBuddy，不能仅把加密备份放入 Linux 容器期待自动解密。宿主同步程序直接使用本项目的 npm 依赖，不依赖作者电脑的其他项目目录。

## 快速开始（macOS）

需要 Node.js 22+、Docker Desktop、已安装并登录的 WorkBuddy。通过 WorkDaddy 保存要使用的账号；默认备份目录为 `~/Library/Application Support/WorkDaddy/accounts`。

```bash
git clone https://github.com/Vles0123/Workbuddy_transapi.git
cd Workbuddy_transapi
chmod +x start.command stop.command
npm ci --ignore-scripts
npm run init
npm run sync -- --once
docker compose up -d --build
```

同步需持续运行才能发现新增、删除或更新的账号。另开终端运行 `npm run sync`，或在 macOS 使用 `npm run sync:install` 安装当前用户的登录启动项。后者会在 `~/Library/LaunchAgents` 写入本项目自己的同步配置，移动项目或更换 Node.js 路径后需重新安装。用 `npm run sync:stop` 停止同步。`WORKDADDY_ACCOUNTS_DIR` 可以覆盖备份目录，`WORKBUDDY_ELECTRON_BIN` 可以指定 WorkBuddy 可执行文件；使用环境覆盖时建议以前台方式同步。

也可双击 `start.command`：安装本地依赖、初始化私有运行目录、同步一次、安装同步启动项，再启动 Docker。`stop.command` 停止容器和同步。脚本不会迁移或覆盖其他项目的数据。如果本机已有服务占用 3081，请在 `.env` 中配置 `TRANSAPI_PORT=3082`，并相应修改调用地址。

## 调用接口

- Base URL：`http://127.0.0.1:3081/v1`
- API Key：首次初始化时随机生成，只保存在 `runtime/data/api-key`。需要时自行在本机读取，勿粘贴到 Issue 或截图中。
- 所有路由都要求 `Authorization: Bearer <你的本机密钥>`，包括 `/healthz`。
- `GET /v1/models`：以当前账号返回的模型 ID 为准，不承诺某个模型或优惠长期有效。
- `POST /v1/chat/completions`：支持 SSE 流式回复、非流式 JSON 聚合及工具调用。
- `GET /healthz`：只检查本地 HTTP 服务可响应，**不代表账号、余额或上游模型一定可用**。

```bash
export TRANSAPI_KEY="$(cat runtime/data/api-key)"
curl http://127.0.0.1:3081/v1/models \
  -H "Authorization: Bearer $TRANSAPI_KEY"
# MODEL_ID 从上面的模型列表中选择
curl http://127.0.0.1:3081/v1/chat/completions \
  -H "Authorization: Bearer $TRANSAPI_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"MODEL_ID","messages":[{"role":"user","content":"你好"}],"stream":true}'
unset TRANSAPI_KEY
```

其他 Docker 容器在 Docker Desktop 上可使用 `http://host.docker.internal:3081/v1`。服务默认只发布到宿主机回环地址，并校验 Host、Origin 与本地 API Key，没有把 API 开到公网。

## 账号池规则

- 动态读取保存的账号，去重并跳过身份不匹配、无法读取或无法刷新登录的条目。
- 只有适配器明确返回 `hard_credit`，且尚未向调用者开始输出，才尝试下一个账号；同一请求每个身份最多尝试一次。
- 耗尽的账号冷却 15 分钟；状态保存在内存中，重启会清除。成功后优先使用该账号。
- 限流、认证错误、普通上游错误和网络异常不会触发基于错误的自动换号。
- 流式响应一旦开始交付，后续流中断或流内错误不会重新发送请求，避免重复执行工具或重复计费。
- 全部账号不可用或额度耗尽时返回 402。不会绕过上游的额度或权限检查；账号池不是增加单个账号额度的办法。

## 运行与数据

```bash
docker compose ps
docker compose logs --tail 50
docker compose stop
```

`runtime/` 中包含账号登录态、刷新令牌、API Key 与本机同步日志，**不要提交、上传或分享整个目录**。同步账号文件权限为 0600，私有运行目录为 0700；容器只读挂载账号导出目录，刷新副本写入独立私有数据目录。同步程序读取本机登录态和备份，不替你在桌面客户端切号或搬迁会话。此发行版主要验证 macOS + Docker Desktop；Linux/Windows 的桌面凭据解密与同步未验证。

`.gitignore` 排除运行数据、账号备份、`.env` 和依赖目录；`.dockerignore` 使用源码白名单，镜像构建上下文不包含运行凭据。新仓库从干净源码开始，不继承本机运行数据历史。

## 验证与密钥检查

```bash
npm test
python3 scripts/check-secrets.py
# 可选：在本机内存中将已知运行凭据与可发布源码/历史比对，不打印密钥
python3 scripts/check-secrets.py --private-source /path/to/your/private/runtime
```

测试以模拟账号验证耗尽切换、冷却恢复、重复身份、取消及流中断不重放；不通过耗光真实账号积分来验证切换。密钥扫描覆盖常见令牌格式、硬编码凭据、本机用户路径和 Git 历史；可选的精确比对覆盖指定本地运行目录的凭据。扫描没有发现不等于能够证明所有历史地点或外部平台从未发生泄露。

许可证：[MIT](LICENSE)。上游依赖分别遵守其自身许可证。
