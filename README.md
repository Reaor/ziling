# 字灵 · Zì Líng

> 一只由「字」排成栅格、会呼吸变形的小生灵；日程词与字池可融入躯体；**可选**经后端接入 AI（本页已移除 AI 面板 UI，协议见代码）。

一个移动端友好的电子宠物模块。纯前端实现（HTML + CSS + JS，零依赖、零打包），
可以通过 **WebView** 直接嵌入任何安卓 App（原生、Flutter、React Native、uni-app、Hybrid 皆可），
也可以独立部署为网页。

**阶段性详细汇报（宠物介绍、设计原因、App/后端/UI 对接）** → **[`ZI_LING_STAGE_REPORT.md`](./ZI_LING_STAGE_REPORT.md)**（建议优先阅读）

**需求与迭代对照**见仓库根目录 [`PLAN.md`](./PLAN.md)（含完成度、未做项与版本号约定）。

**代码目录导览**（模块加载顺序、后续拆文件建议）见 [`docs/ZILING_LAYOUT.txt`](./docs/ZILING_LAYOUT.txt)；画布活动区碰撞逻辑在 [`js/ziling/play-bounds.js`](./js/ziling/play-bounds.js)。