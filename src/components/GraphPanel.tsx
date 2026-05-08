'use client';

import React, {useCallback, useMemo, useState} from 'react';
import {
    Typography,
    Button,
    Empty,
    Spin,
    Space,
    Tag,
    Popconfirm,
    Switch,
    Drawer,
    Descriptions,
    Divider,
    Alert,
    Collapse,
    message,
} from 'antd';
import {
    SyncOutlined,
    DeleteOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    ClockCircleOutlined,
    EyeOutlined,
    ApartmentOutlined,
    BranchesOutlined,
    ExclamationCircleOutlined,
} from '@ant-design/icons';

const {Text, Paragraph} = Typography;

interface DeviceSummary {
    did: string;
    name: string;
    model?: string;
    modelName?: string;
    roomName?: string;
}

interface GraphSummary {
    id: string;
    name: string;
    enable: boolean;
    lastUpdateTime?: number;
}

interface GraphPanelProps {
    graphs: GraphSummary[];
    devices?: DeviceSummary[];
    loading?: boolean;
    onRefresh: () => void;
    onToggle: (id: string, enable: boolean) => void;
    onDelete: (id: string) => void;
}

interface GraphNode {
    id: string;
    type: string;
    cfg?: Record<string, unknown>;
    props?: Record<string, unknown>;
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
}

interface GraphDetail {
    id: string;
    nodes: GraphNode[];
    cfg: {
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
        [key: string]: unknown;
    };
}

interface ValidationIssue {
    nodeId: string;
    type: string;
    level: 'error' | 'warn';
    message: string;
}

interface ValidationResult {
    success: boolean;
    valid: boolean;
    errorCount: number;
    warningCount: number;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    message?: string;
    error?: string;
}

interface GraphNarrative {
    when: string[];
    ifs: string[];
    then: string[];
    flow: string[];
    other: string[];
}

const TRIGGER_TYPES = new Set(['deviceInput', 'alarmClock', 'onLoad', 'varChange']);
const CONDITION_TYPES = new Set([
    'timeRange',
    'condition',
    'logicOr',
    'logicAnd',
    'logicNot',
    'deviceGet',
    'varGet',
    'statusLast',
    'deviceInputSetVar',
    'deviceGetSetVar',
    'register',
]);
const ACTION_TYPES = new Set(['deviceOutput', 'varSetNumber', 'varSetString', 'setVariable']);
const FLOW_TYPES = new Set(['delay', 'signalOr', 'loop', 'onlyNTimes', 'counter', 'modeSwitch', 'eventSequence']);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
    const value = record[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
    const value = record[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function formatTimePart(value: unknown): string {
    return typeof value === 'number' && Number.isFinite(value)
        ? String(value).padStart(2, '0')
        : '00';
}

function formatClock(value: unknown): string {
    if (!isRecord(value)) return '00:00';
    return `${formatTimePart(value.hour)}:${formatTimePart(value.minute)}`;
}

function formatDuration(ms?: number): string {
    if (!ms || !Number.isFinite(ms)) return '未知时长';
    if (ms < 1000) return `${ms} 毫秒`;

    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds} 秒`;

    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} 分钟`;

    const hours = Math.round(minutes / 60);
    return `${hours} 小时`;
}

function formatValue(value: unknown): string {
    if (typeof value === 'boolean') return value ? '开启/是' : '关闭/否';
    if (typeof value === 'number' || typeof value === 'string') return String(value);
    if (value === null || value === undefined) return '空';
    return JSON.stringify(value);
}

function describeOperator(props: Record<string, unknown>): string {
    const operator = readString(props, 'operator') || readString(props, 'op') || '=';
    const value = props.v1 ?? props.value;
    if (value === undefined) return '';
    return `${operator} ${formatValue(value)}`;
}

function getDeviceName(props: Record<string, unknown>, deviceNameByDid: Map<string, string>): string {
    const did = readString(props, 'did');
    if (!did) return '设备';
    return deviceNameByDid.get(did) || did;
}

function describeDeviceInput(props: Record<string, unknown>, deviceNameByDid: Map<string, string>): string {
    const deviceName = getDeviceName(props, deviceNameByDid);
    const siid = props.siid;
    const piid = props.piid;
    const eiid = props.eiid;

    if (eiid !== undefined) {
        return `${deviceName} 事件 ${siid ?? '-'}/${eiid}`;
    }

    if (piid !== undefined) {
        const operator = describeOperator(props);
        return `${deviceName} 属性 ${siid ?? '-'}/${piid}${operator ? ` ${operator}` : ' 变化'}`;
    }

    return `${deviceName} 触发`;
}

function describeDeviceOutput(props: Record<string, unknown>, deviceNameByDid: Map<string, string>): string {
    const deviceName = getDeviceName(props, deviceNameByDid);
    const siid = props.siid;
    const piid = props.piid;
    const aiid = props.aiid;

    if (piid !== undefined) {
        return `${deviceName} 设置属性 ${siid ?? '-'}/${piid} 为 ${formatValue(props.value)}`;
    }

    if (aiid !== undefined) {
        const ins = Array.isArray(props.ins) ? props.ins : props.params;
        return `${deviceName} 执行动作 ${siid ?? '-'}/${aiid}${ins ? `，参数 ${formatValue(ins)}` : ''}`;
    }

    return `${deviceName} 执行动作`;
}

function describeVariable(props: Record<string, unknown>): string {
    const scope = readString(props, 'scope') || 'global';
    const id = readString(props, 'id') || '未命名变量';
    return `${scope}/${id}`;
}

function describeNode(node: GraphNode, deviceNameByDid: Map<string, string>): string {
    const props = isRecord(node.props) ? node.props : {};

    switch (node.type) {
        case 'deviceInput':
            return describeDeviceInput(props, deviceNameByDid);
        case 'deviceOutput':
            return describeDeviceOutput(props, deviceNameByDid);
        case 'alarmClock':
            return `定时 ${formatTimePart(props.hour)}:${formatTimePart(props.minute)}`;
        case 'onLoad':
            return '规则启用时触发';
        case 'timeRange':
            return `${formatClock(props.start)}-${formatClock(props.end)}`;
        case 'condition':
            return '条件判断';
        case 'delay':
            return `延时 ${formatDuration(readNumber(props, 'timeout'))}`;
        case 'signalOr':
            return '任一事件满足';
        case 'logicOr':
            return '任一条件满足';
        case 'logicAnd':
            return '全部条件满足';
        case 'logicNot':
            return '条件取反';
        case 'loop':
            return `循环间隔 ${formatDuration(readNumber(props, 'interval'))}`;
        case 'onlyNTimes':
            return `最多触发 ${formatValue(props.n)} 次`;
        case 'counter':
            return `累计 ${formatValue(props.n)} 次后触发`;
        case 'statusLast':
            return `状态持续 ${formatDuration(readNumber(props, 'timeout'))}`;
        case 'eventSequence':
            return `按顺序发生，超时 ${formatDuration(readNumber(props, 'timeout'))}`;
        case 'varChange':
            return `变量 ${describeVariable(props)} ${describeOperator(props) || '变化'}`;
        case 'varGet':
            return `读取变量 ${describeVariable(props)} ${describeOperator(props)}`;
        case 'varSetNumber':
            return `更新数值变量 ${describeVariable(props)}`;
        case 'varSetString':
            return `更新文本变量 ${describeVariable(props)}`;
        case 'deviceGet':
            return `读取 ${describeDeviceInput(props, deviceNameByDid)}`;
        case 'deviceInputSetVar':
            return `${describeDeviceInput(props, deviceNameByDid)} 并写入变量 ${describeVariable(props)}`;
        case 'deviceGetSetVar':
            return `读取设备状态并写入变量 ${describeVariable(props)}`;
        case 'register':
            return '自定义布尔状态';
        case 'modeSwitch':
            return '模式分支';
        default:
            return `${node.type} (${node.id})`;
    }
}

function buildGraphNarrative(graph: GraphDetail, deviceNameByDid: Map<string, string>): GraphNarrative {
    const narrative: GraphNarrative = {when: [], ifs: [], then: [], flow: [], other: []};

    for (const node of graph.nodes) {
        const description = describeNode(node, deviceNameByDid);

        if (TRIGGER_TYPES.has(node.type)) {
            narrative.when.push(description);
        } else if (ACTION_TYPES.has(node.type)) {
            narrative.then.push(description);
        } else if (CONDITION_TYPES.has(node.type)) {
            narrative.ifs.push(description);
        } else if (FLOW_TYPES.has(node.type)) {
            narrative.flow.push(description);
        } else {
            narrative.other.push(description);
        }
    }

    return narrative;
}

function normalizeGraphDetail(value: unknown, fallback: GraphSummary): GraphDetail {
    const graph = isRecord(value) ? value : {};
    const cfg = isRecord(graph.cfg) ? graph.cfg : {};
    const userData = isRecord(cfg.userData) ? cfg.userData : {};
    const transform = isRecord(userData.transform) ? userData.transform : {};

    const id = readString(graph, 'id') || readString(cfg, 'id') || fallback.id;
    const name = readString(userData, 'name') || fallback.name || id;
    const lastUpdateTime = readNumber(userData, 'lastUpdateTime') || fallback.lastUpdateTime || Date.now();
    const enable = typeof cfg.enable === 'boolean' ? cfg.enable : fallback.enable;
    const nodes = Array.isArray(graph.nodes) ? graph.nodes as GraphNode[] : [];

    return {
        id,
        nodes,
        cfg: {
            ...cfg,
            id,
            enable,
            uiType: readString(cfg, 'uiType') || 'graph',
            userData: {
                ...userData,
                name,
                lastUpdateTime,
                transform: {
                    x: readNumber(transform, 'x') ?? 0,
                    y: readNumber(transform, 'y') ?? 0,
                    scale: readNumber(transform, 'scale') ?? 1,
                    rotate: readNumber(transform, 'rotate') ?? 0,
                },
            },
        },
    };
}

/**
 * 格式化时间
 */
function formatTime(timestamp?: number): string {
    if (!timestamp) return '未知';

    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    // 1分钟内
    if (diff < 60 * 1000) {
        return '刚刚';
    }

    // 1小时内
    if (diff < 60 * 60 * 1000) {
        const minutes = Math.floor(diff / (60 * 1000));
        return `${minutes}分钟前`;
    }

    // 24小时内
    if (diff < 24 * 60 * 60 * 1000) {
        const hours = Math.floor(diff / (60 * 60 * 1000));
        return `${hours}小时前`;
    }

    // 更早
    return date.toLocaleDateString('zh-CN', {month: 'numeric', day: 'numeric'});
}

export default function GraphPanel({
                                       graphs,
                                       devices = [],
                                       loading = false,
                                       onRefresh,
                                       onToggle,
                                       onDelete,
                                   }: GraphPanelProps) {
    const [detailOpen, setDetailOpen] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [validationLoading, setValidationLoading] = useState(false);
    const [selectedGraph, setSelectedGraph] = useState<GraphDetail | null>(null);
    const [validation, setValidation] = useState<ValidationResult | null>(null);

    const deviceNameByDid = useMemo(() => {
        const map = new Map<string, string>();
        for (const device of devices) {
            map.set(device.did, device.name);
        }
        return map;
    }, [devices]);

    const loadGraphDetail = useCallback(async (summary: GraphSummary) => {
        setDetailOpen(true);
        setDetailLoading(true);
        setValidationLoading(false);
        setSelectedGraph(null);
        setValidation(null);

        try {
            const response = await fetch(`/api/graphs?id=${encodeURIComponent(summary.id)}`);
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || result.error || '加载规则详情失败');
            }

            const graph = normalizeGraphDetail(result.graph, summary);
            setSelectedGraph(graph);
            setValidationLoading(true);

            try {
                const validationResponse = await fetch('/api/graphs/validate', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({graph}),
                });
                const validationResult = await validationResponse.json();

                if (!validationResponse.ok || !validationResult.success) {
                    throw new Error(validationResult.message || validationResult.error || '规则校验失败');
                }

                setValidation(validationResult);
            } catch (error) {
                setValidation({
                    success: false,
                    valid: false,
                    errorCount: 0,
                    warningCount: 0,
                    errors: [],
                    warnings: [],
                    error: error instanceof Error ? error.message : String(error),
                });
            } finally {
                setValidationLoading(false);
            }
        } catch (error) {
            message.error(error instanceof Error ? error.message : '加载规则详情失败');
        } finally {
            setDetailLoading(false);
        }
    }, []);

    const closeDetail = useCallback(() => {
        setDetailOpen(false);
    }, []);

    const narrative = useMemo(() => {
        if (!selectedGraph) return null;
        return buildGraphNarrative(selectedGraph, deviceNameByDid);
    }, [deviceNameByDid, selectedGraph]);

    const renderNarrativeLine = (label: string, items: string[], color: string) => {
        if (items.length === 0) return null;

        return (
            <div style={{display: 'flex', gap: 10, marginBottom: 10}}>
                <Tag color={color} style={{height: 22, marginInlineEnd: 0}}>{label}</Tag>
                <Text style={{fontSize: 13, lineHeight: '22px'}}>
                    {items.join('；')}
                </Text>
            </div>
        );
    };

    const renderValidation = () => {
        if (validationLoading) {
            return (
                <Space>
                    <Spin size="small"/>
                    <Text type="secondary">正在校验规则结构...</Text>
                </Space>
            );
        }

        if (!validation) return null;

        if (!validation.success && validation.error) {
            return (
                <Alert
                    type="warning"
                    showIcon
                    message="校验未完成"
                    description={validation.error}
                />
            );
        }

        const issues = [...(validation.errors || []), ...(validation.warnings || [])];
        const type = validation.valid ? 'success' : 'error';

        return (
            <div>
                <Alert
                    type={type}
                    showIcon
                    message={validation.valid ? '规则校验通过' : `发现 ${validation.errorCount} 个错误`}
                    description={`错误 ${validation.errorCount} 个，警告 ${validation.warningCount} 个`}
                />
                {issues.length > 0 && (
                    <Collapse
                        size="small"
                        style={{marginTop: 10}}
                        items={[{
                            key: 'issues',
                            label: '查看校验详情',
                            children: (
                                <Space direction="vertical" size={8} style={{width: '100%'}}>
                                    {issues.map((issue, index) => (
                                        <div key={`${issue.nodeId}-${issue.type}-${index}`} style={{display: 'flex', gap: 8}}>
                                            <Tag color={issue.level === 'error' ? 'error' : 'warning'} style={{marginInlineEnd: 0}}>
                                                {issue.level === 'error' ? '错误' : '警告'}
                                            </Tag>
                                            <div style={{minWidth: 0}}>
                                                <Text code>{issue.nodeId}</Text>
                                                <Text style={{marginLeft: 8}}>{issue.message}</Text>
                                            </div>
                                        </div>
                                    ))}
                                </Space>
                            ),
                        }]}
                    />
                )}
            </div>
        );
    };

    const renderDetailDrawer = () => (
        <Drawer
            title={selectedGraph?.cfg.userData.name || '规则详情'}
            width={640}
            open={detailOpen}
            onClose={closeDetail}
            destroyOnClose
        >
            {detailLoading ? (
                <div style={{textAlign: 'center', padding: 48}}>
                    <Spin/>
                </div>
            ) : !selectedGraph ? (
                <Empty description="未加载规则详情"/>
            ) : (
                <div>
                    <Descriptions
                        size="small"
                        column={1}
                        items={[
                            {key: 'id', label: '规则 ID', children: <Text code copyable>{selectedGraph.id}</Text>},
                            {
                                key: 'status',
                                label: '状态',
                                children: (
                                    <Tag color={selectedGraph.cfg.enable ? 'success' : 'default'}>
                                        {selectedGraph.cfg.enable ? '启用' : '禁用'}
                                    </Tag>
                                ),
                            },
                            {key: 'nodes', label: '节点数', children: `${selectedGraph.nodes.length} 个`},
                            {key: 'updated', label: '更新时间', children: formatTime(selectedGraph.cfg.userData.lastUpdateTime)},
                        ]}
                    />

                    <Divider/>

                    <Space size={8} style={{marginBottom: 12}}>
                        <ApartmentOutlined style={{color: 'var(--accent)'}}/>
                        <Text strong>规则摘要</Text>
                    </Space>
                    {narrative && (narrative.when.length || narrative.ifs.length || narrative.then.length || narrative.flow.length || narrative.other.length) ? (
                        <div>
                            {renderNarrativeLine('当', narrative.when, 'processing')}
                            {renderNarrativeLine('如果', narrative.ifs, 'warning')}
                            {renderNarrativeLine('流程', narrative.flow, 'default')}
                            {renderNarrativeLine('就', narrative.then, 'success')}
                            {renderNarrativeLine('其他', narrative.other, 'default')}
                        </div>
                    ) : (
                        <Paragraph type="secondary" style={{marginBottom: 0}}>
                            暂无可读摘要，可能是空规则或未知节点类型。
                        </Paragraph>
                    )}

                    <Divider/>

                    <Space size={8} style={{marginBottom: 12}}>
                        <ExclamationCircleOutlined style={{color: 'var(--accent)'}}/>
                        <Text strong>结构校验</Text>
                    </Space>
                    {renderValidation()}

                    <Divider/>

                    <Collapse
                        size="small"
                        items={[{
                            key: 'json',
                            label: (
                                <Space>
                                    <BranchesOutlined/>
                                    <span>原始 JSON</span>
                                </Space>
                            ),
                            children: (
                                <pre style={{
                                    margin: 0,
                                    maxHeight: 320,
                                    overflow: 'auto',
                                    padding: 12,
                                    borderRadius: 6,
                                    background: 'var(--bg-elevated)',
                                    border: '1px solid var(--border-subtle)',
                                    fontSize: 12,
                                    lineHeight: 1.5,
                                }}>
                                    {JSON.stringify(selectedGraph, null, 2)}
                                </pre>
                            ),
                        }]}
                    />
                </div>
            )}
        </Drawer>
    );

    return (
        <div style={{height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column'}}>
            {/* 头部 */}
            <div style={{padding: '12px 0', borderBottom: '1px solid var(--border-subtle)'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <Text strong>自动化规则</Text>
                    <Button
                        icon={<SyncOutlined/>}
                        size="small"
                        onClick={onRefresh}
                        loading={loading}
                    >
                        刷新
                    </Button>
                </div>
                {graphs.length > 0 && (
                    <div style={{marginTop: 8}}>
                        <Tag color="success">启用: {graphs.filter(g => g.enable).length}</Tag>
                        <Tag color="default">禁用: {graphs.filter(g => !g.enable).length}</Tag>
                    </div>
                )}
            </div>

            {/* Graph 列表 */}
            <div style={{flex: 1, minHeight: 0, overflow: 'auto'}}>
                {loading ? (
                    <div style={{textAlign: 'center', padding: 40}}>
                        <Spin/>
                    </div>
                ) : graphs.length === 0 ? (
                    <div style={{padding: 24}}>
                        <Empty
                            description="暂无自动化规则"
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                        />
                    </div>
                ) : (
                    graphs.map(graph => (
                        <div
                            key={graph.id}
                            style={{
                                padding: '12px 0',
                                borderBottom: '1px solid var(--border-subtle)',
                            }}
                        >
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                                <div style={{flex: 1, minWidth: 0}}>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        marginBottom: 6,
                                        gap: 8,
                                    }}>
                                        {graph.enable ? (
                                            <CheckCircleOutlined style={{color: '#52c41a', fontSize: 14}}/>
                                        ) : (
                                            <CloseCircleOutlined style={{color: 'var(--text-muted)', fontSize: 14}}/>
                                        )}
                                        <Text
                                            strong
                                            style={{
                                                fontSize: 14,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {graph.name}
                                        </Text>
                                        <Tag color={graph.enable ? 'success' : 'default'}>
                                            {graph.enable ? '启用' : '禁用'}
                                        </Tag>
                                    </div>

                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        paddingLeft: 22,
                                        marginBottom: 8,
                                    }}>
                                        <Space size={4}>
                                            <ClockCircleOutlined style={{fontSize: 11, color: 'var(--text-muted)'}}/>
                                            <Text type="secondary" style={{fontSize: 11}}>
                                                {formatTime(graph.lastUpdateTime)}
                                            </Text>
                                        </Space>
                                    </div>

                                    <div style={{paddingLeft: 22}}>
                                        <Space size={8}>
                                            <Button
                                                type="text"
                                                size="small"
                                                icon={<EyeOutlined/>}
                                                onClick={() => loadGraphDetail(graph)}
                                            >
                                                查看
                                            </Button>
                                            <Switch
                                                size="small"
                                                checked={graph.enable}
                                                onChange={(checked) => onToggle(graph.id, checked)}
                                            />
                                            <Popconfirm
                                                title="确定删除此规则？"
                                                onConfirm={() => onDelete(graph.id)}
                                                okText="删除"
                                                cancelText="取消"
                                            >
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    danger
                                                    icon={<DeleteOutlined/>}
                                                >
                                                    删除
                                                </Button>
                                            </Popconfirm>
                                        </Space>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
            {renderDetailDrawer()}
        </div>
    );
}
