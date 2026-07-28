import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomInt, randomUUID } from 'node:crypto';
import type { CreateGraphInput, GraphNode } from '../../core/types/graph.js';

type DraftStatus = 'building' | 'committing' | 'committed';

interface GraphDraft extends Omit<CreateGraphInput, 'nodes'> {
    nodes: GraphNode[];
    status: DraftStatus;
    graphId?: string;
    updatedAt: number;
}

export interface GraphDraftSummary {
    draftId: string;
    name: string;
    status: DraftStatus;
    nodeCount: number;
    nodeIds: string[];
    graphId?: string;
    updatedAt: number;
    expiresAt: number;
}

const DRAFT_TTL_MS = 30 * 60 * 1000;
const MAX_DRAFTS = 20;
const MAX_DRAFT_NODES = 500;
const MAX_APPEND_BYTES = 128 * 1024;
const MAX_DRAFT_BYTES = 2 * 1024 * 1024;
const DEFAULT_STORE_PATH = path.join(os.tmpdir(), 'oh-my-sage-graph-drafts.json');

function clone<T>(value: T): T {
    return structuredClone(value);
}

export class GraphDraftStore {
    private readonly drafts = new Map<string, GraphDraft>();
    private readonly activeCommits = new Map<string, string>();
    private readonly removed = new Set<string>();
    private readonly cleanupTimer: NodeJS.Timeout;

    constructor(private readonly storePath = DEFAULT_STORE_PATH) {
        this.load();
        this.cleanupTimer = setInterval(() => this.prune(), 60_000);
        this.cleanupTimer.unref();
    }

    begin(input: Omit<CreateGraphInput, 'nodes'>): string {
        this.prune();
        if (this.drafts.size >= MAX_DRAFTS) throw new Error(`最多保留 ${MAX_DRAFTS} 个规则草稿`);
        const id = randomUUID();
        this.drafts.set(id, { ...clone(input), nodes: [], status: 'building', updatedAt: Date.now() });
        this.persist();
        return id;
    }

    append(id: string, nodes: GraphNode[]): { nodeCount: number; appended: number } {
        const draft = this.requireBuilding(id);
        if (Buffer.byteLength(JSON.stringify(nodes)) > MAX_APPEND_BYTES) throw new Error('单批节点数据不能超过 128 KiB');
        const existing = new Map(draft.nodes.map((node) => [node.id, node]));
        const candidate = [...draft.nodes];
        let appended = 0;
        for (const node of nodes) {
            const previous = existing.get(node.id);
            if (previous) {
                if (JSON.stringify(previous) === JSON.stringify(node)) continue;
                throw new Error(`节点 ID ${node.id} 已存在且内容不同，请使用草稿编辑工具`);
            }
            const copy = clone(node);
            candidate.push(copy);
            existing.set(copy.id, copy);
            appended++;
        }
        if (Buffer.byteLength(JSON.stringify(candidate)) > MAX_DRAFT_BYTES) throw new Error('规则草稿不能超过 2 MiB');
        draft.nodes = candidate;
        this.touch(draft);
        return { nodeCount: draft.nodes.length, appended };
    }

    edit(id: string, upsert: GraphNode[] = [], removeIds: string[] = []): GraphDraftSummary {
        const draft = this.requireBuilding(id);
        const remove = new Set(removeIds);
        const upserts = new Map(upsert.map((node) => [node.id, clone(node)]));
        const knownIds = new Set(draft.nodes.map((node) => node.id));
        const candidate = draft.nodes
            .filter((node) => !remove.has(node.id))
            .map((node) => upserts.get(node.id) || node);
        for (const [nodeId, node] of upserts) {
            if (!knownIds.has(nodeId) || remove.has(nodeId)) candidate.push(node);
        }
        if (candidate.length > MAX_DRAFT_NODES) throw new Error(`草稿最多允许 ${MAX_DRAFT_NODES} 个节点`);
        if (Buffer.byteLength(JSON.stringify(candidate)) > MAX_DRAFT_BYTES) throw new Error('规则草稿不能超过 2 MiB');
        draft.nodes = candidate;
        this.touch(draft);
        return this.summary(id, draft);
    }

    status(id: string): GraphDraftSummary {
        const draft = this.get(id);
        return this.summary(id, draft);
    }

    beginCommit(id: string): { input?: CreateGraphInput; committedGraphId?: string; commitToken?: string } {
        const draft = this.get(id);
        if (draft.status === 'committed') return { committedGraphId: draft.graphId };
        if (this.activeCommits.has(id)) throw new Error('规则草稿正在提交，请稍后查询状态');
        if (draft.nodes.length === 0) throw new Error('规则草稿没有节点');
        if (draft.status === 'building') {
            draft.status = 'committing';
            draft.graphId = String(randomInt(1_000_000_000_000, 10_000_000_000_000));
            this.touch(draft);
        }
        const commitToken = randomUUID();
        this.activeCommits.set(id, commitToken);
        return {
            commitToken,
            input: {
                graphId: draft.graphId,
                name: draft.name,
                nodes: clone(draft.nodes),
                variables: clone(draft.variables),
                enable: draft.enable,
            },
        };
    }

    completeCommit(id: string, graphId: string, commitToken?: string): GraphDraftSummary {
        this.releaseCommit(id, commitToken);
        const draft = this.get(id);
        draft.status = 'committed';
        draft.graphId = graphId;
        this.touch(draft);
        return this.summary(id, draft);
    }

    failCommit(id: string, commitToken?: string): void {
        this.releaseCommit(id, commitToken);
        const draft = this.drafts.get(id);
        if (!draft || draft.status === 'committed') return;
        draft.status = 'building';
        this.touch(draft);
    }

    private releaseCommit(id: string, commitToken?: string): void {
        const activeToken = this.activeCommits.get(id);
        if (!activeToken) return;
        if (!commitToken || activeToken !== commitToken) throw new Error('提交令牌不匹配，不能修改草稿状态');
        this.activeCommits.delete(id);
    }

    delete(id: string): boolean {
        const deleted = this.drafts.delete(id);
        this.removed.add(id);
        if (deleted) this.persist();
        return deleted;
    }

    private requireBuilding(id: string): GraphDraft {
        const draft = this.get(id);
        if (draft.status !== 'building') throw new Error(`规则草稿当前状态为 ${draft.status}，不能修改`);
        return draft;
    }

    private get(id: string): GraphDraft {
        this.prune();
        const draft = this.drafts.get(id);
        if (!draft) throw new Error('规则草稿不存在或已过期');
        return draft;
    }

    private summary(id: string, draft: GraphDraft): GraphDraftSummary {
        return {
            draftId: id,
            name: draft.name,
            status: draft.status,
            nodeCount: draft.nodes.length,
            nodeIds: draft.nodes.map((node) => node.id),
            graphId: draft.graphId,
            updatedAt: draft.updatedAt,
            expiresAt: draft.updatedAt + DRAFT_TTL_MS,
        };
    }

    private touch(draft: GraphDraft): void {
        draft.updatedAt = Date.now();
        this.persist();
    }

    private prune(): void {
        const cutoff = Date.now() - DRAFT_TTL_MS;
        let changed = false;
        for (const [id, draft] of this.drafts) {
            if (draft.updatedAt < cutoff) {
                this.drafts.delete(id);
                this.removed.add(id);
                changed = true;
            }
        }
        if (changed) this.persist();
    }

    private readStore(): Record<string, GraphDraft> {
        try {
            return JSON.parse(fs.readFileSync(this.storePath, 'utf8')) as Record<string, GraphDraft>;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error('[GraphDraft] 读取草稿失败', error);
            return {};
        }
    }

    private load(): void {
        const cutoff = Date.now() - DRAFT_TTL_MS;
        for (const [id, draft] of Object.entries(this.readStore())) {
            if (draft.updatedAt >= cutoff) this.drafts.set(id, draft);
        }
    }

    private persist(): void {
        const directory = path.dirname(this.storePath);
        fs.mkdirSync(directory, { recursive: true });
        // ponytail: last-write-wins merge, switch to a file lock if drafts ever need cross-process edits of the same id
        const cutoff = Date.now() - DRAFT_TTL_MS;
        const merged: Record<string, GraphDraft> = {};
        for (const [id, draft] of Object.entries(this.readStore())) {
            if (this.removed.has(id) || this.drafts.has(id) || draft.updatedAt < cutoff) continue;
            merged[id] = draft;
        }
        for (const [id, draft] of this.drafts) merged[id] = draft;
        const temporary = `${this.storePath}.${process.pid}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify(merged));
        fs.renameSync(temporary, this.storePath);
    }
}
