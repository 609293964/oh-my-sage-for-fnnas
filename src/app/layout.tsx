import type {ReactNode} from 'react';
import ThemeProvider from '@/components/ThemeProvider';
import './globals.css';

const themeInitScript = `
(function () {
  try {
    var mode = localStorage.getItem('mijia_geek_ai_theme_mode') || 'dark';
    if (mode !== 'light' && mode !== 'dark' && mode !== 'system') mode = 'dark';
    var resolved = mode === 'system'
      ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : mode;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themeMode = mode;
    document.documentElement.style.colorScheme = resolved;
  } catch (error) {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.dataset.themeMode = 'dark';
    document.documentElement.style.colorScheme = 'dark';
  }
})();
`;

export default function RootLayout({
                                       children,
                                   }: {
    children: ReactNode;
}) {
    return (
        <html lang="zh-CN" suppressHydrationWarning>
        <head>
        <script dangerouslySetInnerHTML={{__html: themeInitScript}}/>
        </head>
        <body>
        <ThemeProvider>{children}</ThemeProvider>
        </body>
        </html>
    );
}
