# rrweb-components

基于 [rrweb](https://github.com/rrweb-io/rrweb) 和 [rrweb-player](https://github.com/rrweb-io/rrweb) 的 React 组件库，提供录制与回放的封装能力，方便在业务系统中快速集成。

> ⚠️ 本仓库包含 **组件库** 与 **调试脚手架**。最终发布到 npm 的只有 `packages/rrweb-components` 下的代码；`apps/playground` 仅用于开发调试，不会发布。

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

---

## 🚀 使用示例

```tsx
import React from 'react';
import { RecordComponent, ReplayComponent } from '@your-scope/rrweb-components';

export default function App() {
  return (
    <div>
      <h1>RRWeb 录制与回放</h1>
      <RecordComponent />
      <ReplayComponent />
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

# 组件库编译
pnpm rrweb-build

# 启动 playground 调试
pnpm playground-dev
```
