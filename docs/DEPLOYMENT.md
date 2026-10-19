# 部署与安卓安装

## 本机 + 同一网络平板

双击 `启动页伴.cmd`，在本机设置中查看地址和连接码。默认监听 `0.0.0.0:3210`，API 有会话鉴权。Windows 防火墙是否允许平板访问，需要按自己的私有网络设置。

电脑关机或休眠后，平板无法访问。单个用户设备共用同一学习库。数据持久化在项目 `data/` 目录。

## HTTPS 自托管

要让安卓 Chrome / Edge 稳定提供“安装应用”入口，需要可信 HTTPS。可以部署在自己可访问的服务器，或使用自己的私有网络 HTTPS 服务。项目不会自动公开你的服务。

服务器要求 Node.js 24 LTS、持久磁盘；Linux 需要安装 LibreOffice 才能导入 PPT。转换不适合无持久磁盘的静态站点托管。

```sh
npm ci
npm run build
# 配置 .env
npm start
```

反向代理示例（Caddy）：

```text
study.example.com {
  reverse_proxy 127.0.0.1:3210
}
```

相应 `.env` 配置：

```dotenv
HOST=127.0.0.1
PORT=3210
PUBLIC_ORIGIN=https://study.example.com
OPENAI_API_KEY=填写你的密钥
OPENAI_MODEL=gpt-4.1-mini
STUDY_ACCESS_TOKEN=至少32位的随机字符串
```

代码不信任任意代理头；`PUBLIC_ORIGIN` 用于 HTTPS 反向代理时的来源校验。代理必须关闭 SSE 缓冲，保留长连接；Nginx 需对讲解路由设置 `proxy_buffering off` 与足够长的读取超时。会话使用 SameSite=Strict、HttpOnly Cookie；当 `PUBLIC_ORIGIN` 为 HTTPS 时，远程配对会话也设置 Secure 属性。

项目是单人学习工具，不包含账号系统、OAuth 服务器、公共租户隔离、自动证书管理或公网运维措施。公网长期部署请配置对应的访问控制和备份。仅托管前端静态文件不能完成 GPT 讲解与 PPT 转换。

## PWA 能力边界

- 提供应用 manifest 和正式构建的 Service Worker。
- 缓存应用外壳，API、课件、学习记录不缓存。
- HTTPS 下可由浏览器安装；没有生成独立 APK / EXE。
- 普通 HTTP 局域网能学习，但安装、系统剪贴板和某些语音功能依浏览器限制。
- 安卓真机上的安装、触控笔、语音包仍需在实际设备验收。

## 停止、更新、备份

启动器保留命令行窗口显示服务状态；学习时保持窗口开启，按 Ctrl+C 可停止。也可运行项目中的 `停止页伴.ps1`，它只停止启动器记录且验证为页伴的 Node 进程。

更新前停止服务并备份 `data/`。然后更新源文件、运行 `npm ci` 与 `npm run build`、重新启动。备份 SQLite 时复制整个 `data/`；仅复制运行中的 `.db` 而漏掉 WAL 可能丢失最新数据。
