# AGENTS.md

## Cursor Cloud specific instructions

This is a **zero-dependency, zero-build, pure front-end** project (vanilla HTML + CSS + JS). There is no package manager, no bundler, no test framework, and no linter.

### Running the application

Serve the project root with any static HTTP server:

```bash
python3 -m http.server 8765 --directory /workspace
```

Then open `http://localhost:8765/index.html` in a browser.

### Key files

| File | Purpose |
|---|---|
| `index.html` | Entry point, `ziling-build`, `#helpDialog` quick start |
| `styles.css` | 浅色 Apple 系布局与控件样式 |
| `pet.js` | Pet engine: particle physics, rendering |
| `app.js` | Application layer: interaction handlers |

### Notes

- 产品交互与视觉真源见根目录 **`DESIGN.md`**。
- 页面加载 LXGW WenKai 字体。
- 零依赖、零打包。