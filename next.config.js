/** @type {import('next').NextConfig} */
const nextConfig = {
  // 输出可独立运行的 Node.js 服务，便于复制到飞牛 Native 应用包
  output: 'standalone',

  // 实验性功能
  experimental: {
    // 服务器端外部包
    serverComponentsExternalPackages: ['ws', 'elliptic', 'bn.js'],

    // 启用服务器操作
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  
  // Webpack 配置
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // 客户端不包含这些模块
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        ws: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
