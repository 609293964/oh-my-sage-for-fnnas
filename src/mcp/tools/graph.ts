/**
 * MCP 服务 - 规则管理工具
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GatewayManager } from "../../core/gateway/manager.js";
import {
  getGraphs,
  getGraph,
  createGraph,
  updateGraph,
  deleteGraph,
  toggleGraph,
  validateGraph,
  validateGraphCapabilitiesWithGateway,
} from "../../core/index.js";
import {
  ResponseFormatSchema,
  formatJson,
  handleError,
  formatGraphListMarkdown,
} from "../utils.js";
import { GraphDraftStore } from "./graphDraft.js";

const GraphVariableSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string().regex(/^[a-zA-Z0-9]+$/, "id 必须是纯字母数字"), type: z.literal("number"), value: z.number(), name: z.string().trim().min(1).optional() }),
  z.object({ id: z.string().regex(/^[a-zA-Z0-9]+$/, "id 必须是纯字母数字"), type: z.literal("string"), value: z.string(), name: z.string().trim().min(1).optional() }),
]);

const GraphNodeSchema = z.object({
  id: z.string().regex(/^[0-9a-zA-Z]+$/, "节点 ID 只能包含字母和数字"),
  type: z.string().min(1),
  cfg: z.record(z.unknown()),
  props: z.record(z.unknown()),
  inputs: z.record(z.unknown()),
  outputs: z.record(z.array(z.string())),
});

export function registerGraphTools(
  server: McpServer,
  gatewayManager: GatewayManager
): void {
  const drafts = new GraphDraftStore();
  const restoreDraftError = (draftId: string, commitToken: string | undefined, error: unknown): string => {
    const original = handleError(error, "graph_draft_commit");
    if (!commitToken) return original;
    try {
      drafts.failCommit(draftId, commitToken);
      return original;
    } catch (restoreError) {
      return `${original}；草稿状态恢复失败: ${String(restoreError)}`;
    }
  };
  server.registerTool(
    "mijia_validate_graph_capabilities",
    {
      title: "校验规则设备能力",
      description: "根据真实 MIOT Spec 校验规则的 DID、URN、字段权限、类型、枚举值和数值范围。创建或更新设备节点前必须先通过本校验和 mijia_validate_graph。",
      inputSchema: z.object({
        graph: z.object({ id: z.string(), nodes: z.array(z.any()), cfg: z.any() }).describe("完整规则对象"),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ graph }) => {
      try {
        gatewayManager.ensureConnected();
        const report = await validateGraphCapabilitiesWithGateway(gatewayManager.gateway!, graph as Parameters<typeof validateGraphCapabilitiesWithGateway>[1]);
        return { content: [{ type: "text", text: formatJson(report) }], structuredContent: { ...report }, isError: !report.valid };
      } catch (error) {
        return { content: [{ type: "text", text: handleError(error, "validate_graph_capabilities") }], isError: true };
      }
    }
  );

  // ==================== mijia_get_graphs ====================
  server.registerTool(
    "mijia_get_graphs",
    {
      title: "获取规则列表",
      description: `获取所有自动化规则的列表。

返回：
  - graphs: 规则列表
  - count: 规则数量
  - 包含 id, name, enable(启用状态)`,
      inputSchema: z.object({
        response_format: ResponseFormatSchema.optional().default("markdown").describe("输出格式"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ response_format = "markdown" }) => {
      try {
        gatewayManager.ensureConnected();
        const result = await getGraphs(gatewayManager.gateway!);

        if (!result.success) {
          return {
            content: [{ type: "text", text: handleError(new Error(result.error), "get_graphs") }],
            isError: true,
          };
        }

        const graphs = result.data ?? [];
        const output = { graphs, count: graphs.length };

        if (response_format === "json") {
          return {
            content: [{ type: "text", text: formatJson(output) }],
            structuredContent: output,
          };
        }

        return {
          content: [{ type: "text", text: formatGraphListMarkdown(graphs) }],
          structuredContent: output,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleError(error, "get_graphs") }],
          isError: true,
        };
      }
    }
  );

  // ==================== mijia_get_graph ====================
  server.registerTool(
    "mijia_get_graph",
    {
      title: "获取规则详情",
      description: `获取指定自动化规则的详细信息。

参数：
  - id (string): 规则ID，从 mijia_get_graphs 获取

返回：
  - graph: 完整的规则对象
  - 包含 nodes(节点列表), cfg(配置)`,
      inputSchema: z.object({
        id: z.string().describe("规则ID"),
        response_format: ResponseFormatSchema.optional().default("markdown").describe("输出格式"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ id, response_format = "markdown" }) => {
      try {
        gatewayManager.ensureConnected();
        const result = await getGraph(gatewayManager.gateway!, id);

        if (!result.success) {
          return {
            content: [{ type: "text", text: handleError(new Error(result.error), "get_graph") }],
            isError: true,
          };
        }

        const graph = result.data!;

        if (response_format === "json") {
          return {
            content: [{ type: "text", text: formatJson({ graph }) }],
            structuredContent: { graph },
          };
        }

        const lines = ["## 规则详情", ""];
        lines.push(`**名称**: ${graph.cfg?.userData?.name || id}`);
        lines.push(`**ID**: ${graph.id}`);
        lines.push(`**状态**: ${graph.cfg?.enable ? "✅ 已启用" : "⛔ 已禁用"}`);
        lines.push("");

        if (graph.nodes && graph.nodes.length > 0) {
          lines.push(`### 节点列表 (${graph.nodes.length})`);
          for (const node of graph.nodes) {
            lines.push(`- **${node.id}** (${node.type})`);
          }
          lines.push("");
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: { graph },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleError(error, "get_graph") }],
          isError: true,
        };
      }
    }
  );

  // ==================== mijia_create_graph ====================
  server.registerTool(
    "mijia_create_graph",
    {
      title: "创建自动化规则",
      description: `创建新的自动化规则。

⚠️ 重要：在调用此工具前，你必须先阅读并理解 mijia-automation Skill 中的规则创建指南（使用 Skill 工具加载）。该 Skill 包含：
- 完整的节点类型模板（deviceInput, deviceOutput, condition, timeRange, delay 等）
- 节点连接规则（outputs 格式、state/event 节点区别）
- 关键校验规则（节点ID格式、inputs/outputs 要求）
- dtype 映射规则（bool/int/float/string）
- 设备控制常见模式

只有理解这些规则后才能正确构建 nodes 数组。小规则可直接使用本工具；超过 10 个节点的复杂规则应使用 graph_draft 工具分块上传，避免在上下文中重复传输完整节点图。

系统会自动进行节点布局和连接完整性校验。

参数：
  - name (string): 规则名称
  - nodes (array): 节点列表，包含触发器、条件、动作等（必须符合 mijia-automation Skill 中的模板规范）
  - variables (array, optional): 同时创建的本规则变量；节点中使用 scope="rule"，系统会替换为真实作用域
  - enable (boolean, optional): 是否立即启用，默认 true

返回：
  - graphId: 创建的规则ID

错误处理：
  - "规则校验失败" - 节点连接不完整或不符合规范
  - "网关未连接" - 请先调用 mijia_auth`,
      inputSchema: z.object({
        name: z.string().min(1).describe("规则名称"),
        nodes: z.array(z.any()).describe("节点列表"),
        variables: z.array(GraphVariableSchema).optional().describe("本规则变量定义；节点引用时 scope 使用 rule"),
        enable: z.boolean().default(true).describe("是否启用，默认 true"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ name, nodes, variables, enable }) => {
      try {
        gatewayManager.ensureConnected();
        const result = await createGraph(gatewayManager.gateway!, { name, nodes, variables, enable });

        if (!result.success) {
          return {
            content: [{ type: "text", text: handleError(new Error(result.error), "create_graph") }],
            isError: true,
          };
        }

        const output = { graphId: result.data?.graphId, message: result.message };

        return {
          content: [{ type: "text", text: formatJson(output) }],
          structuredContent: output,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleError(error, "create_graph") }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "mijia_graph_draft_begin",
    {
      title: "开始复杂规则草稿",
      description: "为复杂规则创建内存草稿。超过 10 个节点时优先使用：先开始草稿，再分块追加节点，最后仅用 draftId 提交。草稿 30 分钟后自动过期。",
      inputSchema: z.object({
        name: z.string().min(1).describe("规则名称"),
        variables: z.array(GraphVariableSchema).optional().describe("本规则变量定义；节点引用时 scope 使用 rule"),
        enable: z.boolean().default(true).describe("创建后是否启用"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ name, variables, enable }) => {
      try {
        const draftId = drafts.begin({ name, variables, enable });
        const output = { draftId, nodeCount: 0, message: "草稿已创建，请分块追加节点" };
        return { content: [{ type: "text", text: formatJson(output) }], structuredContent: { ...output } };
      } catch (error) {
        return { content: [{ type: "text", text: handleError(error, "graph_draft_begin") }], isError: true };
      }
    }
  );

  server.registerTool(
    "mijia_graph_draft_append",
    {
      title: "追加复杂规则节点",
      description: "向规则草稿追加一小批节点。每个节点只需上传一次；建议每批 5 至 10 个节点，单批不超过 128 KiB。相同节点重试视为成功，内容变化时使用 edit。",
      inputSchema: z.object({
        draftId: z.string().uuid().describe("草稿 ID"),
        nodes: z.array(GraphNodeSchema).min(1).max(25).describe("本批节点，最多 25 个"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ draftId, nodes }) => {
      try {
        const result = drafts.append(draftId, nodes);
        const output = { draftId, ...result };
        return { content: [{ type: "text", text: formatJson(output) }], structuredContent: { ...output } };
      } catch (error) {
        return { content: [{ type: "text", text: handleError(error, "graph_draft_append") }], isError: true };
      }
    }
  );

  server.registerTool(
    "mijia_graph_draft_edit",
    {
      title: "编辑复杂规则草稿",
      description: "按节点 ID 替换、增加或删除草稿节点。校验失败后只需修正相关节点，不必重传完整规则。",
      inputSchema: z.object({
        draftId: z.string().uuid().describe("草稿 ID"),
        upsert: z.array(GraphNodeSchema).max(25).optional().describe("新增或替换的节点"),
        removeIds: z.array(z.string()).max(25).optional().describe("要删除的节点 ID"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ draftId, upsert = [], removeIds = [] }) => {
      try {
        const output = drafts.edit(draftId, upsert, removeIds);
        return { content: [{ type: "text", text: formatJson(output) }], structuredContent: { ...output } };
      } catch (error) {
        return { content: [{ type: "text", text: handleError(error, "graph_draft_edit") }], isError: true };
      }
    }
  );

  server.registerTool(
    "mijia_graph_draft_status",
    {
      title: "查看复杂规则草稿状态",
      description: "返回草稿状态、节点数量、节点 ID、过期时间和已创建的规则 ID，不返回完整节点内容。",
      inputSchema: z.object({ draftId: z.string().uuid().describe("草稿 ID") }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ draftId }) => {
      try {
        const output = drafts.status(draftId);
        return { content: [{ type: "text", text: formatJson(output) }], structuredContent: { ...output } };
      } catch (error) {
        return { content: [{ type: "text", text: handleError(error, "graph_draft_status") }], isError: true };
      }
    }
  );

  server.registerTool(
    "mijia_graph_draft_commit",
    {
      title: "校验并提交复杂规则草稿",
      description: "仅传 draftId，服务端会对完整草稿执行结构校验、真实设备能力校验、自动布局和规则创建。成功后保留提交结果供幂等重试，失败时恢复为可编辑状态。",
      inputSchema: z.object({ draftId: z.string().uuid().describe("草稿 ID") }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ draftId }) => {
      let commitToken: string | undefined;
      try {
        gatewayManager.ensureConnected();
        const commit = drafts.beginCommit(draftId);
        commitToken = commit.commitToken;
        if (commit.committedGraphId) {
          const output = { graphId: commit.committedGraphId, message: "草稿已提交" };
          return { content: [{ type: "text", text: formatJson(output) }], structuredContent: output };
        }
        const result = await createGraph(gatewayManager.gateway!, commit.input!);
        if (!result.success) {
          return { content: [{ type: "text", text: restoreDraftError(draftId, commitToken, new Error(result.error)) }], isError: true };
        }
        const summary = drafts.completeCommit(draftId, result.data!.graphId, commitToken);
        const output = { graphId: summary.graphId, nodeCount: summary.nodeCount, message: result.message };
        return { content: [{ type: "text", text: formatJson(output) }], structuredContent: output };
      } catch (error) {
        return { content: [{ type: "text", text: restoreDraftError(draftId, commitToken, error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "mijia_graph_draft_discard",
    {
      title: "丢弃复杂规则草稿",
      description: "丢弃尚未提交或已提交的临时草稿记录，不删除已创建的网关规则或变量。",
      inputSchema: z.object({ draftId: z.string().uuid().describe("草稿 ID") }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ draftId }) => {
      try {
        const discarded = drafts.delete(draftId);
        const output = { draftId, discarded };
        return { content: [{ type: "text", text: formatJson(output) }], structuredContent: output };
      } catch (error) {
        return { content: [{ type: "text", text: handleError(error, "graph_draft_discard") }], isError: true };
      }
    }
  );

  // ==================== mijia_update_graph ====================
  server.registerTool(
    "mijia_update_graph",
    {
      title: "更新自动化规则",
      description: `更新现有自动化规则。

⚠️ 重要：如果更新 nodes 节点列表，你必须先阅读并理解 mijia-automation Skill 中的规则创建指南（使用 Skill 工具加载）。该 Skill 包含完整的节点模板、连接规则和校验要求。

如果只需要更新规则名称或启用状态，无需加载 Skill。

参数：
  - id (string): 规则ID
  - name (string, optional): 新规则名称
  - nodes (array, optional): 新节点列表（必须符合 mijia-automation Skill 中的模板规范）
  - enable (boolean, optional): 是否启用

返回：
  - success: 是否成功
  
注意：更新 nodes 时会自动进行节点布局（保留原有位置信息）和连接完整性校验。`,
      inputSchema: z.object({
        id: z.string().describe("规则ID"),
        name: z.string().optional().describe("新规则名称"),
        nodes: z.array(z.any()).optional().describe("新节点列表"),
        enable: z.boolean().optional().describe("是否启用"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ id, name, nodes, enable }) => {
      try {
        gatewayManager.ensureConnected();
        const result = await updateGraph(gatewayManager.gateway!, id, { name, nodes, enable });

        if (!result.success) {
          return {
            content: [{ type: "text", text: handleError(new Error(result.error), "update_graph") }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: result.message || "更新成功" }],
          structuredContent: { success: true },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleError(error, "update_graph") }],
          isError: true,
        };
      }
    }
  );

  // ==================== mijia_delete_graph ====================
  server.registerTool(
    "mijia_delete_graph",
    {
      title: "删除自动化规则",
      description: `删除指定的自动化规则，并清理对应的本规则变量作用域。

此操作不可恢复，请确认后再执行。

参数：
  - id (string): 规则ID`,
      inputSchema: z.object({
        id: z.string().describe("规则ID"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ id }) => {
      try {
        gatewayManager.ensureConnected();
        const result = await deleteGraph(gatewayManager.gateway!, id);

        if (!result.success) {
          return {
            content: [{ type: "text", text: handleError(new Error(result.error), "delete_graph") }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: result.message || "删除成功" }],
          structuredContent: { success: true, id },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleError(error, "delete_graph") }],
          isError: true,
        };
      }
    }
  );

  // ==================== mijia_toggle_graph ====================
  server.registerTool(
    "mijia_toggle_graph",
    {
      title: "切换规则状态",
      description: `启用或禁用指定的自动化规则。

参数：
  - id (string): 规则ID
  - enable (boolean): 是否启用`,
      inputSchema: z.object({
        id: z.string().describe("规则ID"),
        enable: z.boolean().describe("是否启用"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ id, enable }) => {
      try {
        gatewayManager.ensureConnected();
        const result = await toggleGraph(gatewayManager.gateway!, id, enable);

        if (!result.success) {
          return {
            content: [{ type: "text", text: handleError(new Error(result.error), "toggle_graph") }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: result.message || (enable ? "规则已启用 ✅" : "规则已禁用 ❌") }],
          structuredContent: { success: true, id, enable },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleError(error, "toggle_graph") }],
          isError: true,
        };
      }
    }
  );

  // ==================== mijia_validate_graph ====================
  server.registerTool(
    "mijia_validate_graph",
    {
      title: "校验规则完整性",
      description: `校验自动化规则的节点连接完整性。

⚠️ 建议：在调用此工具前，先阅读 mijia-automation Skill 了解节点构建规范（使用 Skill 工具加载）。该 Skill 包含所有节点模板和连接规则。

此校验器会检查 mijia-automation Skill 中定义的关键规则：
- 节点 ID 格式（只允许 [0-9a-zA-Z]）
- outputs 连接格式（必须是 "nodeId.inputPort" 点分隔格式）
- state 节点 vs event 节点的正确使用
- deviceGet 必须有 output 和 output2
- condition 必须有 trigger 和 condition 两个输入源
- delay 节点的 inputs 必须用 "input" 而非 "trigger"
- timeRange 可连接 condition.condition，或经 logicOr/logicAnd/logicNot 最终连接 condition.condition
- 所有节点的 props、inputs、outputs 必须存在

参数：
  - graph (object): 完整规则对象
    - id (string): 规则ID
    - nodes (array): 节点列表（必须符合 mijia-automation Skill 规范）
    - cfg (object): 规则配置

返回：
  - errors: 错误列表
  - warnings: 警告列表
  - valid: 是否有效（无错误）`,
      inputSchema: z.object({
        graph: z.object({
          id: z.string().describe("规则ID"),
          nodes: z.array(z.any()).describe("节点列表"),
          cfg: z.object({
            id: z.string().describe("规则ID"),
            enable: z.boolean().describe("是否启用"),
            uiType: z.string().describe("UI类型"),
            userData: z.object({
              name: z.string().describe("规则名称"),
              lastUpdateTime: z.number().describe("最后更新时间戳"),
              transform: z.object({
                x: z.number(),
                y: z.number(),
                scale: z.number(),
                rotate: z.number(),
              }),
            }),
          }),
        }).describe("完整规则对象"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ graph }) => {
      try {
        const errors = validateGraph(graph);
        const errorList = errors.filter((e) => e.level === "error");
        const warnList = errors.filter((e) => e.level === "warn");

        const output = {
          valid: errorList.length === 0,
          errors: errorList,
          warnings: warnList,
          errorCount: errorList.length,
          warningCount: warnList.length,
        };

        const lines = [errorList.length === 0 ? "✅ 规则校验通过" : `❌ 规则校验失败 (${errorList.length} 个错误)`];

        if (errorList.length > 0) {
          lines.push("", "### 错误");
          for (const e of errorList) {
            lines.push(`- [${e.nodeId}] ${e.message}`);
          }
        }

        if (warnList.length > 0) {
          lines.push("", "### 警告");
          for (const w of warnList) {
            lines.push(`- [${w.nodeId}] ${w.message}`);
          }
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: output,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleError(error, "validate_graph") }],
          isError: true,
        };
      }
    }
  );
}
