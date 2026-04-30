#!/bin/sh

# 用环境变量替换 Vite 构建产物中的占位符
API_URL=${API_URL:-https://api.openai.com}
API_PROXY_AVAILABLE=false
if [ "$ENABLE_API_PROXY" = "true" ]; then
    API_PROXY_AVAILABLE=true
fi

# 查找所有 js 文件并将占位符替换为实际的 API_URL
find /app/dist/assets -type f -name "*.js" -exec sed -i "s|__VITE_DEFAULT_API_URL_PLACEHOLDER__|$API_URL|g" {} +
find /app/dist/assets -type f -name "*.js" -exec sed -i "s|__VITE_API_PROXY_AVAILABLE_PLACEHOLDER__|$API_PROXY_AVAILABLE|g" {} +

exec "$@"