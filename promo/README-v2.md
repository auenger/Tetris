# Tetris 产品宣传片

当前成片：28 秒 / 1920 × 1080 / 30 fps / H.264 + AAC。

- 成片：`out/tetris-promo-v2-headless-1080p.mp4`
- 播放页：`out/preview-v2.html`
- 分镜总览：`out/storyboard-v2-headless.jpg`
- 检查报告：`out/tetris-promo-v2-headless-1080p.quality.json`
- 云端独立工程包：`out/tetris-promo-v2-cloud.zip`

宣传文案为“多个终端，同时展开。”。展示终端、Markdown 与图片预览、浏览器画布、分组和完成提醒，配有 120 BPM 原创电子音乐及提示音。界面素材采自生产组件，内容是演示数据，镜头动作是动画编排。

## 已验证的导出

2026-10-23，macOS，独立 Chrome Headless Shell 149.0.7827.55，ANGLE，单并发，PNG 中间帧，禁用 GPU 栅格化。完整导出 840 帧，未检出孤立闪帧、空白帧，完整音视频解码无报错；8 张关键帧目视检查正常。该检测是启发式检查，不代表所有浏览器版本和机器都必然得到同样结果。

另外验证了 SwANGLE 软件渲染的前 300 帧，同样通过检测。云端包默认选择 SwANGLE；Dot 应在云端对完整导出再次检查。

## 重现

```sh
npm ci
npm run browser
npm run render
python3 check-video.py out/tetris-promo-v2-headless-1080p.mp4
```

如需指定已安装的独立 Headless Shell：

```sh
npm run render -- --browser-executable="/path/to/chrome-headless-shell"
```

`scripts/render-headless.mjs` 启动 Remotion，并只对其 Chromium 进程添加 `--disable-gpu-rasterization`。不改依赖文件，兼容 Linux、macOS、Windows。此设置参考 [Remotion 上游问题 11428](https://github.com/remotion-dev/remotion/issues/11428)，本机出现过相近现象，但并未确认硬件故障。

`src/index.tsx` 为动画源码，`music.mjs` 为配乐生成器。`public/v2/` 保存固化素材，正常渲染不需要运行 Tetris。云端包另附本地中文字体与加载等待。

旧文件 `out/tetris-promo-v2-1080p.mp4` 已确认含异常帧，仅保留用于诊断，不作为交付。第一版在 `out/tetris-promo-1080p.mp4`。
