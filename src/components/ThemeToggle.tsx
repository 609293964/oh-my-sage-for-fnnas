'use client';

import React from 'react';
import {Segmented, Tooltip} from 'antd';
import {DesktopOutlined, MoonOutlined, SunOutlined} from '@ant-design/icons';
import {useThemePreference} from '@/components/ThemeProvider';
import type {ThemeMode} from '@/components/ThemeProvider';

const themeOptions: Array<{ value: ThemeMode; label: string; icon: React.ReactNode }> = [
    {value: 'light', label: '亮色', icon: <SunOutlined/>},
    {value: 'dark', label: '暗色', icon: <MoonOutlined/>},
    {value: 'system', label: '跟随系统', icon: <DesktopOutlined/>},
];

export default function ThemeToggle() {
    const {mode, setMode} = useThemePreference();

    return (
        <Segmented
            className="theme-toggle"
            aria-label="切换主题"
            size="small"
            value={mode}
            onChange={(value) => setMode(value as ThemeMode)}
            options={themeOptions.map(option => ({
                value: option.value,
                label: (
                    <Tooltip title={option.label}>
                        <span className="theme-toggle-icon" aria-label={option.label}>
                            {option.icon}
                        </span>
                    </Tooltip>
                ),
            }))}
        />
    );
}
