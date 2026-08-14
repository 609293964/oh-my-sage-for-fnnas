# 实验索引与证据状态

## 状态机

```text
video
→ ui-sample
→ graph-diff
→ local-tested
→ gateway-roundtrip
→ runtime-verified
→ reusable-pattern
```

终止或限制状态：

- `conflicted`：来源内部矛盾，等待新证据。
- `rejected`：实验证明不成立。
- `private-only`：含家庭、门锁、人员或网络敏感信息。

状态只能凭证据向前升级。状态表示当前最高证据，不要求所有项目都从 `video` 开始；不适用步骤可记为 N/A。静态双校验不能替代运行验证；单次成功不能证明边界和跨设备通用性。`reusable-pattern` 还必须满足脱敏、跨场景适用和边界明确。

## 实验记录最小字段

- 实验 ID 和关联案例/模式 ID。
- 目标与预期行为。
- 来源与当前状态。
- 变量、节点角色和关键连接。
- UI 样本和规则 diff。
- 本地测试、网关回读和实机结果。
- 清理记录。
- 冲突、失败和适用边界。
- 隐私等级。

项目仓库只保存脱敏、可公开、可复现的实验。家庭级原始证据保留在私有案例库。

## 当前待验证主题

| 主题 | 当前状态 | 最小验证 |
|---|---|---|
| `deviceGet` 新鲜度 | video | 正常上报、刚断电、已离线、从未上报四种状态下记录两分支和日志 |
| trigger / condition / else 时序 | runtime-verified | 已确认先事件后状态不回补、false 走 unmet；未知状态仍需验证 |
| 空输入与空输出 | runtime-verified | 已确认 modeSwitch 空输出占用轮次；logicAnd、logicOr、signalOr 空输入仍待验证 |
| 枚举多选集合 | video | 执行集合外→内、集合内切换、离开后再进入，记录触发次数和真实图 JSON |
| 模式游标与状态查询链 | video | App 外部改档后立即/延迟触发，比较查询值、下一动作和异常兜底 |
| 虚拟事件协同 | runtime-verified | 已确认网关规则可产生并消费同名字符串事件；App 创建、通知往返及重复触发仍待验证 |
| 启动恢复动作 | video, conflicted | 用无害灯记录规则启用、设备上线、延迟动作和人工操作竞争的时间线 |
| 节律渐变 | video, conflicted | 三分钟短区间验证初始化、步长、终点夹紧、中途关灯、重启和停止 |

## 已验证命题

验证批次：`EXP-20260726-01`，当前中枢网关，临时规则创建、回读变量、删除规则及变量后确认无残留。

| 命题 | 状态 | 本轮结果 | 未覆盖边界 |
|---|---|---|---|
| `month()` 可在规则运行时返回月份 | runtime-verified | 返回 `7` | 时区、跨月 |
| `hours()` 可在规则运行时返回小时 | runtime-verified | 返回 `17` | 时区、夏令时 |
| `min()` 可夹紧渐变终点 | runtime-verified | 超调表达式被夹紧为 `25` | 下降段、设备步进 |
| `deviceGet` 按比较结果走双分支 | runtime-verified | 当前开关命中满足分支 | 离线、未知、旧值时长 |
| 事件先到、状态稍后变真不会回补 | runtime-verified | 事件早约 500 ms，`met` 未执行 | 不同状态源、固件 |
| 条件为 false 时执行 `unmet` | runtime-verified | `unmet` 分支执行一次 | 未知值 |
| counter 可在第 3 轮停止 loop | runtime-verified | 循环变量最终为 `3` | 重启、并发启动 |
| modeSwitch 空输出仍占一个轮次 | runtime-verified | A、B 各执行一次，第三空档终止链 | 重启后游标 |
| 网关虚拟事件可由规则产生并消费 | runtime-verified | 同名字符串事件被消费一次 | App 通知、重复触发、跨规则重启 |
