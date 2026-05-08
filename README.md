# Mijia Geek AI

> 米家自动化极客版 AI Agent - 用自然语言创建和管理复杂的米家极客版自动化规则

[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![Vercel AI SDK](https://img.shields.io/badge/Vercel%20AI%20SDK-3-purple)](https://sdk.vercel.ai/)

Mijia Geek AI 是一个 Web 界面的工具驱动 AI Agent，通过自然语言对话帮助你连接小米中枢网关、查看设备、创建和管理米家自动化极客版规则。无需手机抓包，支持在网页端直接填入验证码或自动解析请求获取验证码，实现免手机登录。

---

## 核心特性

- **Web 交互** - 浏览器可视化查看设备、规则和对话。
- **Agent 循环** - 持续思考-行动，支持多方案建议和操作确认。
- **工具驱动** - 设备控制与规则管理均通过工具调用实现，免 MCP。
- **便捷登录** - 支持上传 HAR/Stream 抓包文件自动获取并持久化登录码。
- **fnOS Native 支持** - Next.js standalone 服务完美集成进 FPK 包布局。

---

## 在 fnOS 上安装和使用

1. **环境准备**：在 fnOS 应用中心安装 **Node.js v22**。准备 OpenAI 兼容的 LLM 接口及小米中枢网关的局域网 IP。
2. **安装应用**：安装 `fnnas.mijia-geek-ai.fpk`。配置 LLM 地址（如 `/v1` 结尾）、API Key、模型名称、应用端口和网关 IP。
3. **连接网关**：打开应用 Web 页面，输入 6 位登录码。也支持上传抓包文件自动获取验证码。
4. **开始使用**：连接成功后，在聊天框中用自然语言指令查询设备、管理或创建极客版自动化规则。

*常见问题*：若提示 `Node.js runtime not found`，请在应用中心重新安装 Node.js v22 并重启本应用。

---

## 项目结构

- `.agents/skills/` - 自动化规则等 Agent Skills 规范
- `fnnas.mijia-geek-ai/` - fnOS Native 应用包配置
- `src/` - Next.js App Router, React 组件与后端 Agent 核心代码
- `docs/` & `ref/` - 项目文档、预览图及米家网关参考资料

## License

MIT License - 详见 [LICENSE](LICENSE) 文件
