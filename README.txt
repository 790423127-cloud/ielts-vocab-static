静态网站使用说明

1. 解压 static-site.zip。
2. 把里面所有文件上传到 GitHub Pages 仓库。
3. GitHub Pages 打开 index.html 即可使用。
4. 这个静态版不接 DeepSeek、不接 Edge TTS、不需要 .env.local。
5. 云同步使用腾讯云 CloudBase，只同步学习进度，不上传音频和词库。
5. 如果要更新词库：回到本地工作台补全内容和音频，再重新导出静态网站。

文件说明：
index.html          静态网页入口
assets/style.css    样式
assets/app.js       学习逻辑
sw.js               离线缓存和音频缓存
manifest.webmanifest 主屏幕 App 配置
sync-config.js      CloudBase 云同步配置
data/words.json     词库数据
audio/*.mp3         本地音频缓存
