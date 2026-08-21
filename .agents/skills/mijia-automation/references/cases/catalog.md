# 案例关联索引

本文件只保存脱敏关联，不复制视频口述、截图、家庭设备或私有路径。

| 案例组 | 关联模式 | 当前状态 | 关联原语证据与主要边界 |
|---|---|---|---|
| 属性与参数同步 | state-and-scope, numeric-transforms, synchronization | video | 动态参数原语已有运行证据；量程、步进、回环仍需整案验证 |
| 温度与环境播报 | state-and-scope, numeric-transforms | video | 数值和文本原语已有运行证据；初始化、新鲜度、尾零未整案验证 |
| 多传感器最值和偏差 | aggregation-and-thresholds | video | 更新时序、错误变量引用 |
| 随机设备参数 | loops-and-lifecycle, numeric-transforms | video | 随机和 loop 原语已有运行证据；设备编码、停止后状态未整案验证 |
| 单次及累计时长 | time-and-duration | video | 时间函数原语已有运行证据；重启、重复事件、分段边界未整案验证 |
| 长周期提醒 | time-and-duration, state-and-scope | video | 起点语义、确认事件 |
| 全局状态与部分条件 | state-and-scope, aggregation-and-thresholds | video | 初值、异常枚举、消费者依赖 |
| 双向同步 | synchronization | video | 设备输入和动态输出原语已有运行证据；并发、容差、离线恢复未整案验证 |
| 变量化模板 | adapters-and-templates | video | scope、设备重绑、复杂度收益 |
| 事件参数发现 | adapters-and-templates | private-only | 隐私、型号差异、重复验证 |
| 日期与动态时间段 | time-and-duration, state-and-scope | video | 日期函数原语已有运行证据；时区、错过边界、恢复未整案验证 |
| 查询值新鲜度与未知状态 | state-and-scope, adapters-and-templates | video | 断电后可能仍命中最近上报值；离线、未知和固件差异待独立实测 |
| 触发、状态、否则与互为状态 | state-and-scope, aggregation-and-thresholds | runtime-verified | 已实测事件不回补及 false 走 unmet；未知值和互为状态整案待验证 |
| 虚拟事件通知闭环 | adapters-and-templates, loops-and-lifecycle | runtime-verified | 规则产生和消费已实测；App 创建、通知往返和重复触发待验证 |
| 模式游标与外部状态不同步 | synchronization, loops-and-lifecycle | video | 状态查询链优先；旧值、异常档位和补脉冲风险待验证 |
| 空触点与枚举多选 | aggregation-and-thresholds, adapters-and-templates | runtime-verified | modeSwitch 空档占轮次已实测；逻辑空输入、集合边沿和重启持久性待验证 |
| 节律照明与动态窗口 | time-and-duration, numeric-transforms, loops-and-lifecycle | runtime-verified, conflicted | 日期时间函数和 min 夹紧已实测；初始化、跨段和跨天恢复缺失 |
| 语音主动询问与应答分发 | state-and-scope, adapters-and-templates, aggregation-and-thresholds | video | 单入口配合时间窗寄存器分发多问；窗口重叠、求值顺序、语音到事件时延和 MCP 侧建入口均未验证 |

完整案例证据由维护者保存在私有案例库。公开模式只接收经过脱敏和验证的结论。
