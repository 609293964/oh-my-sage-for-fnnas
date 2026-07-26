# 米家自动化知识索引

按任务读取最少的参考文件，不要一次加载全部资料。

| 需求 | 读取 |
|---|---|
| 节点字段、端口、完整 JSON 结构 | [mijia-complete-reference.md](mijia-complete-reference.md) |
| 变量保存状态、局部/全局作用域、查询新鲜度、触发与状态时序 | [patterns/state-and-scope.md](patterns/state-and-scope.md) |
| 运算、取整、小数、量程转换 | [patterns/numeric-transforms.md](patterns/numeric-transforms.md) |
| 多传感器、最值、至少满足 k 个、否则与状态组合 | [patterns/aggregation-and-thresholds.md](patterns/aggregation-and-thresholds.md) |
| 时间戳、运行时长、日期、长周期提醒、节律窗口 | [patterns/time-and-duration.md](patterns/time-and-duration.md) |
| 循环、停止、模式归位、启动恢复 | [patterns/loops-and-lifecycle.md](patterns/loops-and-lifecycle.md) |
| 设备镜像、多设备跟随、状态驱动切换、防回环 | [patterns/synchronization.md](patterns/synchronization.md) |
| 设备适配层、虚拟事件协同、可复用模板、观测探针 | [patterns/adapters-and-templates.md](patterns/adapters-and-templates.md) |
| 视频案例的脱敏关联索引 | [cases/catalog.md](cases/catalog.md) |
| 待验证方案和状态升级规则 | [experiments/index.md](experiments/index.md) |
| 已确认事故、反例和通用限制 | [lessons-learned.md](lessons-learned.md) |
| 网关新能力发现 | [gateway-capability-discovery.md](gateway-capability-discovery.md) |

## 稳定模式 ID

| ID | 模式 |
|---|---|
| `PAT-STATE-01` | 本规则状态、全局状态与跨规则契约 |
| `PAT-NUM-01` | 数值规范化、函数和量程转换 |
| `PAT-AGG-01` | 多源聚合、偏差和至少满足 k 个 |
| `PAT-TIME-01` | 时间戳、时长、日期和长周期提醒 |
| `PAT-LOOP-01` | 可控循环、退出和设备状态恢复 |
| `PAT-SYNC-01` | 单向镜像、双向同步和防回环 |
| `PAT-ADAPT-01` | 输入适配、核心逻辑、输出适配和观测探针 |

## 设计检索顺序

1. 把需求拆成触发、状态、变换、条件、动作、退出、恢复。
2. 从上表选取一至三个模式文件。
3. 检查是否需要局部变量、全局变量或完全不需要变量。
4. 读取目标设备 MIOT Spec，替换模式中的抽象属性和动作。
5. 处理初始化、离线、重复事件、并发和恢复。
6. 最后查节点参考，构造规则并执行双校验。

模式是设计起点，不是固定模板。可以组合、删减或拒绝模式；不得照抄案例中的设备、阈值、量程或私有标识。
