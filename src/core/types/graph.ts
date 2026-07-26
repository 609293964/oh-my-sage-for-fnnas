/**
 * Core - 规则类型定义
 */

/** 规则节点 */
export interface GraphNode {
    id: string;
    type: string;
    cfg: Record<string, unknown>;
    props: Record<string, unknown>;
    inputs: Record<string, unknown>;
    outputs: Record<string, string[]>;
}

/** 规则配置 */
export interface GraphConfig {
    id: string;
    enable: boolean;
    uiType: string;
    userData: {
        name: string;
        lastUpdateTime: number;
        transform: {
            x: number;
            y: number;
            scale: number;
            rotate: number;
        };
    };
}

/** 规则 */
export interface Graph {
    id: string;
    nodes: GraphNode[];
    cfg: GraphConfig;
}

/** 规则摘要 */
export interface GraphSummary {
    id: string;
    name: string;
    enable: boolean;
    createTime?: number;
    updateTime?: number;
}

/** 创建规则输入 */
export interface CreateGraphInput {
    graphId?: string;
    name: string;
    nodes: GraphNode[];
    enable?: boolean;
    variables?: Array<{
        id: string;
        type: 'number' | 'string';
        value: number | string;
        name?: string;
    }>;
}

export type UpdateGraphInput = Partial<Pick<CreateGraphInput, 'name' | 'nodes' | 'enable'>>;

/** 校验错误 */
export interface ValidationError {
    nodeId: string;
    type: string;
    level: 'error' | 'warn';
    message: string;
}
