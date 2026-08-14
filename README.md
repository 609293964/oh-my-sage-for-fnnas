# Mijia Geek AI

> 米家自动化极客版 AI Agent - 用自然语言创建和管理复杂的米家极客版自动化规则

[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![Vercel AI SDK](https://img.shields.io/badge/Vercel%20AI%20SDK-3-purple)](https://sdk.vercel.ai/)

Mijia Geek AI 是一个 Web 界面的工具驱动 AI Agent，通过自然语言对话帮助你连接小米中枢网关、查看设备、创建和管理米家自动化极客版规则。可通过手机抓包，在网页端直接填入验证码或自动解析请求获取验证码，实现免手机登录。

---

## 核心特性

- **Web 交互** - 浏览器可视化查看设备、规则、变量和对话。
- **Agent 循环** - 持续思考-行动，支持多方案建议和操作确认。
- **工具驱动** - 设备控制与规则管理均通过 Web Agent 工具调用实现，免 MCP。
- **设备能力预检** - 根据真实 MIOT Spec 校验设备属性、动作参数和规则引用。
- **变量生命周期** - 支持创建、读取、赋值和安全删除全局变量及规则变量。
- **规则安全保护** - 创建和更新前执行结构、设备能力及变量引用校验。
- **便捷登录** - 支持上传 HAR/Stream 抓包文件，自动获取并持久化登录码。
- **fnOS Native 支持** - Next.js standalone 服务集成进 FPK 应用包布局。

---

## 界面预览

![图1](./docs/images/1.png)
![图2](./docs/images/2.png)
![图3](./docs/images/3.png)
![图4](./docs/images/4.png)

---

## 在 fnOS 上安装和使用

1. **环境准备**：在 fnOS 应用中心安装 **Node.js v22**。准备 OpenAI 兼容的 LLM 接口及小米中枢网关的局域网 IP。
2. **安装应用**：安装 `fnnas.mijia-geek-ai.fpk`。配置 LLM 地址（如以 `/v1` 结尾）、API Key、模型名称、应用端口和网关 IP。
3. **连接网关**：打开应用 Web 页面，输入 6 位登录码；也可上传抓包文件自动获取验证码。
4. **开始使用**：连接成功后，在聊天框中用自然语言查询设备和变量，或管理、创建极客版自动化规则。

若提示 `Node.js runtime not found`，请在应用中心重新安装 Node.js v22 并重启本应用。

---

## 开发与验证

```bash
npm install
npm run test:unit
npm run build
npm run prepare:fpk
```

`prepare:fpk` 会把 Next.js standalone 构建产物整理到 fnOS Native 应用包目录。完整打包需要安装 `fnpack`，然后运行 `npm run build:fpk`。

---

## 项目结构

- `.agents/skills/` - 自动化规则、变量及模式知识库
- `fnnas.mijia-geek-ai/` - fnOS Native 应用包配置
- `scripts/` - FPK 构建准备脚本
- `src/app/` - Next.js App Router 与 Web API
- `src/components/` - Web 界面及验证码自动获取模块
- `src/core/` - 网关客户端、设备、变量和规则核心工具
- `src/server/` - Web Agent、模型、会话和 Skill 加载逻辑
- `tests/` - 核心与 Web 端单元测试
- `docs/`、`ref/` - 项目文档、预览图和米家网关参考资料

## License

MIT License - 详见 [LICENSE](LICENSE) 文件。
