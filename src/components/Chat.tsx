'use client';

import React, {useState, useRef, useEffect, useCallback} from 'react';
import {Input, Button, Space, Typography, Spin, message, Tag, Collapse, Tooltip} from 'antd';
import {SendOutlined, LoadingOutlined, ToolOutlined, RobotOutlined, QuestionCircleOutlined, StopOutlined, RollbackOutlined, ThunderboltOutlined, CopyOutlined, CheckOutlined} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const {Text} = Typography;
const {TextArea} = Input;

interface AgentOutput {
    type: 'thinking' | 'tool_start' | 'tool_result' | 'complete' | 'waiting_input' | 'error';
    content?: string;
    tool?: string;
    args?: any;
    result?: any;
    question?: string;
    options?: string[];
    error?: string;
    message?: string;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    seq?: number;
    process?: {
        toolCalls: Array<{ tool: string; args?: any; result?: any; success: boolean }>;
        thinking: string;
    };
}

interface SessionMessage {
    seq: number;
    role: 'user' | 'assistant' | 'compressed';
    content: string;
    timestamp: string;
    thinking?: string;
    toolCalls?: Array<{ tool: string; args?: any; result?: any; success: boolean }>;
}

interface ChatProps {
    passcode?: string;
    sessionId?: string;
    initialMessages?: SessionMessage[];
    onSessionCreated?: (sessionId: string, messages: SessionMessage[]) => void;
    onResetSession?: (sessionId: string, seq: number) => Promise<void>;
    onGraphChanged?: () => void;
}

let messageIdCounter = 0;
const graphMutationTools = new Set(['create_graph', 'update_graph', 'delete_graph', 'toggle_graph']);

function generateMessageId(): string {
    return `msg_${Date.now()}_${++messageIdCounter}`;
}

export default function Chat({
                                 passcode: propPasscode,
                                 sessionId,
                                 initialMessages,
                                 onSessionCreated,
                                 onResetSession,
                                 onGraphChanged,
                             }: ChatProps = {}) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [waitingInput, setWaitingInput] = useState<{ question: string; options: string[] } | null>(null);
    const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(sessionId);

    const [streamThinking, setStreamThinking] = useState('');
    const [streamToolCalls, setStreamToolCalls] = useState<Array<{ tool: string; args?: any; result?: any; success: boolean }>>([]);
    const [streamFinalContent, setStreamFinalContent] = useState('');
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const passcode = propPasscode || '';
    const prevSessionIdRef = useRef<string | undefined>(sessionId);
    const initializedRef = useRef(false);

    useEffect(() => {
        if (sessionId !== prevSessionIdRef.current) {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
            }
            setStreamThinking('');
            setStreamToolCalls([]);
            setStreamFinalContent('');
            setWaitingInput(null);
            setIsLoading(false);
            setCurrentSessionId(sessionId);
            prevSessionIdRef.current = sessionId;
            initializedRef.current = false;
        }
    }, [sessionId]);

    useEffect(() => {
        if (initializedRef.current) return;

        if (initialMessages && initialMessages.length > 0) {
            // 过滤掉 compressed 类型消息，不展示给用户
            const visibleMessages = initialMessages.filter(
                (m): m is SessionMessage & { role: 'user' | 'assistant' } => m.role !== 'compressed'
            );
            const convertedMessages: ChatMessage[] = visibleMessages.map(msg => ({
                id: generateMessageId(),
                role: msg.role,
                content: msg.content || '',
                seq: msg.seq,
                process: (msg.toolCalls && msg.toolCalls.length > 0) || msg.thinking ? {
                    toolCalls: (msg.toolCalls || []).map(tc => ({
                        tool: tc.tool || '',
                        args: tc.args,
                        result: tc.result,
                        success: tc.success !== false,
                    })),
                    thinking: msg.thinking || '',
                } : undefined,
            }));
            setMessages(convertedMessages);
            initializedRef.current = true;
        } else if (initialMessages && initialMessages.length === 0 && !isLoading) {
            setMessages([]);
            initializedRef.current = true;
        }
    }, [initialMessages, isLoading]);

    useEffect(() => {
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
    }, [messages, streamThinking, streamToolCalls, streamFinalContent, waitingInput]);

    useEffect(() => {
        return () => {
            if (copyTimerRef.current) {
                clearTimeout(copyTimerRef.current);
            }
        };
    }, []);

    const copyToClipboard = useCallback(async (content: string, messageId: string) => {
        const text = content.trim();
        if (!text) return;

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.setAttribute('readonly', 'true');
                textarea.style.position = 'fixed';
                textarea.style.left = '-9999px';
                textarea.style.top = '0';
                document.body.appendChild(textarea);
                let copied = false;
                try {
                    textarea.select();
                    copied = document.execCommand('copy');
                } finally {
                    document.body.removeChild(textarea);
                }
                if (!copied) throw new Error('复制命令失败');
            }

            setCopiedMessageId(messageId);
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
            copyTimerRef.current = setTimeout(() => setCopiedMessageId(null), 1400);
        } catch (error) {
            message.error('复制失败，请手动选中文本复制');
        }
    }, []);

    const renderCopyButton = (content: string, messageId: string) => (
        <Tooltip title={copiedMessageId === messageId ? '已复制' : '复制'}>
            <Button
                type="text"
                size="small"
                aria-label="复制消息"
                className="chat-copy-button"
                icon={copiedMessageId === messageId ? <CheckOutlined/> : <CopyOutlined/>}
                onClick={() => copyToClipboard(content, messageId)}
            />
        </Tooltip>
    );

    const sendMessage = useCallback(async (messageText: string) => {
        if (!messageText.trim() || isLoading) return;

        const userMessage: ChatMessage = {
            id: generateMessageId(),
            role: 'user',
            content: messageText,
        };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);
        setWaitingInput(null);

        let currentThinking = '';
        const currentToolCalls: Array<{ tool: string; args?: any; result?: any; success: boolean }> = [];
        let finalContent = '';
        let graphChanged = false;
        setStreamThinking('');
        setStreamToolCalls([]);
        setStreamFinalContent('');

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({message: messageText, passcode, sessionId: currentSessionId}),
                signal: abortController.signal,
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const reader = response.body?.getReader();
            if (!reader) throw new Error('无法读取响应流');

            const decoder = new TextDecoder();

            while (true) {
                if (abortController.signal.aborted) {
                    reader.cancel();
                    break;
                }
                const {done, value} = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    try {
                        const output: AgentOutput = JSON.parse(data);
                        switch (output.type) {
                            case 'thinking':
                                currentThinking += output.content || '';
                                setStreamThinking(currentThinking);
                                break;
                            case 'tool_start':
                                currentToolCalls.push({tool: output.tool || '', args: output.args, success: false});
                                setStreamToolCalls([...currentToolCalls]);
                                break;
                            case 'tool_result':
                                const lastIndex = currentToolCalls.length - 1;
                                if (lastIndex >= 0) {
                                    currentToolCalls[lastIndex].success = output.result?.success !== false;
                                    currentToolCalls[lastIndex].result = output.result;
                                    if (
                                        graphMutationTools.has(currentToolCalls[lastIndex].tool) &&
                                        output.result?.success !== false
                                    ) {
                                        graphChanged = true;
                                    }
                                    setStreamToolCalls([...currentToolCalls]);
                                }
                                break;
                            case 'complete':
                                finalContent = output.message || output.content || '';
                                setStreamFinalContent(finalContent);
                                break;
                            case 'waiting_input':
                                const opts = Array.isArray(output.options) ? output.options : [];
                                if (opts.length > 0) setWaitingInput({question: output.question || '请选择', options: opts});
                                break;
                            case 'error':
                                message.error(output.error || '发生错误');
                                break;
                        }
                    } catch (parseError) {
                        // 忽略解析错误（可能是不完整的 JSON 行）
                        if (data.length > 2) { // 只记录非空行的错误
                            console.warn('流式数据解析失败:', data, parseError);
                        }
                    }
                }
            }

            if (abortController.signal.aborted) return;

            if (!currentSessionId) {
                const sessionsResponse = await fetch('/api/sessions');
                const sessionsData = await sessionsResponse.json();
                if (sessionsData.success && sessionsData.sessions.length > 0) {
                    const newSessionId = sessionsData.sessions[0].id;
                    setCurrentSessionId(newSessionId);
                    const assistantSessionMessage: SessionMessage = {
                        seq: 1, role: 'assistant', content: finalContent,
                        timestamp: new Date().toISOString(),
                        thinking: currentThinking || undefined,
                        toolCalls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
                    };
                    const userSessionMessage: SessionMessage = {
                        seq: 0, role: 'user', content: messageText, timestamp: new Date().toISOString(),
                    };
                    onSessionCreated?.(newSessionId, [userSessionMessage, assistantSessionMessage]);
                }
            }

            const assistantMessage: ChatMessage = {
                id: generateMessageId(),
                role: 'assistant',
                content: finalContent,
                process: currentToolCalls.length > 0 || currentThinking ? {
                    toolCalls: currentToolCalls, thinking: currentThinking,
                } : undefined,
            };
            setMessages(prev => [...prev, assistantMessage]);
            setStreamThinking('');
            setStreamToolCalls([]);
            setStreamFinalContent('');
            if (graphChanged) {
                onGraphChanged?.();
            }

        } catch (error: any) {
            if (error.name === 'AbortError') return;
            setInput(messageText);
            setMessages(prev => prev.filter(m => m.id !== userMessage.id));
            message.error('发送失败: ' + error.message);
        } finally {
            abortControllerRef.current = null;
            setIsLoading(false);
        }
    }, [isLoading, passcode, currentSessionId, onSessionCreated, onGraphChanged]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;
        if (waitingInput) setWaitingInput(null);
        sendMessage(input);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (input.trim() && !isLoading) handleSubmit(e as any);
        }
    };

    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsLoading(false);
        setStreamThinking('');
        setStreamToolCalls([]);
        setStreamFinalContent('');
        setWaitingInput(null);
    };

    const handleReset = useCallback(async (targetSeq: number, messageContent: string) => {
        if (!currentSessionId || !onResetSession) return;
        handleStop();
        try {
            // targetSeq - 1：删除选中的那条消息及其后续所有消息
            await onResetSession(currentSessionId, targetSeq - 1);
            setInput(messageContent);
            initializedRef.current = false;
        } catch (error) {
        }
    }, [currentSessionId, onResetSession]);

    const renderMarkdown = (content: string) => {
        if (!content) return null;
        return (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        );
    };

    // ─── 助手消息 ───
    const renderAssistantMessage = (msg: ChatMessage) => {
        const toolCalls = msg.process?.toolCalls || [];
        const hasProcess = msg.process && (toolCalls.length > 0 || msg.process.thinking);

        return (
            <div key={msg.id} className="msg-enter" style={{marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start'}}>
                {/* 头像 */}
                <div className="chat-avatar" style={{
                    width: 32, height: 32, borderRadius: 'var(--radius-full)',
                    marginTop: 2,
                }}>
                    <ThunderboltOutlined style={{color: 'inherit', fontSize: 14}}/>
                </div>

                <div style={{flex: 1, maxWidth: '82%'}}>
                    {hasProcess && (
                        <Collapse
                            size="small"
                            style={{marginBottom: 8}}
                            items={[{
                                key: '1',
                                label: (
                                    <div style={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6}}>
                                        <span style={{fontSize: 12, color: 'var(--text-muted)'}}>执行过程</span>
                                        {toolCalls.map((tc, i) => (
                                            <Tag key={`${msg.id}-tc-${i}`} color={tc.success ? 'success' : 'error'}>{tc.tool}</Tag>
                                        ))}
                                    </div>
                                ),
                                children: (
                                    <div style={{fontSize: 12}}>
                                        {msg.process!.thinking && (
                                            <div style={{marginBottom: 8}}>
                                                <div style={{color: 'var(--text-muted)', marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1}}>思考</div>
                                                <div style={{
                                                    padding: 10, borderRadius: 'var(--radius-sm)',
                                                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)',
                                                    whiteSpace: 'pre-wrap', color: 'var(--warning-text)', lineHeight: 1.6,
                                                }}>
                                                    {msg.process!.thinking}
                                                </div>
                                            </div>
                                        )}
                                        {toolCalls.map((tc, i) => (
                                            <div key={`${msg.id}-tool-${i}`} style={{
                                                marginBottom: 6, padding: 10, borderRadius: 'var(--radius-sm)',
                                                background: 'var(--accent-soft)', border: '1px solid var(--accent-border)',
                                            }}>
                                                <Space style={{marginBottom: 4}}>
                                                    <ToolOutlined style={{color: 'var(--accent)'}}/>
                                                    <Text strong style={{fontSize: 12, color: 'var(--text-bright)'}}>{tc.tool}</Text>
                                                    <Tag color={tc.success ? 'success' : 'error'} style={{fontSize: 10}}>
                                                        {tc.success ? '✓' : '✗'}
                                                    </Tag>
                                                </Space>
                                                {tc.args && Object.keys(tc.args).length > 0 && (
                                                    <div style={{marginTop: 4, color: 'var(--text-muted)'}}>
                                                        <Text style={{fontSize: 11, fontFamily: 'monospace'}}>{JSON.stringify(tc.args)}</Text>
                                                    </div>
                                                )}
                                                {tc.result && (
                                                    <div style={{marginTop: 6, maxHeight: 160, overflow: 'auto'}}>
                                                        <Text style={{fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-secondary)'}}>
                                                            {typeof tc.result === 'object' ? JSON.stringify(tc.result, null, 2) : String(tc.result)}
                                                        </Text>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ),
                            }]}
                        />
                    )}

                    {msg.content && (
                        <div className="chat-bubble chat-bubble-assistant chat-selectable" style={{
                            padding: '14px 18px',
                            borderRadius: '6px var(--radius-lg) var(--radius-lg) var(--radius-lg)',
                            animation: 'fadeInUp 0.3s var(--ease-out)',
                            position: 'relative',
                        }}>
                            <div className="markdown-content">{renderMarkdown(msg.content)}</div>
                            {renderCopyButton(msg.content, msg.id)}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // ─── 流式输出 ───
    const renderStreaming = () => {
        if (!isLoading) return null;
        const toolCalls = streamToolCalls || [];
        const hasContent = streamThinking || toolCalls.length > 0 || streamFinalContent;
        if (!hasContent) {
            return (
                <div className="msg-enter" style={{marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start'}}>
                    <div className="chat-avatar" style={{
                        width: 32, height: 32, borderRadius: 'var(--radius-full)',
                    }}>
                        <ThunderboltOutlined style={{color: 'inherit', fontSize: 14}}/>
                    </div>
                    <div className="chat-bubble chat-bubble-assistant" style={{
                        padding: '14px 18px',
                        borderRadius: '6px var(--radius-lg) var(--radius-lg) var(--radius-lg)',
                    }}>
                        <div className="typing-indicator">
                            <span/><span/><span/>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="msg-enter" style={{marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start'}}>
                <div className="chat-avatar chat-avatar-active" style={{
                    width: 32, height: 32, borderRadius: 'var(--radius-full)',
                }}>
                    <ThunderboltOutlined style={{color: 'inherit', fontSize: 14}}/>
                </div>

                <div style={{flex: 1, maxWidth: '82%'}}>
                    {(streamThinking || toolCalls.length > 0) && (
                        <Collapse
                            size="small"
                            defaultActiveKey={['1']}
                            style={{marginBottom: 8}}
                            items={[{
                                key: '1',
                                label: (
                                    <div style={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6}}>
                                        <Spin indicator={<LoadingOutlined style={{fontSize: 12, color: 'var(--accent)'}} spin/>}/>
                                        <span style={{fontSize: 12, color: 'var(--text-muted)'}}>执行中</span>
                                        {toolCalls.map((tc, i) => (
                                            <Tag key={i} color={tc.success ? 'success' : 'processing'}>{tc.tool}</Tag>
                                        ))}
                                    </div>
                                ),
                                children: (
                                    <div style={{fontSize: 12}}>
                                        {streamThinking && (
                                            <div style={{marginBottom: 8}}>
                                                <div style={{color: 'var(--text-muted)', marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1}}>思考</div>
                                                <div style={{
                                                    padding: 10, borderRadius: 'var(--radius-sm)',
                                                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)',
                                                    whiteSpace: 'pre-wrap', color: 'var(--warning-text)',
                                                }}>
                                                    {streamThinking}
                                                </div>
                                            </div>
                                        )}
                                        {toolCalls.map((tc, i) => (
                                            <div key={i} style={{
                                                marginBottom: 6, padding: 10, borderRadius: 'var(--radius-sm)',
                                                background: 'var(--accent-soft)', border: '1px solid var(--accent-border)',
                                            }}>
                                                <Space style={{marginBottom: 4}}>
                                                    <ToolOutlined style={{color: 'var(--accent)'}}/>
                                                    <Text strong style={{fontSize: 12, color: 'var(--text-bright)'}}>{tc.tool}</Text>
                                                    <Tag color={tc.success ? 'success' : tc.result ? 'error' : 'processing'}>
                                                        {tc.success ? '✓' : tc.result ? '✗' : '…'}
                                                    </Tag>
                                                </Space>
                                                {tc.args && Object.keys(tc.args).length > 0 && (
                                                    <div style={{marginTop: 4, color: 'var(--text-muted)'}}>
                                                        <Text style={{fontSize: 11, fontFamily: 'monospace'}}>{JSON.stringify(tc.args)}</Text>
                                                    </div>
                                                )}
                                                {tc.result && (
                                                    <div style={{marginTop: 6, maxHeight: 160, overflow: 'auto'}}>
                                                        <Text style={{fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-secondary)'}}>
                                                            {typeof tc.result === 'object' ? JSON.stringify(tc.result, null, 2) : String(tc.result)}
                                                        </Text>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ),
                            }]}
                        />
                    )}

                    {streamFinalContent && (
                        <div className="chat-bubble chat-bubble-assistant chat-selectable" style={{
                            padding: '14px 18px',
                            borderRadius: '6px var(--radius-lg) var(--radius-lg) var(--radius-lg)',
                            position: 'relative',
                        }}>
                            <div className="markdown-content">{renderMarkdown(streamFinalContent)}</div>
                            {renderCopyButton(streamFinalContent, 'streaming-final')}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div style={{height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column'}}>
            {/* 顶栏 */}
            <div style={{
                padding: '14px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
                <Space size={10}>
                    <div className="chat-avatar" style={{
                        width: 28, height: 28, borderRadius: 'var(--radius-full)',
                    }}>
                        <RobotOutlined style={{fontSize: 14, color: 'inherit'}}/>
                    </div>
                    <Text strong style={{color: 'var(--text-bright)', fontSize: 14}}>智者</Text>
                    {isLoading && (
                        <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                            <Spin indicator={<LoadingOutlined style={{fontSize: 13, color: 'var(--accent)'}} spin/>}/>
                            <Text style={{fontSize: 12, color: 'var(--text-muted)'}}>思考中...</Text>
                        </div>
                    )}
                </Space>
            </div>

            {/* 消息区 */}
            <div ref={messagesContainerRef} className="chat-messages" style={{flex: 1, minHeight: 0, overflow: 'auto', padding: '20px 24px'}}>
                {messages.length === 0 && !isLoading && (
                    <div style={{
                        textAlign: 'center', padding: '60px 20px',
                        animation: 'fadeIn 0.6s var(--ease-out)',
                    }}>
                        <div className="chat-empty-icon" style={{
                            width: 72, height: 72, margin: '0 auto 20px',
                            borderRadius: 'var(--radius-full)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <RobotOutlined style={{fontSize: 32, color: 'inherit'}}/>
                        </div>
                        <div style={{fontSize: 22, fontWeight: 700, marginBottom: 8, color: 'var(--text-bright)'}}>
                            你好！我是智者
                        </div>
                        <Text style={{color: 'var(--text-muted)', fontSize: 14, display: 'block', marginBottom: 28}}>
                            米家自动化极客版 AI 助手
                        </Text>
                        <Space direction="vertical" size={10}>
                            <Button
                                className="chat-suggestion-button"
                                onClick={() => sendMessage('帮我查看设备状态')}
                                style={{
                                    borderRadius: 'var(--radius-full)',
                                    padding: '6px 20px',
                                    height: 'auto',
                                }}
                            >
                                查看设备状态
                            </Button>
                            <Button
                                className="chat-suggestion-button"
                                onClick={() => sendMessage('帮我创建自动化规则')}
                                style={{
                                    borderRadius: 'var(--radius-full)',
                                    padding: '6px 20px',
                                    height: 'auto',
                                }}
                            >
                                创建自动化规则
                            </Button>
                        </Space>
                    </div>
                )}

                {messages.map((msg, index) => (
                    msg.role === 'user' ? (
                        <div key={msg.id} className="msg-enter" style={{marginBottom: 20, display: 'flex', justifyContent: 'flex-end'}}>
                            <div style={{maxWidth: '82%'}}>
                                <div className="chat-bubble chat-bubble-user chat-selectable" style={{
                                    padding: '14px 18px',
                                    borderRadius: 'var(--radius-lg) var(--radius-lg) 6px var(--radius-lg)',
                                    position: 'relative',
                                }}>
                                    <div className="chat-message-content" style={{whiteSpace: 'pre-wrap', lineHeight: 1.6}}>{msg.content}</div>
                                    {renderCopyButton(msg.content, msg.id)}
                                </div>
                                {currentSessionId && onResetSession && !isLoading && msg.seq !== undefined && (
                                    <div style={{textAlign: 'right', marginTop: 4}}>
                                        <Button
                                            type="text" size="small"
                                            icon={<RollbackOutlined/>}
                                            onClick={() => handleReset(msg.seq!, msg.content)}
                                            style={{fontSize: 11, color: 'var(--text-muted)', padding: '0 6px'}}
                                        >
                                            重做
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        renderAssistantMessage(msg)
                    )
                ))}

                {renderStreaming()}

                {/* 选项卡片 */}
                {waitingInput && Array.isArray(waitingInput.options) && waitingInput.options.length > 0 && (
                    <div className="msg-enter" style={{
                        padding: 18,
                        background: 'var(--accent-soft)',
                        border: '1px solid var(--accent-border)',
                        borderRadius: 'var(--radius-lg)',
                        marginBottom: 16,
                    }}>
                        {waitingInput.question && (
                            <div style={{marginBottom: 14}}>
                                <Space style={{marginBottom: 8}}>
                                    <QuestionCircleOutlined style={{color: 'var(--accent)'}}/>
                                    <Text strong style={{fontSize: 14, color: 'var(--text-bright)'}}>需要你的选择</Text>
                                </Space>
                                <div className="markdown-content">{renderMarkdown(waitingInput.question)}</div>
                            </div>
                        )}
                        <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                            {waitingInput.options.map((opt, i) => (
                                <Button
                                    className="chat-suggestion-button"
                                    key={`option-${i}`}
                                    onClick={() => {
                                        setWaitingInput(null);
                                        sendMessage(opt);
                                    }}
                                    style={{
                                        textAlign: 'left', height: 'auto', whiteSpace: 'normal', padding: '10px 14px',
                                        borderRadius: 'var(--radius-md)',
                                    }}
                                >
                                    {opt}
                                </Button>
                            ))}
                        </div>
                        <Text style={{fontSize: 12, color: 'var(--text-muted)', display: 'block', marginTop: 10}}>
                            也可直接输入自定义回复
                        </Text>
                    </div>
                )}
            </div>

            {/* 输入区 */}
            <div className="chat-input-bar" style={{
                padding: '14px 20px',
                borderTop: '1px solid var(--border-subtle)',
            }}>
                <form onSubmit={handleSubmit}>
                    <Space.Compact style={{width: '100%'}}>
                        <TextArea
                            className="chat-input"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={waitingInput ? "选择上方选项，或输入自定义回复..." : "输入消息... (Enter 发送, Shift+Enter 换行)"}
                            autoSize={{minRows: 1, maxRows: 4}}
                            disabled={isLoading && !waitingInput}
                            style={{
                                borderRadius: 'var(--radius-lg) 0 0 var(--radius-lg)',
                                color: 'var(--text-primary)',
                                resize: 'none',
                            }}
                        />
                        {isLoading ? (
                            <Button
                                className="chat-stop-button"
                                danger
                                icon={<StopOutlined/>}
                                onClick={handleStop}
                                style={{
                                    borderRadius: '0 var(--radius-lg) var(--radius-lg) 0',
                                    height: 40,
                                }}
                            >
                                停止
                            </Button>
                        ) : (
                            <Button
                                className="chat-send-button"
                                type="primary"
                                icon={<SendOutlined/>}
                                htmlType="submit"
                                disabled={!input.trim()}
                                aria-label="发送消息"
                                style={{
                                    borderRadius: '0 var(--radius-lg) var(--radius-lg) 0',
                                    height: 40,
                                }}
                            />
                        )}
                    </Space.Compact>
                </form>
            </div>
        </div>
    );
}
