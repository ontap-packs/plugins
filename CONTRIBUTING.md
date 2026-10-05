# 贡献指引

欢迎向 OnTap 官方精选插件目录提交插件。Phase 0 采用**维护者审核**，请按以下步骤提交 PR。

## 前置

- 插件用 Python（`runtime: "python"`）或其他受支持运行时编写，遵循 `manifest.json` schema（见 OnTap 仓库 `docs/plugins/development.md`）。
- 插件通过 `stdin` JSON → `stdout` NDJSON 通信；不得访问网络（Phase 0 不提供网络能力）。
- 若使用文件读写 / AI，需在 `manifest.json` 声明 `capabilities`（`file.read` / `file.write` / `ai`）；`ai` 与 `file.read` 互斥。

## 步骤

1. **打包**：用 `node scripts/build-otplugin.mjs`（OnTap 源码仓库）或 OnTap 应用内「导出插件」生成 `<id>.otplugin`，并记录其 `sha256`。
2. **放置文件**：新建 `plugins/<id>/`，放入 `<id>.otplugin`（可选附源码与 README）。
3. **更新 `index.json`**：在 `plugins[]` 追加条目，填写 `id` / `name` / `author` / `license` / `versionCode` / `version` / `description` / `download` / `sha256` / `runtime` / `entry` / `capabilities` 等。
4. **提 PR**：填写 PR 模板，说明插件用途、能力与必要性。

## 审核要求

- `.otplugin` 必须能被客户端安装链校验（根 `manifest.json`、安全 id、能力合法、无 zip-slip、体积/条目未超限）。
- 静态危险模式扫描（`SendInput` / 剪贴板 / 窗口操作等）命中会展示警告，需说明必要性。
- `license`、`sha256`、`versionCode` 缺失会被拒。
- 不得绕过能力清单或声明未授权能力。

## 撤回

发现严重安全问题时，维护者会在 `index.json` 对应条目设 `revoked: true` 并填 `securityNotice`，客户端下次拉取后停用已安装实例。

## 校验

本仓库自带校验工具。Gitee 无免费 CI（Gitee Go 为付费功能），因此**合并前由维护者在本地运行**：

```bash
npm install
npm run validate         # 校验 index.json <-> plugins/ + sha256 + manifest + 危险模式扫描
npm run generate-index    # 需要时从 .otplugin 重建 index.json（保留治理字段）
```

> 可选：若本仓库镜像到 GitHub，`.github/workflows/plugin-validate.yml` 会在 GitHub 上自动运行同一校验（免费）。

`validate` 检查：

- `index.json` schema 1 且与 `plugins/<id>/` 一一对应；
- 每个条目 **`license` 必填**，`versionCode` 为整数，`revoked`/`deprecated` 为布尔；
- `.otplugin` 的 `sha256` 与索引一致；
- `.otplugin` 是可读 ZIP，根含 `manifest.json`，`id` 与目录一致、`commands` 非空、能力合法（`config`/`file.read`/`file.write`/`ai`，`ai × file.read` 互斥）；
- 拒绝不安全 ZIP 条目（绝对路径 / `..` / `__pycache__`）；
- 对脚本成员做静态危险模式扫描（**警告**，非硬失败）。

