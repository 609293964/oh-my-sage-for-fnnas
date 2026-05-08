'use client';

import React, {useCallback, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {Button, Collapse, Input, message, Space, Typography} from 'antd';
import {
    FileSearchOutlined,
    SettingOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import {
    defaultMijiaPasscodeRequestConfig,
    MijiaPasscodeRequestConfig,
    normalizeMijiaPasscodeConfig,
    parseMijiaPasscodeCaptureText,
} from '@/lib/mijiaPasscode';

const {Text} = Typography;
const {TextArea} = Input;

interface PasscodeCapturePanelProps {
    disabled?: boolean;
    onPasscodeFetched: (passcode: string) => void;
    onStateChange?: (state: PasscodeCapturePanelState) => void;
}

export interface PasscodeCapturePanelHandle {
    refreshPasscode: () => Promise<void>;
}

export interface PasscodeCapturePanelState {
    canRefresh: boolean;
    fetching: boolean;
    hydrated: boolean;
}

interface PasscodeFetchResponse {
    success: boolean;
    passcode?: string;
    message?: string;
    responsePreview?: string;
}

interface FetchPasscodeOptions {
    silent?: boolean;
    loadingText?: string;
}

const storageKey = 'mijia_geek_ai_mijia_passcode_request';

const PasscodeCapturePanel = React.forwardRef<PasscodeCapturePanelHandle, PasscodeCapturePanelProps>(
function PasscodeCapturePanel({disabled, onPasscodeFetched, onStateChange}, ref) {
    const [config, setConfig] = useState<MijiaPasscodeRequestConfig>(defaultMijiaPasscodeRequestConfig);
    const [status, setStatus] = useState('上传或拖入 HAR 文件后自动解析');
    const [isDragging, setIsDragging] = useState(false);
    const [parsing, setParsing] = useState(false);
    const [fetching, setFetching] = useState(false);
    const [hydrated, setHydrated] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const initialAutoFetchConfigRef = useRef<MijiaPasscodeRequestConfig | null>(null);

    useEffect(() => {
        try {
            const rawValue = localStorage.getItem(storageKey);
            if (rawValue) {
                const savedConfig = normalizeMijiaPasscodeConfig(JSON.parse(rawValue));
                setConfig(savedConfig);
                if (savedConfig.requestUrl && savedConfig.passcodeRequestBody) {
                    initialAutoFetchConfigRef.current = savedConfig;
                }
                setStatus('已载入上次保存的请求参数');
            }
        } catch {
            setStatus('上传或拖入 HAR 文件后自动解析');
        } finally {
            setHydrated(true);
        }
    }, []);

    useEffect(() => {
        if (!hydrated) return;
        try {
            localStorage.setItem(storageKey, JSON.stringify(config));
        } catch {
            // 忽略浏览器隐私模式或存储配额导致的保存失败。
        }
    }, [config, hydrated]);

    const updateConfig = useCallback((key: keyof MijiaPasscodeRequestConfig, value: string) => {
        setConfig(prev => normalizeMijiaPasscodeConfig({...prev, [key]: value}));
    }, []);

    const fetchPasscode = useCallback(async (
        overrideConfig?: MijiaPasscodeRequestConfig,
        options: FetchPasscodeOptions = {}
    ) => {
        const requestConfig = overrideConfig || config;
        if (!requestConfig.requestUrl || !requestConfig.passcodeRequestBody) {
            if (!options.silent) {
                message.warning('请先上传 HAR 或填写请求地址和 POST 数据');
            }
            setStatus('缺少请求地址或登录码 POST 数据');
            return;
        }

        setFetching(true);
        setStatus(options.loadingText || '正在请求登录码...');
        try {
            const response = await fetch('/api/passcode', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({config: requestConfig}),
            });
            const result: PasscodeFetchResponse = await response.json();

            if (result.success && result.passcode) {
                onPasscodeFetched(result.passcode);
                setStatus('登录码已获取，已自动填入登录框');
                if (!options.silent) {
                    message.success('登录码已获取');
                }
                return;
            }

            const nextStatus = result.message || '未获取到登录码';
            setStatus(result.responsePreview ? `${nextStatus}：${result.responsePreview}` : nextStatus);
            if (!options.silent) {
                message.error(nextStatus);
            }
        } catch (error) {
            const nextStatus = '登录码请求失败: ' + String(error);
            setStatus(nextStatus);
            if (!options.silent) {
                message.error('登录码请求失败');
            }
        } finally {
            setFetching(false);
        }
    }, [config, onPasscodeFetched]);

    useImperativeHandle(ref, () => ({
        refreshPasscode: () => fetchPasscode(),
    }), [fetchPasscode]);

    useEffect(() => {
        if (!hydrated || disabled || !initialAutoFetchConfigRef.current) return;

        const requestConfig = initialAutoFetchConfigRef.current;
        initialAutoFetchConfigRef.current = null;
        fetchPasscode(requestConfig, {
            silent: true,
            loadingText: '正在自动刷新登录码...',
        });
    }, [disabled, fetchPasscode, hydrated]);

    const handleFile = useCallback(async (file: File) => {
        setParsing(true);
        try {
            const text = await file.text();
            const result = parseMijiaPasscodeCaptureText(text);
            setConfig(result.config);
            setStatus(result.message);
            if (result.found) {
                await fetchPasscode(result.config);
            } else {
                message.warning(result.message);
            }
        } catch (error) {
            const nextStatus = error instanceof Error ? error.message : String(error);
            setStatus(nextStatus);
            message.error('解析文件失败');
        } finally {
            setParsing(false);
        }
    }, [fetchPasscode]);

    const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            handleFile(file);
        }
        event.target.value = '';
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) {
            handleFile(file);
        }
    };

    const canRefresh = Boolean(config.requestUrl && config.passcodeRequestBody) && !disabled;

    useEffect(() => {
        onStateChange?.({
            canRefresh,
            fetching,
            hydrated,
        });
    }, [canRefresh, fetching, hydrated, onStateChange]);

    return (
        <div
            onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
            }}
            onDragLeave={(event) => {
                event.preventDefault();
                setIsDragging(false);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${isDragging ? 'var(--border-active)' : 'var(--border-subtle)'}`,
                background: isDragging ? 'var(--accent-soft)' : 'var(--bg-surface)',
                transition: 'border-color 0.2s var(--ease-out), background 0.2s var(--ease-out)',
                textAlign: 'left',
            }}
        >
            <input
                ref={fileInputRef}
                type="file"
                accept=".har,.json,.txt"
                onChange={handleFileInputChange}
                style={{display: 'none'}}
            />

            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10}}>
                <Space size={8}>
                    <FileSearchOutlined style={{color: 'var(--accent)'}}/>
                    <Text style={{color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600}}>
                        抓包获取验证码
                    </Text>
                </Space>
                <Button
                    size="small"
                    icon={<UploadOutlined/>}
                    loading={parsing}
                    disabled={disabled || fetching}
                    onClick={() => fileInputRef.current?.click()}
                >
                    HAR
                </Button>
            </div>

            <div style={{
                marginTop: 10,
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px dashed var(--border-default)',
                color: isDragging ? 'var(--accent-hover)' : 'var(--text-muted)',
                fontSize: 12,
                lineHeight: 1.5,
                textAlign: 'center',
            }}>
                {isDragging ? '松开后解析抓包文件' : '拖入 Stream 导出的 HAR，或点击 HAR 上传'}
            </div>

            <Text style={{
                display: 'block',
                marginTop: 8,
                color: 'var(--text-muted)',
                fontSize: 11,
                lineHeight: 1.5,
                wordBreak: 'break-word',
            }}>
                {status}
            </Text>

            <Collapse
                size="small"
                ghost
                style={{marginTop: 10}}
                items={[{
                    key: 'manual',
                    label: (
                        <Space size={6}>
                            <SettingOutlined/>
                            <span>手动填写请求参数</span>
                        </Space>
                    ),
                    children: (
                        <div style={{display: 'grid', gap: 10}}>
                            <Input
                                size="small"
                                placeholder="请求地址，例如 https://core.api.mijia.tech/app/home/rpc/..."
                                value={config.requestUrl}
                                onChange={event => updateConfig('requestUrl', event.target.value)}
                            />
                            <TextArea
                                rows={3}
                                placeholder="登录码接口 POST 数据"
                                value={config.passcodeRequestBody}
                                onChange={event => updateConfig('passcodeRequestBody', event.target.value)}
                            />
                            <TextArea
                                rows={2}
                                placeholder="Cookie"
                                value={config.cookie}
                                onChange={event => updateConfig('cookie', event.target.value)}
                            />
                            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8}}>
                                <Input
                                    size="small"
                                    placeholder="Accept"
                                    value={config.accept}
                                    onChange={event => updateConfig('accept', event.target.value)}
                                />
                                <Input
                                    size="small"
                                    placeholder="Content-Type"
                                    value={config.contentType}
                                    onChange={event => updateConfig('contentType', event.target.value)}
                                />
                            </div>
                            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8}}>
                                <Input
                                    size="small"
                                    placeholder="operate-common"
                                    value={config.operateCommon}
                                    onChange={event => updateConfig('operateCommon', event.target.value)}
                                />
                                <Input
                                    size="small"
                                    placeholder="Origin-From"
                                    value={config.originFrom}
                                    onChange={event => updateConfig('originFrom', event.target.value)}
                                />
                            </div>
                            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8}}>
                                <Input
                                    size="small"
                                    placeholder="X-XIAOMI-PROTOCAL-FLAG-CLI"
                                    value={config.xiaomiProtocolFlagCli}
                                    onChange={event => updateConfig('xiaomiProtocolFlagCli', event.target.value)}
                                />
                                <Input
                                    size="small"
                                    placeholder="MIOT-REQUEST-MODEL"
                                    value={config.miotRequestModel}
                                    onChange={event => updateConfig('miotRequestModel', event.target.value)}
                                />
                            </div>
                            <Text style={{color: 'var(--text-muted)', fontSize: 11}}>
                                保存后可回到登录框右侧点击刷新获取验证码。
                            </Text>
                        </div>
                    ),
                }]}
            />
        </div>
    );
});

export default PasscodeCapturePanel;
