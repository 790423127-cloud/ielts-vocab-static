# 静态云刷词页深度审计（2026-07-28）

## 审计对象

- 用户实际入口：腾讯云静态网站主刷词页。
- 最终文件：`index.html`、`assets/app.js`、`assets/style.css`、`sw.js`、`data/words.json`。
- 真实生成入口：`POST/GET /api/export-static`。
- 不包含 Next.js 正式刷词页、拼写页和阅读生词栏。

## 连续五次没有解决的原因

1. 最早的修改落在正式网站或拼写训练，不是静态主刷词页。
2. 后来的修复只存在于 ZIP 后处理器，真实生成器仍保留旧触摸代码。
3. 后处理器先前没有接入下载链路，之后又通过 rewrite 和第二个 Route Handler 间接接入，存在绕过原始响应的风险。
4. 后处理器匹配失败时会把控制器追加到文件末尾；追加位置不保证仍处于 `els` 和 `step` 的有效作用域，但导出不会失败。
5. 测试使用人工拼接 ZIP 和字符串断言，没有调用真实 `/api/export-static`，也没有打开最终 `index.html` 做手机手势测试。
6. 腾讯云页面没有可见版本号，无法区分代码未进入 ZIP、ZIP 未部署、CDN 或 Service Worker 仍缓存旧文件。

## 本次根因修复

- `/api/export-static` 直接修补并校验最终 ZIP，不再依赖 rewrite 或第二个导出路由。
- 找不到真实旧触摸代码时停止导出，不再静默生成未经验证的包。
- 同时支持 Pointer Events 和旧 WebView 的 Touch Events 回退。
- 在 `window` 上完成手势，手指滑出卡片后仍能结束切换。
- 保留上下滚动；按钮、链接和输入框不触发换词。
- 最终 ZIP 强制校验 JS、CSS、HTML、Service Worker 和版本文件。
- 页面右下角显示静态版本，并增加 `build-info.json`。

## 验证标准

1. 调用真实 `POST /api/export-static?audio=0`。
2. 解包真实返回的 ZIP。
3. 手机尺寸 Chromium 打开解包后的真实 `index.html`。
4. 左滑：alpha 变为 beta；右滑：beta 回到 alpha。
5. 浏览器无 JavaScript 页面错误。

## 腾讯云部署识别

部署后页面右下角必须显示：

`静态版本 20260728_static_mobile_swipe_v3`

同目录 `build-info.json` 应显示相同版本。没有该版本就说明腾讯云仍在提供旧目录或旧缓存。
