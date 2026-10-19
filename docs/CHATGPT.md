# 在 ChatGPT 继续学习

## 可以立即使用：复制或上传

1. 页伴中打开「连接 ChatGPT」。
2. 点「复制本页记录」，在已登录的 ChatGPT 对话中粘贴；或下载整份 `.md` 并上传到 ChatGPT。
3. 问“根据我之前这页的问题，帮我复习薄弱点”。

复制和上传需要你操作；它们不是自动同步。局域网 HTTP 无法使用剪贴板时，页伴会下载文本文件供你复制或上传。

## 按需读取：MCP 插件

本项目提供两个只读工具：

| 工具 | 用途 |
| --- | --- |
| `list_study_documents` | 返回文件 ID、名称、页数和更新时间 |
| `read_study_notes` | 按文件/页读取课件文字、问答和批注文字 |

这条通路让 ChatGPT 读取页伴数据库的最新内容，**不会把页伴的每一条对话自动插入 ChatGPT 聊天列表**。ChatGPT 中产生的新回答也不会回写页伴。你可以复制回页伴作为批注。

### 本地连接（推荐）

官方当前支持以 Secure MCP Tunnel 连接私有 MCP 服务；账号或工作区是否允许添加自定义服务，以你实际设置页为准。

1. 保留页伴服务和本机数据库。
2. 按 [官方 Secure MCP Tunnel 文档](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) 在 Platform 设置中创建 tunnel 并关联目标 ChatGPT 工作区，再下载官方 `tunnel-client`。客户端需要运行时 API Key；组织管理员需要授予对应的 Tunnels Read / Use 权限，创建隧道还需要 Manage。密钥只在本地环境中配置，不要粘贴到聊天、命令参数或项目源文件。
3. 将隧道连接到项目的 stdio MCP 服务。等价本机启动命令为：

```powershell
cd D:\小巧思\pagemate
npm run mcp
```

为了避免 npm 的启动提示混入 MCP 标准输出，隧道配置中建议直接指定可执行文件与参数：

```json
{
  "command": "node",
  "args": [
    "--import",
    "tsx",
    "D:/小巧思/pagemate/server/mcp.ts"
  ],
  "cwd": "D:/小巧思/pagemate",
  "env": { "DATA_DIR": "D:/小巧思/pagemate/data" }
}
```

这段是服务的启动参数示例，不冒充隧道客户端的完整配置结构；按官方客户端当前的配置界面填写。

4. 在 ChatGPT「Plugins / 插件」中选择添加自定义 MCP 服务，按官方步骤选择 Tunnel 并绑定你的隧道。
5. 安装后在新对话中选中页伴插件，问：“列出我的页伴学习文件”，然后“读取《学习与记忆》第 3 页的讲解和批注，继续考考我”。

本机已用真实 MCP SDK 客户端验证初始化、工具发现和读取数据库。**没有替你登录或绑定 ChatGPT 账号**。

### HTTP 接口（有部署经验时使用）

项目同时提供无状态 Streamable HTTP 的 `POST /mcp`。

- 必须发送 `Authorization: Bearer <STUDY_ACCESS_TOKEN 或 data/access-token>`。
- 不接受 URL 查询字符串中的密钥。
- 初始化和工具调用都需要合法 `Accept: application/json, text/event-stream`。
- 普通浏览器阅读使用会话 Cookie；MCP 使用独立的 Bearer 校验。
- 该版本**没有实现 OAuth 授权服务器**。当 ChatGPT 的添加服务界面不支持你的认证方式时，请使用本地 stdio + Secure MCP Tunnel；不要移除鉴权后公开学习库。
- 直接公开部署时需要可信 HTTPS、符合账号政策的鉴权与防护；项目不自动配置这些基础设施。

## 官方资料与限制

- [连接和测试 ChatGPT 插件](https://developers.openai.com/plugins/deploy/connect-chatgpt)：公网 HTTPS 或 Secure MCP Tunnel、添加服务和工作区策略。
- [ChatGPT 插件快速入门](https://developers.openai.com/plugins/quickstart)：个人插件和工具调用。
- [Responses 流式输出](https://developers.openai.com/api/docs/guides/streaming-responses)：本项目的实时文字讲解。
- [API 对话状态](https://developers.openai.com/api/docs/guides/conversation-state)：API 对话状态。不能据此把 API 对话等同于 ChatGPT 账号历史。

文档核对日期：2026-10-19。账号权限、界面名称和隧道配置请以实际官方文档为准。
