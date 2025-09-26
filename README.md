明白了，大佬 😎。我给你输出成 **一整段的 markdown 文本**，这样你可以直接 **一键复制保存为 `README.md`**，不会被切开。

---

````markdown
# rrweb-components

[![npm version](https://img.shields.io/npm/v/@your-scope/rrweb-components.svg?style=flat-square)](https://www.npmjs.com/package/@your-scope/rrweb-components) [![npm downloads](https://img.shields.io/npm/dm/@your-scope/rrweb-components.svg?style=flat-square)](https://www.npmjs.com/package/@your-scope/rrweb-components) [![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](./LICENSE)

基于 [rrweb](https://github.com/rrweb-io/rrweb) 和 [rrweb-player](https://github.com/rrweb-io/rrweb) 的 React 组件库，提供录制与回放的封装能力，方便在业务系统中快速集成。

> ⚠️ 本仓库包含 **组件库** 与 **调试脚手架**。最终发布到 npm 的只有 `packages/rrweb-components` 下的代码；`apps/playground` 仅用于开发调试，不会发布。

---

## 📖 目录
- [安装](#-安装)
- [使用示例](#-使用示例)
- [目录结构](#-目录结构)
- [开发调试](#-开发调试)
- [打包与发布](#-打包与发布)
- [特性](#-特性)
- [License](#-license)

---

## 📦 安装
```bash
# 使用 npm
npm install @your-scope/rrweb-components

# 使用 yarn
yarn add @your-scope/rrweb-components

# 使用 pnpm
pnpm add @your-scope/rrweb-components
````

依赖环境：

* React >= 18
* ReactDOM >= 18
* （可选）Ant Design >= 4（部分 UI 依赖）

---

## 🚀 使用示例

```tsx
import React from 'react';
import { RecordPanel, ReplayPanel } from '@your-scope/rrweb-components';

export default function App() {
  return (
    <div>
      <h1>RRWeb 录制与回放</h1>
      <RecordPanel onSave={(events) => console.log(events)} />
      <ReplayPanel events={/* rrweb event 列表 */[]} />
    </div>
  );
}
```

---

## 📂 目录结构

```
.
├─ packages/
│  └─ rrweb-components/    # 真正发布的组件库
│     ├─ src/              # 组件源码
│     ├─ dist/             # 打包产物（npm 包里只包含这里）
│     └─ package.json
└─ apps/
   └─ playground/          # 本地调试脚手架 (private，不发布)
      └─ src/
```

---

## 🛠️ 开发调试

在根目录执行：

```bash
# 安装依赖
pnpm install

# 启动组件库编译 + playground 调试
pnpm dev
```

* `packages/rrweb-components` 提供组件源码
* `apps/playground` 是调试环境，直接引用源码或 dist
* 修改组件代码后，playground 会自动热更新

---

## 📦 打包与发布

组件库打包：

```bash
pnpm -F @your-scope/rrweb-components build
```

预览发布内容：

```bash
cd packages/rrweb-components
npm pack --dry-run
```

发布到 npm：

```bash
pnpm -F @your-scope/rrweb-components publish --access public
```

---

## ⚡ 特性

* ✅ 封装 rrweb 的录制与回放，开箱即用
* ✅ 支持 gzip 压缩事件数据
* ✅ TypeScript 完整类型定义
* ✅ 可扩展：支持自定义存储 / 上传逻辑

---

## 📄 License

[MIT](./LICENSE)

```

---

要不要我再帮你扩展一个 **Contributing 指南**（写如何本地跑、PR 规范）和 **Changelog 模板**，让它更像开源项目？
```
