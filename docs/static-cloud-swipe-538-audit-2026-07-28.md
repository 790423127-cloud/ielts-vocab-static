# 静态云主刷词滑动体验审计（538 对照版）

## 审计对象

- 用户实际入口：腾讯云静态网站 `index.html` 主词库刷词页。
- 对照入口：同一静态包中的 `ielts-538.html` 与 `assets/ielts-538.js`。
- 真实发布链路：`POST/GET /api/export-static` → 最终 `static-site.zip`。
- 不包含正式 Next.js 主刷词页、拼写页和阅读生词栏。

## v3 仍不理想的原因

1. v3 在支持 Pointer Events 的手机上只使用 Pointer 分支，538 的 Touch 分支不会执行。
2. 手机浏览器或 WebView 在滚动竞争时可能发送 `pointercancel`，导致一次已开始的手势没有结束切词。
3. v3 参数为 36px、1400ms、横纵比 1.08，比 538 明显更敏感，容易将轻微斜滑识别为切词，体验不稳定。
4. v3 在移动过程中提前取消纵向手势，判断链比 538 更复杂。
5. v3 的滑动范围只绑定 `#swipeArea`；538 绑定整个学习卡片，用户在卡片下部滑动也能切换。
6. 之前浏览器测试模拟 PointerEvent，只证明 Pointer 代码可以运行，没有验证用户实际喜欢的 538 Touch 手势。

## 538 的实际手势合同

- `touchstart` 只记录单指起点。
- `touchend` 一次性判断，不在移动阶段抢占滚动。
- 有效距离：至少 56px。
- 最长时间：900ms。
- 横向距离必须大于纵向距离的 1.35 倍。
- 只有识别为有效横滑后才 `preventDefault()`。
- 按钮、链接、输入框、下拉框及可点击卡片不触发切词。
- 学习卡片使用 `touch-action: pan-y`，上下滚动交给浏览器。

## 本次修复

- 主静态页采用与 538 相同的 Touch 优先参数和判断顺序。
- 有触摸能力的设备不再先走 Pointer 分支。
- 无触摸能力但支持 Pointer Events 的设备保留非鼠标 Pointer 回退。
- 将主学习内容包装为 `#staticStudyCard`，滑动范围覆盖单词、例句、变形、词族和搭配区域。
- 有效交互控件继续排除，避免点击发音、收藏、分类时误切。
- 最终 ZIP 版本升级为 `20260728_static_mobile_swipe_538_v4`。
- `build-info.json` 标记 `swipeEngine: touch-538-v4` 与 `swipeReference: ielts-538`。

## 验证标准

1. 调用真实 `/api/export-static?audio=0`。
2. 解压真实返回的 ZIP。
3. 手机尺寸 Chromium 打开最终 `index.html`。
4. 用 TouchEvent 左滑：`alpha` 变为 `beta`。
5. 用 TouchEvent 右滑：`beta` 回到 `alpha`。
6. 纵向滑动不切词。
7. 从收藏按钮开始横滑不切词。
8. 页面无 JavaScript 错误。
9. 页面显示 `静态版本 20260728_static_mobile_swipe_538_v4`。

## 部署识别

腾讯云重新部署后，页面右下角和同目录 `build-info.json` 必须显示版本：

`20260728_static_mobile_swipe_538_v4`

没有该版本，说明线上仍是旧 ZIP、旧目录、CDN 缓存或 Service Worker 缓存。
