---
description: 将固定的 dsh-web-tools 网页搜索组合包安装到明确指定的本机 Harness 目录，不复制凭据。
---

# 固定版本的网页搜索安装

[English](README.md) | 中文

## 摘要

检出本仓库后，使用安装器将固定的 `dsh-web-tools` 组合包加入 Web 配置。仓库携带兼容安装包；`.dsh-runtime` 继续保留在本机并由 Git 忽略。

## 目录

- [安装](#web-tools-install)
- [固定安装包](#web-tools-package)
- [本机状态与失败](#web-tools-local-state)
- [验证](#web-tools-verification)

<a id="web-tools-install"></a>
## 安装

安装工作区依赖并构建 [CLI](../../docs/development.zh.md) 后，从仓库根目录运行。必须明确选择目标 Harness 目录；本例使用 `insight:web` 选择的目录。

```sh
node scripts/install-insight-web-plugin.mjs --home .dsh-runtime --dry-run
node scripts/install-insight-web-plugin.mjs --home .dsh-runtime --offline
```

安装包携带普通依赖闭包及各自许可证；新的 Web 配置可以使用空 pnpm 存储离线安装。`--store-dir <path>` 选择存储目录。配置中原先添加的其他包可能需要自己的缓存，或通过 `--online` 获取缺少的依赖。安装器禁用包生命周期脚本和 peer 自动安装。它调用官方 `dsh plugin --profile web add` 命令，并根据 [lock.json](lock.json) 核对已安装的组合包、构建文件和依赖版本。已安装配置完全匹配时，直接返回 `already-installed`，不再次运行包管理器。

<a id="web-tools-package"></a>
## 固定安装包

[lock.json](lock.json) 记录作者仓库、发布标签、源码提交、上游包摘要、兼容包摘要及已打包的依赖版本。[compatibility.patch](compatibility.patch) 记录本地修改：移除未使用的 `webRuntime` 注入及类型，将版本标记为 `0.3.5+insight.1`，并固定和打包普通依赖。补丁保留配置接口的回环地址与同源检查。[MIT 许可证](LICENSE) 随插件保留；各打包依赖在安装包内保留自己的许可证。

安装器在写入配置前核对包内 Host JavaScript。它将安装包复制到所选目录的 `plugin-packages` 子目录，使配置不再依赖外部准备目录。本集成不是工作区包，也不向其他配置添加默认组合包。

<a id="web-tools-local-state"></a>
## 本机状态与失败

凭据、提供方选择、会话和浏览器配置保留在本机。安装器不复制它们，也不打开设置、启动产品或调用提供方。请通过产品已有设置单独配置凭据。打开插件设置可能检查版本、余额和已有浏览器登录状态；该操作不属于安装器。

摘要不匹配时，安装前停止。包管理失败或安装后不匹配时，停止且不重试；配置状态可能不完整。再次安装前，先检查该目录的包管理诊断记录。依赖版本漂移需要重新审核锁定文件，不能静默接受另一个依赖解析结果。

<a id="web-tools-verification"></a>
## 验证

```sh
node --test scripts/install-insight-web-plugin.test.mjs
```

聚焦测试覆盖包内 Host、安装包完整性、命令计划、凭据隔离、重复安装和失败处理。测试使用本机夹具，不启动产品或执行真实搜索。现有线上提供方凭据不属于 Git 交付内容。
