'use client';

import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {App, ConfigProvider, theme as antdTheme} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {StyleProvider} from '@ant-design/cssinjs';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
    mode: ThemeMode;
    resolvedTheme: ResolvedTheme;
    setMode: (mode: ThemeMode) => void;
}

const themeStorageKey = 'mijia_geek_ai_theme_mode';
const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeMode(value: string | null): value is ThemeMode {
    return value === 'light' || value === 'dark' || value === 'system';
}

export function useThemePreference(): ThemeContextValue {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useThemePreference must be used within ThemeProvider');
    }
    return context;
}

export default function ThemeProvider({children}: { children: React.ReactNode }) {
    const [mode, setModeState] = useState<ThemeMode>('dark');
    const [systemTheme, setSystemTheme] = useState<ResolvedTheme>('dark');
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
        const updateSystemTheme = () => setSystemTheme(mediaQuery.matches ? 'light' : 'dark');
        const storedMode = localStorage.getItem(themeStorageKey);

        if (isThemeMode(storedMode)) {
            setModeState(storedMode);
        }
        updateSystemTheme();
        setHydrated(true);

        mediaQuery.addEventListener('change', updateSystemTheme);
        return () => mediaQuery.removeEventListener('change', updateSystemTheme);
    }, []);

    const resolvedTheme: ResolvedTheme = mode === 'system' ? systemTheme : mode;

    useEffect(() => {
        document.documentElement.dataset.theme = resolvedTheme;
        document.documentElement.dataset.themeMode = mode;
        document.documentElement.style.colorScheme = resolvedTheme;
        if (hydrated) {
            localStorage.setItem(themeStorageKey, mode);
        }
    }, [hydrated, mode, resolvedTheme]);

    const setMode = useCallback((nextMode: ThemeMode) => {
        setModeState(nextMode);
    }, []);

    const themeConfig = useMemo(() => {
        const isDark = resolvedTheme === 'dark';
        return {
            algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
            token: {
                colorPrimary: isDark ? '#6366f1' : '#0071e3',
                colorInfo: isDark ? '#6366f1' : '#0071e3',
                colorSuccess: isDark ? '#10b981' : '#34c759',
                colorWarning: isDark ? '#f59e0b' : '#ff9f0a',
                colorError: isDark ? '#ef4444' : '#ff3b30',
                borderRadius: 8,
                colorBgContainer: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.86)',
                colorBgElevated: isDark ? 'rgba(20,20,40,0.95)' : 'rgba(255,255,255,0.98)',
                colorBgLayout: isDark ? '#0a0a14' : '#f5f5f7',
                colorText: isDark ? '#e2e8f0' : '#1d1d1f',
                colorTextSecondary: isDark ? '#94a3b8' : '#6e6e73',
                colorBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)',
                colorBorderSecondary: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)',
            },
            components: {
                Button: {
                    controlHeight: 38,
                    primaryShadow: isDark ? '0 0 16px rgba(99,102,241,0.25)' : '0 10px 22px rgba(0,113,227,0.18)',
                },
                Input: {
                    controlHeight: 40,
                    activeBorderColor: isDark ? '#6366f1' : '#0071e3',
                    hoverBorderColor: isDark ? '#818cf8' : '#0a84ff',
                },
                Card: {
                    colorBgContainer: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.86)',
                },
                Layout: {
                    bodyBg: isDark ? '#0a0a14' : '#f5f5f7',
                    headerBg: isDark ? 'rgba(15,15,30,0.85)' : 'rgba(255,255,255,0.78)',
                    siderBg: isDark ? '#0f0f1e' : 'rgba(255,255,255,0.76)',
                },
                Collapse: {
                    contentBg: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.64)',
                },
                Tag: {
                    defaultBg: isDark ? 'rgba(99,102,241,0.12)' : 'rgba(0,113,227,0.1)',
                    defaultColor: isDark ? '#a5b4fc' : '#0057b8',
                },
            },
        };
    }, [resolvedTheme]);

    const contextValue = useMemo(() => ({
        mode,
        resolvedTheme,
        setMode,
    }), [mode, resolvedTheme, setMode]);

    return (
        <ThemeContext.Provider value={contextValue}>
            <StyleProvider hashPriority="high">
                <ConfigProvider locale={zhCN} theme={themeConfig}>
                    <App>{children}</App>
                </ConfigProvider>
            </StyleProvider>
        </ThemeContext.Provider>
    );
}
