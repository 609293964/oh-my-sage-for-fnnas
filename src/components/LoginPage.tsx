'use client';

import React, {useState, useCallback, useEffect, useRef} from 'react';
import {Input, Button, message, Modal, Space, Tooltip, Typography} from 'antd';
import {LockOutlined, ReloadOutlined, SettingOutlined, ThunderboltFilled} from '@ant-design/icons';
import PasscodeCapturePanel, {
    PasscodeCapturePanelHandle,
    PasscodeCapturePanelState,
} from '@/components/PasscodeCapturePanel';
import ThemeToggle from '@/components/ThemeToggle';

const {Text} = Typography;

interface LoginPageProps {
    onLoginSuccess: (passcode: string) => void;
}

export default function LoginPage({onLoginSuccess}: LoginPageProps) {
    const [passcode, setPasscode] = useState('');
    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [passcodePanelState, setPasscodePanelState] = useState<PasscodeCapturePanelState>({
        canRefresh: false,
        fetching: false,
        hydrated: false,
    });
    const isLoggingRef = useRef(false);
    const passcodePanelRef = useRef<PasscodeCapturePanelHandle>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    const doLogin = useCallback(async (code: string) => {
        if (code.length !== 6 || isLoggingRef.current) return;
        isLoggingRef.current = true;
        setLoading(true);
        try {
            const response = await fetch('/api/auth', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({passcode: code}),
            });
            const result = await response.json();
            if (result.success) {
                message.success('连接成功');
                onLoginSuccess(code);
            } else {
                message.error(result.message || '连接失败');
                isLoggingRef.current = false;
            }
        } catch (error) {
            message.error('连接失败: ' + String(error));
            isLoggingRef.current = false;
        } finally {
            setLoading(false);
        }
    }, [onLoginSuccess]);

    const handlePasscodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/\D/g, '').slice(0, 6);
        setPasscode(value);
        if (value.length === 6) {
            setTimeout(() => doLogin(value), 0);
        }
    };

    const handlePasscodeFetched = useCallback((code: string) => {
        const value = code.replace(/\D/g, '').slice(0, 6);
        setPasscode(value);
    }, []);

    const handlePasscodePanelStateChange = useCallback((state: PasscodeCapturePanelState) => {
        setPasscodePanelState(state);
    }, []);

    const handleRefreshPasscode = useCallback(() => {
        if (!passcodePanelRef.current) {
            message.warning('验证码设置正在加载，请稍后重试');
            return;
        }
        passcodePanelRef.current.refreshPasscode();
    }, []);

    return (
        <div className="login-page">
            <div className="login-top-actions">
                <Tooltip title="验证码设置">
                    <Button
                        className="login-settings-button"
                        shape="circle"
                        icon={<SettingOutlined/>}
                        onClick={() => setSettingsOpen(true)}
                        aria-label="验证码设置"
                    />
                </Tooltip>
                <ThemeToggle/>
            </div>

            {mounted && (
                <Modal
                    title="验证码设置"
                    open={settingsOpen}
                    onCancel={() => setSettingsOpen(false)}
                    footer={null}
                    width={560}
                    centered
                    forceRender
                >
                    <PasscodeCapturePanel
                        ref={passcodePanelRef}
                        disabled={loading}
                        onPasscodeFetched={handlePasscodeFetched}
                        onStateChange={handlePasscodePanelStateChange}
                    />
                </Modal>
            )}

            {/* 亮色主题主视觉 */}
            <div className="login-main-visual" aria-hidden="true">
                <div className="login-visual-slab">
                    <span/>
                    <span/>
                    <span/>
                </div>
            </div>

            {/* 登录卡片 */}
            <div
                className="glass-panel"
                style={{
                    width: 460, maxWidth: '100%', padding: '36px 32px',
                    borderRadius: 'var(--radius-xl)',
                    textAlign: 'center',
                    position: 'relative', zIndex: 1,
                    boxShadow: 'var(--shadow-lg)',
                    animation: 'fadeInUp 0.6s var(--ease-out)',
                }}
            >
                {/* Logo */}
                <div style={{
                    width: 64, height: 64, margin: '0 auto 24px',
                    borderRadius: 'var(--radius-lg)',
                    background: 'var(--gradient-primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 40px rgba(99,102,241,0.3)',
                }}>
                    <ThunderboltFilled style={{fontSize: 28, color: '#fff'}}/>
                </div>

                <h1 className="gradient-text" style={{
                    fontSize: 25, fontWeight: 800, margin: '0 0 28px',
                    letterSpacing: 0,
                }}>
                    米家自动化极客版 AI Agent
                </h1>

                <div style={{marginBottom: 20}}>
                    <Space.Compact style={{width: '100%'}}>
                        <Input
                            prefix={<LockOutlined style={{color: 'var(--text-muted)'}}/>}
                            placeholder="输入 6 位米家登录码"
                            maxLength={6}
                            size="large"
                            value={passcode}
                            onChange={handlePasscodeChange}
                            disabled={loading}
                            style={{
                                textAlign: 'center',
                                letterSpacing: 6,
                                fontSize: 18,
                                fontWeight: 600,
                            }}
                        />
                        <Tooltip title={passcodePanelState.canRefresh ? '重新获取验证码' : '先在右上角设置验证码请求'}>
                            <Button
                                size="large"
                                icon={<ReloadOutlined/>}
                                loading={passcodePanelState.fetching}
                                disabled={loading || !passcodePanelState.canRefresh}
                                onClick={handleRefreshPasscode}
                                aria-label="重新获取验证码"
                                style={{width: 48}}
                            />
                        </Tooltip>
                    </Space.Compact>
                    <Text style={{color: 'var(--text-muted)', fontSize: 11, marginTop: 8, display: 'block'}}>
                        输入 6 位后自动连接，刷新会自动填入验证码
                    </Text>
                </div>

                <Button
                    type="primary"
                    size="large"
                    block
                    onClick={() => doLogin(passcode)}
                    loading={loading}
                    disabled={passcode.length !== 6}
                    style={{
                        borderRadius: 'var(--radius-md)',
                        height: 44, fontSize: 15, fontWeight: 600,
                    }}
                >
                    {loading ? '正在连接网关...' : '连接网关'}
                </Button>
            </div>
        </div>
    );
}
