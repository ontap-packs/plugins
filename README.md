# OnTap Plugins

OnTap 官方精选插件目录（Phase 0）。OnTap 客户端通过本仓库的 `index.json` 浏览并一键安装脚本插件。

> 这是 **脚本插件**（含可执行代码）的目录，与纯 Prompt 的指令包（`.otpack`）仓库分开。
> Phase 0 采用**维护者 PR 审核 + 静态危险模式扫描**，定位为**官方精选项**。

## 目录结构

```
.
├── index.json                  # 插件索引（客户端只读此文件）
├── plugins/
│   └── <id>/
│       ├── <id>.otplugin        # 分发包（Deflate ZIP，根含 manifest.json）
│       └── ...                  # 可选：源码 / README
├── docs/plugin-spec.md          # 字段与命名规范
└── CONTRIBUTING.md              # 贡献指引
```

## 安装一个插件

1. 在 OnTap 打开「插件管理 → 在线」
2. 找到插件，点击「安装」（客户端下载 `.otplugin` 并校验 `sha256`）
3. 安装后**默认禁用**；在能力/扫描确认后手动启用

## 提交一个插件

见 [CONTRIBUTING.md](./CONTRIBUTING.md)。核心步骤：用 OnTap 或 `scripts/build-otplugin.mjs` 导出 `.otplugin` → 放入 `plugins/<id>/` → 在 `index.json` 追加条目（含 `license`、`sha256`、`versionCode`）→ 提 PR。

## `index.json` 示例

```json
{
  "schema": 1,
  "updatedAt": "2026-01-01T00:00:00Z",
  "plugins": [
    {
      "id": "json-tools",
      "name": "JSON 工具",
      "author": "ontap",
      "license": "MIT",
      "versionCode": 1000000,
      "version": "1.0.0",
      "description": "格式化 / 压缩 / 校验 JSON",
      "tags": ["json", "dev"],
      "categories": ["developer"],
      "download": "plugins/json-tools/json-tools.otplugin",
      "sha256": "<64 hex>",
      "homepage": "https://gitee.com/ontap-app/plugins",
      "minAppVersion": "0.1.48",
      "runtime": "python",
      "entry": "main.py",
      "capabilities": [],
      "requiresAi": false,
      "deprecated": false,
      "revoked": false,
      "authorVerified": false
    }
  ]
}
```

- `download` 支持相对本索引目录的路径，或绝对 URL。
- `license`、`sha256`、`versionCode` 为必需字段。

## 安全

- 插件是**非可信代码**：OnTap 无沙箱，安装后默认禁用，启用前展示能力清单与静态扫描警告。
- 发现问题可在 Issue 中报告；维护者可对条目设 `revoked: true` 紧急下架（客户端会停用已安装实例）。

## 许可证

本仓库采用 [MIT 许可证](./LICENSE)。各插件的具体授权以 `index.json` 条目的 `license` 字段为准。
