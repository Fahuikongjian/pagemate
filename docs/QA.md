# 验证记录

日期：2026-10-19。环境：Windows、Node.js 24.14、已安装 PowerPoint；浏览器检查通过 Codex 浏览器控制执行。

## 已通过

- TypeScript 检查与 Vite 正式构建。
- `npm test` 12 项：SQLite 重启后保存与页面隔离；PDF 导入和旋转页面尺寸；标准 PDF 中文评论导出；会话鉴权和跨站写入阻断；流式讲解上下文与图片；工具调用保存批注、停止生成与同页并发保护；错误 Key 路径；批注校验和删除；Markdown 导出；MCP HTTP 初始化鉴权；真实 MCP stdio 工具读取；真实 PPTX → PowerPoint → PDF。（部分检查组合在同一测试中。）
- `npm audit`：0 个漏洞。
- 从浏览器选择真实 `two-slides.pptx`，转换后两页可显示、可提取文字。
- 浏览器拖动框选曲线，引用区显示框内文字与图片选区；拖动选择标题，提问区显示原文。
- 保存中文文字批注、选中文字高亮、保存手写笔迹。切页后当前页批注数量独立；刷新后批注仍保留。
- 浏览器实际下载带批注 PDF；用独立 PDF 工具重新打开，核对页数、标准 `/Text` 评论的完整中文 Contents；Poppler 渲染确认高亮位置与文字可读。
- 响应式检查：1440×900 Windows；1280×800 平板横屏；800×1280 平板竖屏；390×844 手机；375 像素窄屏。竖屏使用全宽阅读/提问切换，横屏并排布局。
- 未配置 API Key 时提问会显示配置入口，不生成伪造的 GPT 回答。

## 实际限制

- 当前没有 OpenAI API Key。GPT 自动化测试用独立本地模拟服务验证真实 Responses SSE 处理，不代表已经测试真实模型的网络可用性或回答质量。
- MCP 服务已通过真实 SDK 客户端协议测试；尚未在用户 ChatGPT 账号绑定。是否能添加插件或使用 Secure MCP Tunnel 取决于账号与工作区权限。
- 没有实机安卓设备会话：系统触控笔、朗读语音包、HTTPS 后的安装流程需在用户平板上验收。
- 本地测试了 PowerPoint 转换；没有在本机安装 LibreOffice，Linux/LibreOffice 分支尚未实测。
- PWA 是可安装网页应用；没有提供 APK / EXE，也没有自动部署到公网。HTTP 局域网不保证浏览器开放 PWA 安装与剪贴板。

截图保存在 `docs/screenshots/`。`annotated.pdf` 与 `annotated-page.png` 是导出检查样本，不包含真实 GPT 回答。
