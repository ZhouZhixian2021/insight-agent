# Git 协作规范

## 仓库与分支

团队仓库是 `https://github.com/ZhouZhixian2021/insight-agent.git`，本地远程名为 `origin`。DeepSeek Harness 官方仓库是 `https://github.com/deepseek-ai/deepseek-harness.git`，本地远程名为 `upstream`。团队共享主分支是 `master`。

团队维护三个固定个人开发分支，每名成员只向自己的分支日常推送。个人分支统一命名为 `dev/<成员名或GitHub用户名>`；三条准确分支名在[成员与分支](02-成员与分支.md)中登记后生效。

`master` 只接收经过检查和审核的 PR。成员不得把日常开发提交直接推送到 `master`，主负责人负责最终合并和发布判断。

## 每日开始开发

开始前先确认工作区没有未保存改动。存在改动时，先完成提交或明确保存方式，不使用 `git reset --hard` 丢弃工作。

```sh
git status
git switch master
git pull --ff-only origin master
git switch <个人分支>
git merge master
```

这套流程先快进更新本地 `master`，再把团队主分支合入个人分支。固定个人分支不通过普通 `git push --force` 改写远程历史。

如果 `git pull --ff-only` 失败，成员停止开发并检查本地 `master` 是否含有未推送提交。如果 `git merge master` 冲突，产生冲突的成员负责理解双方改动、完成解决并请求相关模块成员复核。

## 开发与提交

一次提交只表达一个可审核的目的。提交前检查变更列表，不把 `.env`、`.dsh-runtime`、凭据、会话、用户资料、构建产物或无关格式化改动加入提交。

```sh
git status
git diff
git add <本次相关文件>
git diff --cached --check
git commit -m "<类型>(<范围>): <简短说明>"
```

常用提交类型包括 `feat`、`fix`、`docs`、`test`、`refactor` 和 `chore`。示例：`feat(preset): add academic insight MVP`。

代码变更必须同时包含对应测试和文档。DeepSeek Harness 的非平凡改动还必须按仓库规则提供 Agent Note，并运行与变更范围匹配的检查。

## 推送与合并

成员把提交推送到自己的个人分支，并从个人分支向 `master` 创建 PR。

```sh
git push -u origin <个人分支>
```

PR 说明至少包含目标、主要改动、实际运行的检查、已知限制和后续工作。至少一名其他成员完成审核；主负责人确认审核意见和必要检查后执行合并。默认使用 Squash and merge，使 `master` 为每个 PR 保留一个清晰提交；需要保留独立提交语义时，由主负责人决定使用普通合并。

PR 合并后，成员按“每日开始开发”流程重新同步 `master` 和个人分支。已合并的临时任务分支可以删除，三个固定个人分支持续保留。

## 官方仓库同步

只有主负责人或其明确指定的成员负责把 `upstream/master` 同步到团队仓库。同步工作使用独立分支和 PR，不直接在个人开发分支中混入官方更新。

```sh
git fetch upstream
git switch -c sync/upstream-YYYY-MM-DD origin/master
git merge upstream/master
git push -u origin sync/upstream-YYYY-MM-DD
```

同步 PR 必须区分官方变更、团队二次开发冲突和人工解决内容。合并后，三名成员再从更新后的 `origin/master` 同步。

## 禁止事项

- 不直接向 `master` 推送日常开发提交。
- 不使用 `git push --force`；确需改写个人分支时只允许 `--force-with-lease`，并先通知另外两名成员。
- 不把 `upstream` 当作团队推送目标。
- 不提交密钥、令牌、密码、私有会话或用户资料。
- 不为解决冲突而删除不理解的他人代码，也不使用破坏性重置绕过冲突。
