# Mijia Geek AI 开发 Agent 规范

本文件适用于整个仓库。子目录可以用更具体的 `AGENTS.md` 补充约束；若规则冲突，以离目标文件最近的规范为准。除非用户明确扩大范围，否则所有 Agent 都必须遵守本文件。

## 1. 项目定位

本项目是运行在飞牛 fnOS 上的 Native FPK 应用，不是仅面向 Vercel、Docker 或普通桌面环境的 Next.js 示例项目。

- Web 应用：Next.js 14 App Router、React 18、TypeScript strict。
- 运行方式：Next.js `standalone` 服务，由 fnOS 系统的 `nodejs_v22` 启动。
- 当前包名：`fnnas.mijia-geek-ai`；当前目标平台：`x86`。
- 核心能力：连接局域网内的米家中枢网关，通过 Web Agent 查询设备并管理极客版自动化规则和变量。
- 打包入口：`npm run build:fpk`。

任何实现都应优先保证：fnOS 可安装、可启动、可配置、可升级、可停止，并且不会泄露用户凭据或误操作真实设备。

## 2. 开始工作前

1. 阅读 `README.md`、`package.json` 和与任务相关的文档或现有实现，不凭印象猜测项目结构。
2. 先执行 `git status --short`。工作区可能包含用户尚未提交的修改；不得覆盖、回滚、格式化或删除无关改动。
3. 搜索现有实现、测试和命名后再新增代码，避免创建重复工具或第二套协议模型。
4. 只修改完成当前请求所必需的文件。发现相邻问题时可以说明，但不要擅自扩大重构范围。
5. 需求不明确但不同选择会明显影响数据安全、兼容性或用户行为时，先向用户确认。

## 3. 不可越过的安全边界

### 3.1 凭据和隐私

- 不得读取、展示、记录、提交或上传真实的 `.env`、API Key、米家登录码、Cookie、Token、HAR 抓包内容、会话文件、设备 DID、家庭信息或内网地址。
- 示例配置只能使用明显的占位值；`.env.example` 和 `fnnas.mijia-geek-ai/config/*.example` 中不得出现可用凭据。
- 日志、异常、API 响应和测试快照必须脱敏。禁止记录完整 Authorization 头、LLM Key、登录码或原始抓包。
- 服务端凭据只能留在服务端。不得通过 Client Component、浏览器 bundle、HTML、公开 API 或前端状态返回 `LLM_API_KEY` 等敏感配置。
- 不得为了调试添加遥测、外部上报、第三方分析或向公网服务发送网关数据，除非用户明确要求并知晓数据范围。

### 3.2 真实 NAS、网关和设备

- 默认只进行本地、离线、可重复的开发与测试。不得主动连接用户的 fnOS、米家网关或真实设备。
- 只有用户明确要求实机验证并指定目标后，才可发起真实连接；先说明会进行的操作和可能影响。
- 查询真实设备、规则、变量也可能暴露家庭隐私，未经授权不得执行。
- 控制设备、创建/更新/启停规则、创建/赋值变量属于写操作，必须有用户对本次实机操作的明确授权。
- 删除规则、删除变量、覆盖配置、卸载应用或清除 Session 属于破坏性操作。执行前必须再次核对精确目标，并取得明确确认。
- 不得通过放宽原始 API 写入白名单来绕过专用工具。图规则写入必须保留结构校验、设备能力校验和变量引用校验。
- 不得将“网关接受保存”等同于“自动化运行正确”；连接完整性和运行语义必须由校验器、测试或明确标注的实机证据支持。

### 3.3 仓库和系统

- 禁止使用 `git reset --hard`、强制 checkout、无边界递归删除等命令处理用户文件。
- 不得提交 `.next/`、`node_modules/`、Session、日志、临时目录、真实配置、`.fpk` 或备份包。
- 不得手工修改生成目录 `fnnas.mijia-geek-ai/app/server/`；它由 `npm run prepare:fpk` 重建。
- 不得为了让测试通过而删除测试、跳过校验、吞掉异常、扩大 `any` 使用或降低安全默认值。

## 4. fnOS Native 开发约束

### 4.1 运行目录和权限

- 应用以 fnOS package 用户运行，保持 `fnnas.mijia-geek-ai/config/privilege` 的最小权限原则；不要假设 root 权限。
- 应用代码位于 `${TRIM_APPDEST}`，持久数据位于 `${TRIM_PKGVAR}`，配置位于 `${TRIM_PKGETC}`，临时文件位于 `${TRIM_PKGTMP}`。
- Session 必须继续通过 `SESSION_STORE_DIR=${TRIM_PKGVAR}/sessionstore` 持久化。禁止把运行时数据写进只读应用目录或源码目录。
- 配置文件必须继续通过 `APP_CONFIG_FILE` 指向 `${TRIM_PKGETC}/mijia-geek-ai.env`，并保持仅 package 用户可读的权限。
- 服务必须使用 fnOS 分配的 `${TRIM_SERVICE_PORT}`，仅在变量缺失时回退到 `3010`；不要硬编码开发机端口。
- 服务在 NAS 内需要监听 `0.0.0.0`，但不得因此绕过 fnOS 自身的访问授权机制。
- 不得硬编码 Windows 路径、开发者用户名、NAS 安装路径或特定家庭网段。

### 4.2 生命周期脚本

- `fnnas.mijia-geek-ai/cmd/` 下脚本必须兼容 fnOS 的 Bash/Linux 环境，使用 LF 换行，并保留可执行权限。
- `start`、`stop`、`status`、安装、配置和升级流程应可重复调用，正确处理旧 PID、启动失败和已有配置。
- 停止服务应先发送 `TERM` 并给进程退出时间，仅在必要时使用 `KILL`。
- 安装和升级不得无故覆盖已有密钥、网关配置、Session 或用户数据。
- 配置写入应使用临时文件后原子替换，限制文件权限，并正确转义向导输入；不得直接拼接可执行 Shell 内容。
- 修改 `wizard/`、`cmd/`、`config/` 或 manifest 时，同时检查安装、重新配置、升级、卸载和重启场景。

### 4.3 构建和打包

- 保持 `next.config.js` 的 `output: 'standalone'`，除非同时提供并验证新的 fnOS 启动方案。
- Node.js 运行时基线为 `nodejs_v22`。依赖和语法不得只在开发机环境可用。
- `package.json` 是应用版本的来源；修改版本时同步 `package-lock.json`。`prepare:fpk` 会同步两个 manifest 的版本。
- FPK 内的 `app.tgz` 校验值由 `scripts/pack-fpk.mjs` 生成，不手工伪造 checksum。
- `.next/`、`fnnas.mijia-geek-ai/app/server/` 和根目录 `*.fpk` 都是构建产物，不作为源代码编辑或提交。
- `prepare:fpk` 会把 `.agents/` 一并复制进 standalone 包。修改 Skill 或引用资料时必须确认打包后仍能被服务端 loader 定位。
- Windows 构建兼容代码不得破坏 Linux/fnOS 运行；Linux 权限、路径分隔符、大小写和符号链接行为都要纳入考虑。
- 未在真实 fnOS 上安装验证时，只能表述为“本地构建/打包通过”，不得声称“已在飞牛 NAS 验证”。

未经用户明确要求，不修改以下发布身份或平台字段：

- `appname`
- `platform`
- `maintainer` / `distributor`
- `install_dep_apps`
- 默认 `service_port`
- fnOS privilege/resource 权限

## 5. 代码分层

- `src/core/`：网关协议、类型和业务工具。保持与 React/页面层解耦，并尽量使用可注入、可模拟的依赖。
- `src/server/`：Agent、模型、Session、Skill loader 和服务端适配。不得把服务端凭据或 Node 专用实现泄露给客户端。
- `src/app/api/`：HTTP 边界。校验所有外部输入，返回稳定且脱敏的错误，不信任浏览器提交的数据。
- `src/components/`：客户端交互。不得直接实现网关私有协议或持有服务端密钥。
- `.agents/skills/mijia-automation/`：运行时业务知识，不是随意堆放开发说明的目录。
- `fnnas.mijia-geek-ai/`：FPK 源结构；`app/server/` 除外，它是生成目录。

跨层修改时优先把协议和业务规则放在 `src/core/`，由 API/Agent 共用，避免前后端各写一套校验。

## 6. 米家自动化业务规则

- 涉及规则节点、变量生命周期、网关能力或 Agent 提示词时，先阅读 `.agents/skills/mijia-automation/SKILL.md` 及其索引指向的相关参考文件。
- 不猜测 DID、URN、SIID、PIID、AIID、枚举、范围或网关 API 名称；使用真实 MIOT Spec、已有代码或已记录证据。
- 新增或修改图结构能力时，结构校验、能力校验、Web 工具适配、Agent 提示词和测试必须保持一致。
- 删除变量前必须检查规则引用。已有规则新增本规则变量时必须遵守真实作用域规则。
- 未达到相应证据等级的行为不能写成强制校验；实验性结论要记录来源和限制。
- 对不确定、离线、陈旧状态采取保守行为。不得把查询失败误当作 false 分支或设备已处于安全状态。

## 7. 编码要求

- 遵守 TypeScript strict；优先精确类型、判别联合和类型守卫，不使用无说明的 `any`、非空断言或类型强转掩盖错误。
- 外部输入和配置优先使用现有 Zod 模式校验，并为边界值和错误路径添加测试。
- 保持修改小而清晰。除非任务要求，不做全仓格式化、无关重命名或大规模依赖升级。
- 新依赖必须有明确必要性，并考虑 FPK 体积、Node 22 兼容性、许可证、维护状态和 standalone 打包行为。
- 修改依赖时同时更新并提交 `package.json` 与 `package-lock.json`，不混用 npm、pnpm、yarn 锁文件。
- 网络请求必须设置合理的超时和错误处理；重试应有上限，写操作不得盲目自动重试。
- 用户可见错误使用清楚的中文；内部错误保留足够诊断信息，但必须脱敏。
- 注释解释原因、协议限制或 fnOS 差异，不重复代码表面含义。

## 8. 测试与验证

先运行与改动最相关的测试，再按风险扩大范围。默认使用仓库现有命令，不临时发明绕过脚本。

| 变更类型 | 最低验证 |
|---|---|
| 文档或纯注释 | 检查链接、路径、命令和事实是否与仓库一致 |
| 核心逻辑、API、Agent、Session、Skill loader | 相关测试 + `npm run test:unit` |
| React/UI | 相关测试 + `npm run test:unit` + `npm run build` |
| 依赖、Next 配置或服务端构建 | `npm run test:unit` + `npm run build` |
| `scripts/` 或 FPK 内容 | `npm run test:unit` + `npm run build:fpk` |
| `fnnas.mijia-geek-ai/cmd/`、wizard、manifest、权限或升级流程 | `npm run build:fpk`，并明确报告是否完成真实 fnOS 安装测试 |

补充要求：

- 新功能和 Bug 修复应添加回归测试；优先 mock 网关，不依赖真实家庭设备。
- 校验器修改必须同时覆盖允许和拒绝案例，尤其是变量引用、连接完整性、权限、范围与类型。
- 构建产生的 `.fpk`、`.next/` 和 `app/server/` 不得加入提交。
- 如果因为环境、凭据或设备限制无法完成某项验证，必须如实说明未验证内容和风险，不能把未运行写成通过。

## 9. 文档同步

以下变化必须同步文档或示例：

- 环境变量、默认端口、网关类型或配置方式变化：更新 `.env.example`、FPK 示例配置、wizard 和 `docs/FNNAS_PACKAGING.md`。
- 安装、启动、构建或打包流程变化：更新 `README.md` 和 `docs/FNNAS_PACKAGING.md`。
- 自动化节点、变量或校验行为变化：更新对应 Skill/reference，并注明证据和兼容性边界。
- API 行为变化：更新相关类型、调用方、错误处理和测试。

文档中的命令必须能够从仓库根目录执行。不要把个人机器路径或未验证的 NAS 操作写成通用步骤。

## 10. 完成标准

交付前确认：

1. 修改只覆盖用户请求，没有破坏用户原有改动。
2. 没有新增敏感信息、真实设备标识或构建产物。
3. 相关测试已通过，或已明确列出未运行项目及原因。
4. fnOS 路径、权限、Node 22、standalone 和生命周期约束仍成立。
5. 写操作和破坏性操作没有在未经授权的真实环境执行。
6. 文档、示例、类型、校验器和实现保持一致。
7. 最终说明列出主要改动、验证结果以及仍需在真实 fnOS 上确认的事项。
