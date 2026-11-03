# Tetris 宣传片第二版

## 已更新的技能

2026-10-23 从上游获取并更新：

- [Remotion 官方技能](https://github.com/remotion-dev/skills)，4.0.538，commit `6c67adcd9cdbe6eb84d76342da89b225f9161cb2`。安装完整技能包，并保持原 `remotion` 入口可用。
- [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)，CLI 2.15.0，通过 `ui-ux-pro-max-cli@latest init --ai universal --global --force` 更新。
- [Taste Skill v2](https://github.com/Leonxlnx/taste-skill)，commit `6010f91a9935f1c167dfc500fb1a475681892e6b`。

旧版备份位于 `/Users/ryan/.agents/skill-backups/tetris-20261023/`。新技能在后续轮次可自动发现；本轮已直接读取并使用。

视频工程的 Remotion 运行时从 4.0.366 升级到 4.0.538，所有 Remotion 包版本一致。

## 新版内容

28 秒，1920 × 1080，30 fps，120 BPM 原创配乐。

| 时间 | 场景 |
| --- | --- |
| 0–2 秒 | Tetris 开场 |
| 2–6 秒 | 多个独立终端，展示实现、后端、测试、服务、审查和 Git |
| 6–10 秒 | Markdown 文件与图片在画布中预览 |
| 10–14 秒 | 带真实地址栏的浏览器画布窗口 |
| 14–18 秒 | 终端分组收起与展开 |
| 18–22 秒 | 完成提醒与终端聚焦 |
| 22–25 秒 | 多个终端、文件、浏览器的全画布总览 |
| 25–28 秒 | 品牌收尾与项目地址 |

## 视觉与素材

保留产品现有品牌字体、浅色界面与图标。宣传画面采用连续画布，不再交替切换整屏深浅背景；使用受控的平移和缩放帮助理解窗口之间的空间关系。UI/UX 查询结果中的 VR 和文档站模板不适合本片，未照搬；采用与当前产品相符的界面密度、克制配色和动作连续性原则。

`fixtures/main.jsx` 直接导入 Tetris 的 `createTileDOM`、生产 `shell.css`、xterm，以及生产 Markdown 组件。终端输出、Markdown 文档、图片与浏览器里的 Forma 页面均为本地演示内容。图片使用高分辨率浏览器截图固化为 `public/v2/` 素材；镜头移动、收起和通知定位是动画演示，非实时桌面录制。文件预览的示例排版针对拍摄做了调整。

不读取真实终端会话，不运行实际 Agent，不更改产品源代码。

## 闪动处理

所有主要素材保持挂载；动画只依赖帧号；外部网页和字体不参与最终导出；背景固定，镜头平滑插值；没有 CSS transition、随机数或真实时间驱动的视觉变化。导出后执行逐帧异常检测、解码检查和关键帧目视检查。原失败报告为 `out/v2-quality.json`，最终通过报告为 `out/tetris-promo-v2-headless-1080p.quality.json`。

## 后续修正

宣传文案从“六个终端，同时展开。”调整为“多个终端，同时展开。”，避免暗示终端数量限制；云端包同步补齐“多”字的字体。

原本机 Chrome 完整导出未通过检测，存在重复拼块和空白帧。已使用独立 Chrome Headless Shell 149、单并发、禁用 GPU 栅格化验证：ANGLE 完整 840 帧和 SwANGLE 前 300 帧均通过检测；并不据此判断本机硬件故障。禁用 GPU 栅格化参考 [Remotion 上游问题 11428](https://github.com/remotion-dev/remotion/issues/11428)。
