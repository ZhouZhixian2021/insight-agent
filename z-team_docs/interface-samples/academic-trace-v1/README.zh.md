# Academic Trace v1 交接夹具

[English](README.md) | 中文

## Purpose

这些合成夹具配合 [C-T0 接口提案](../../模块分工/academic-trace-v1-interface-handoff.md)供审核使用，不代表已安装 Remote 服务，也不证明任一基座版本能采集全部字段。数据不包含真实 Session、论文、凭据或模型响应。

## Files

- [cases.sample.json](cases.sample.json)：正常、重试、超时、取消、并发调用、重复到达、重启后未结算和历史缺字段。每个场景包含独立观察记录及期望数量；重试场景包含运行 → 阶段 → 论文 → 调用 → 两次尝试的层级。
- [queries.sample.json](queries.sample.json)：重试场景的两页列表、失败尝试详情，以及明确的错误响应。游标字符串是不透明的夹具令牌，此处不规定生产编码。
- [validate.py](validate.py)：无额外依赖的夹具检查，覆盖身份、父子关系、尝试计数、去重、耗时和查询一致性；两个反例分别拒绝内容冲突的重复事件和用零替代未知计时。

## Validation

在仓库根目录运行 `python z-team_docs/interface-samples/academic-trace-v1/validate.py`。它只读取本目录夹具，不执行网络请求、模型调用、Session 写入或应用启动。期望输出为八个场景和两个反例通过。它是交接校验器，不是生产数据校验器、适配器或权限测试。

## Follow-up

A/B 按交接反馈表填写真实观察点与缺失字段。C-T1 需要单独测试生产投影、持久化、访问控制、分页过期和脱敏；本夹具校验器不能证明这些行为。
