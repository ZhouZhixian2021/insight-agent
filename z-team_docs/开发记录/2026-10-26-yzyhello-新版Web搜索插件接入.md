# 开发记录：新版独立 Web profile 接入搜索插件

## 配置结果

- 目录：`D:\agent-project\insight-agent-u0`；本地 Harness home：`.dsh-runtime`；profile：`web`。
- 安装 `dsh-web-tools 0.3.8`，锁定 `github:A3Boy/dsh-web-tools#cfa00a70b600da212915ac3a82e970e9b93ac9c2`，安装时的版本兼容检查通过，没有使用版本豁免。
- `.dsh-runtime/profiles/web/package.json` 的依赖和加载组合均已包含插件；原有模型与 Academic 预设配置保持不变。
- profile 的 `web` 配置明确选择 `searchProvider: dsh-web-tools`、`fetchProvider: http`；插件首选 Provider 为 `tavily`。插件提供原生 `web_search`，学术全文继续通过内置 HTTP Provider 取得原始 HTML/PDF。
- 复用此 Harness home 已有的 `WEB_TOOLS_TAVILY` 凭据引用；没有向配置文件、脚本或记录写入凭据值。
- 默认全局 home `C:\Users\30847\.dsh` 中的旧插件仍为 `0.3.3`，没有更新旧环境。修改前的独立 profile 文件备份位于 `.dsh-runtime/backups/web-tools-20261026/`。

安装命令在仓库根目录执行：

```powershell
$env:DSH_HOME = Join-Path (Get-Location) '.dsh-runtime'
pnpm dsh plugin --profile web add github:A3Boy/dsh-web-tools#cfa00a70b600da212915ac3a82e970e9b93ac9c2
```

后续用 `pnpm insight:web` 启动新版环境。该入口会指定上述独立 home；未指定 `DSH_HOME` 的普通 `pnpm dsh web` 默认使用全局 home。

## 实际验证

`pnpm dsh --profile web --dump-config` 确认最终组合启用 Web 工具，搜索指向插件，抓取指向 `http`。以正式 base/Web 测试装配加载已安装插件及相同配置，在隔离的会话与凭据环境中完成以下检查，退出时释放临时服务和目录。

| 检查 | 结果 |
| --- | --- |
| 真实 Tavily 搜索 `Attention Is All You Need arxiv 1706.03762` | 返回 3 个来源，首条为 `https://arxiv.org/abs/1706.03762`。 |
| 原始论文抓取 | `https://arxiv.org/pdf/1706.03762v7` 返回 HTTP 200，`body.kind: pdf`，2,215,244 字节，未截断，起始字节为 `%PDF`。 |
| Academic Agent 工具注册 | 新建学术会话的工具列表包含 `web_search`。 |
| 插件配置 API | 首选 Tavily，现有凭据可解析，密钥只报告配置状态。 |
| Chromium 设置页 | `Settings → Web Search` 正常显示 Tavily 策略，无页面脚本错误。 |
| 本地文本凭据扫描 | 配置与证据共 7 个文件，凭据值命中 0。 |

最终装配用例 1 项通过，61.49 秒，日志为 `.dsh-runtime/web-tools-smoke-final.log`。结果、搜索来源和设置页截图位于 `.artifacts/web-tools-smoke/run-pKIUmm/`；执行过的临时测试源码保存在 `.dsh-runtime/web-tools-smoke.executed.e2e.ts`，已从仓库测试目录移除。首次页面检查使用了错误的侧栏按钮定位，改用仓库已有的 `openSettings` 后通过；没有为通过测试改动产品代码或断言要求。

安装前后的独立 profile 原有配置行逐项一致。本轮只改本机 profile 和安装内容，没有改 Harness 生产源码，因此没有重跑整仓构建、全量测试或模型生成链路。

## 边界

本轮证明搜索插件、现有 Tavily 凭据、学术工具注册和原始全文抓取可共存，不替代多来源学术研究、社交平台登录或其他搜索源验收，也不计作 C 的 HTML / Trace 实现交付。没有终止用户的现有服务；正在运行的旧实例需退出后用 `pnpm insight:web` 重新启动，才能确认使用这一配置。
