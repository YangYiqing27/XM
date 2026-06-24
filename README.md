# 戏脉 · ChinaVis 数字人文可视化

React + TypeScript + D3 单页叙事作品，纯前端运行。生产构建后不依赖在线 CDN。

## 启动开发版

```bash
cd "/Users/yanghaoyun/Desktop/赛题1-I京剧数据集/戏脉系统"
npm install
npm run dev
```

按终端显示的地址访问，默认是 `http://127.0.0.1:4173/`；端口被占用时 Vite 会选择下一个端口。

## 生产构建

```bash
npm run build
npm run preview
```

构建产物位于 `dist/`。

## 作品结构

- 戏脉长卷：1,473 份 PDF 档案片滚动汇聚成文献、流派、剧本三条主脉。
- 镜轴关系：来源/版本位于左轴，剧目居中，角色/行当/演员或对象关联位于右轴。
- 纹章指纹：外圈板式、中圈唱白、内核角色集中度、纹理舞台提示密度、色相行当重心。
- 场次乐谱：真实 curated overlay 驱动唱段波纹、白段墨线、动作点、角色泳道和证据抽屉。
- 证据边界：展示数据层级、匹配率与明确的方法限制。
- 演示模式：总时长 3 分钟，共 8 个步骤，支持暂停、继续、跳过和退出。

## 数据

核心文件位于 `public/data/`：

- `objects.json`
- `comparison_groups.json`
- `integration_report.json`
- `validation_report.json`
- `collections.json`

`public/data/curated_overlays/` 是场次乐谱使用的真实场级证据。不存在 overlay 时组件只展示“版本聚合密度 fallback”，不会生成虚假的逐场数据。

## 方法边界

- 指纹是剧本文本风格指纹，不是声学指纹。
- 同剧、同台和共现关系不等于师承。
- 心跳指数是阅读导航，不代表艺术价值或真实演出时长。
- 相似度不证明艺术渊源、影响或抄袭。
