# Tetris 产品宣传片

当前版本 V3：28 秒 / 1920×1080 / 30 fps / H.264 + AAC。

- 最新成片：`out/v3/tetris-promo-v3-1080p.mp4`
- 播放页：`out/v3/preview.html`
- 故事板：`out/v3/storyboard.jpg`
- 可编辑独立工程：`out/v3/tetris-v3-source.zip`
- 设计说明：[DESIGN-v3.md](DESIGN-v3.md)
- 第二版资料：[README-v2.md](README-v2.md)

V3 增加多路终端动态输入、日志输出、滚动、测试结果和不同节奏的光标；用 Anime.js 4.5.0 实现帧驱动的错峰入场与缓动。窗口采用细边框、圆角和轻阴影，增加聚焦描边、曲线路径与通知反馈。字幕继续使用“多个终端”。

所有终端输出和页面内容均为演示数据。音乐与提示音为原创合成，无人声。中文字体本地化，授权在 `public/v3-fonts/OFL.txt`。

## 导出与检查

```sh
npm ci
npm run browser
npm run music:v3
node scripts/check-motion.mjs
npm run render -- --browser-executable="/path/to/chrome-headless-shell"
npm run check:v3
ffmpeg -v error -i out/v3/tetris-promo-v3-1080p.mp4 -f null -
```

本机采用独立 Chrome Headless Shell 149.0.7827.55、ANGLE、PNG、单并发，并关闭 GPU 栅格化。Anime.js 停止自动播放，只根据视频帧 seek；840 帧的顺序、倒序和乱序取值一致。质量报告为同名 `.quality.json`，属于启发式检测，仍需目视检查。

V2 的源码和已验证成片保留。`npm run render:v2` 可重导出第二版。更早的 `out/tetris-promo-v2-1080p.mp4` 有已知异常，仅供诊断；已验证的 V2 是 `out/tetris-promo-v2-headless-1080p.mp4`。
