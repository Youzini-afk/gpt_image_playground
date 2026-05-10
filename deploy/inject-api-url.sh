#!/bin/sh

# 用环境变量替换前端默认 API URL（兼容旧 API_URL）
DEFAULT_API_URL=${DEFAULT_API_URL:-${API_URL:-https://api.openai.com/v1}}
DOCKER_LEGACY_API_URL_USED=${DOCKER_LEGACY_API_URL_USED:-false}
if [ -n "$API_URL" ]; then
    DOCKER_LEGACY_API_URL_USED=true
fi

API_PROXY_AVAILABLE=false
if [ "$ENABLE_API_PROXY" = "true" ] || [ "$API_PROXY" = "true" ]; then
    API_PROXY_AVAILABLE=true
fi

API_PROXY_LOCKED=false
if [ "$ENABLE_API_PROXY" = "true" ] && [ "$LOCK_API_PROXY" = "true" ]; then
    API_PROXY_LOCKED=true
fi

# 查找所有 js 文件并将占位符替换为运行时配置
find /app/dist/assets -type f -name "*.js" -exec sed -i "s|__VITE_DEFAULT_API_URL_PLACEHOLDER__|$DEFAULT_API_URL|g" {} +
find /app/dist/assets -type f -name "*.js" -exec sed -i "s|__VITE_API_PROXY_AVAILABLE_PLACEHOLDER__|$API_PROXY_AVAILABLE|g" {} +
find /app/dist/assets -type f -name "*.js" -exec sed -i "s|__VITE_API_PROXY_LOCKED_PLACEHOLDER__|$API_PROXY_LOCKED|g" {} +
find /app/dist/assets -type f -name "*.js" -exec sed -i "s|__VITE_DOCKER_DEPLOYMENT_PLACEHOLDER__|true|g" {} +
find /app/dist/assets -type f -name "*.js" -exec sed -i "s|__VITE_DOCKER_LEGACY_API_URL_USED_PLACEHOLDER__|$DOCKER_LEGACY_API_URL_USED|g" {} +

exec "$@"
