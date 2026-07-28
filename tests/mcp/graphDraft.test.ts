import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { GraphNode } from '../../src/core/types/graph';
import { GraphDraftStore } from '../../src/mcp/tools/graphDraft';

function node(id: string, type = 'onLoad'): GraphNode {
    return { id, type, cfg: {}, props: {}, inputs: {}, outputs: { output: [] } };
}

function withStore(run: (store: GraphDraftStore, file: string) => void): void {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oh-my-sage-draft-'));
    const file = path.join(directory, 'drafts.json');
    try {
        run(new GraphDraftStore(file), file);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
}

test('复杂规则草稿分块追加并保留节点顺序', () => withStore((drafts) => {
    const id = drafts.begin({ name: 'test', enable: false });
    assert.deepEqual(drafts.append(id, [node('a'), node('b')]), { nodeCount: 2, appended: 2 });
    assert.deepEqual(drafts.append(id, [node('c')]), { nodeCount: 3, appended: 1 });
    assert.deepEqual(drafts.status(id).nodeIds, ['a', 'b', 'c']);
}));

test('并发进程共用草稿文件时不会互相覆盖', () => withStore((first, file) => {
    const second = new GraphDraftStore(file);
    const firstId = first.begin({ name: 'first' });
    const secondId = second.begin({ name: 'second' });
    first.append(firstId, [node('a')]);
    second.append(secondId, [node('b')]);

    const restored = new GraphDraftStore(file);
    assert.deepEqual(restored.status(firstId).nodeIds, ['a']);
    assert.deepEqual(restored.status(secondId).nodeIds, ['b']);
}));

test('相同节点重试幂等，内容变化时要求编辑', () => withStore((drafts) => {
    const id = drafts.begin({ name: 'test' });
    drafts.append(id, [node('same')]);
    assert.deepEqual(drafts.append(id, [node('same')]), { nodeCount: 1, appended: 0 });
    assert.throws(() => drafts.append(id, [node('same', 'delay')]), /编辑工具/);
}));

test('复杂规则草稿支持替换、删除和新增节点', () => withStore((drafts) => {
    const id = drafts.begin({ name: 'test' });
    drafts.append(id, [node('a'), node('b')]);
    const result = drafts.edit(id, [node('a', 'delay'), node('c')], ['b']);
    assert.deepEqual(result.nodeIds, ['a', 'c']);
    const commit = drafts.beginCommit(id);
    assert.deepEqual(commit.input?.nodes.map((item) => item.type), ['delay', 'onLoad']);
}));

test('重复删除已不存在节点保持幂等', () => withStore((drafts) => {
    const id = drafts.begin({ name: 'test' });
    drafts.append(id, [node('a')]);
    drafts.edit(id, [], ['a']);
    assert.doesNotThrow(() => drafts.edit(id, [], ['a']));
}));

test('草稿可从磁盘恢复并保留提交中的固定规则 ID', () => withStore((drafts, file) => {
    const id = drafts.begin({ name: 'test' });
    drafts.append(id, [node('a')]);
    const first = drafts.beginCommit(id);
    const restored = new GraphDraftStore(file);
    assert.equal(restored.status(id).status, 'committing');
    assert.equal(restored.beginCommit(id).input?.graphId, first.input?.graphId);
}));

test('提交完成后重复提交返回同一规则 ID', () => withStore((drafts) => {
    const id = drafts.begin({ name: 'test' });
    drafts.append(id, [node('a')]);
    const commit = drafts.beginCommit(id);
    drafts.completeCommit(id, '1234567890123', commit.commitToken);
    assert.deepEqual(drafts.beginCommit(id), { committedGraphId: '1234567890123' });
}));

test('提交失败后草稿恢复为可编辑', () => withStore((drafts) => {
    const id = drafts.begin({ name: 'test' });
    drafts.append(id, [node('a')]);
    const commit = drafts.beginCommit(id);
    drafts.failCommit(id, commit.commitToken);
    assert.equal(drafts.status(id).status, 'building');
    assert.doesNotThrow(() => drafts.edit(id, [node('a', 'delay')]));
}));

test('并发提交被拒绝时不能解除已有提交锁', () => withStore((drafts) => {
    const id = drafts.begin({ name: 'test' });
    drafts.append(id, [node('a')]);
    const first = drafts.beginCommit(id);
    assert.throws(() => drafts.beginCommit(id), /正在提交/);
    assert.throws(() => drafts.failCommit(id), /提交令牌不匹配/);
    assert.throws(() => drafts.beginCommit(id), /正在提交/);
    drafts.failCommit(id, first.commitToken);
    assert.equal(drafts.status(id).status, 'building');
}));

test('复杂规则草稿删除后不能继续读取', () => withStore((drafts) => {
    const id = drafts.begin({ name: 'test' });
    assert.equal(drafts.delete(id), true);
    assert.throws(() => drafts.status(id), /不存在或已过期/);
}));

test('复杂规则草稿拒绝过大的单批节点数据', () => withStore((drafts) => {
    const id = drafts.begin({ name: 'test' });
    const oversized = node('large');
    oversized.props = { value: 'x'.repeat(129 * 1024) };
    assert.throws(() => drafts.append(id, [oversized]), /128 KiB/);
}));
