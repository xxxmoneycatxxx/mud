#!/bin/bash
#
# 一键 Docker 部署启动 MUD 服务
#
# 用法:
#   ./docker-deploy.sh              # 一键部署
#   ./docker-deploy.sh -d           # 调试模式
#   ./docker-deploy.sh --rebuild    # 重建镜像
#   ./docker-deploy.sh --stop       # 停止服务
#   ./docker-deploy.sh --logs       # 查看日志
#

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$ROOT_DIR/config.cfg"
EXAMPLE_ENV="$ROOT_DIR/data/.env.example"
ENV_FILE="$ROOT_DIR/data/.env"

# 默认参数
DEBUG_MODE=0
REBUILD=0
STOP=0
LOGS=0

# --- 工具函数 ---

step()  { echo "  >> $1"; }
ok()    { echo "     $1"; }
warn()  { echo "     [!] $1"; }
err()   { echo "     [错误] $1" >&2; }

usage() {
    cat <<'EOF'
用法: ./docker-deploy.sh [选项]

选项:
  -d, --debug       调试模式启动
  --rebuild         强制重新构建镜像
  --stop            停止并移除容器
  --logs            查看容器日志
  -h, --help        显示帮助

示例:
  ./docker-deploy.sh              # 一键部署
  ./docker-deploy.sh -d           # 调试模式
  ./docker-deploy.sh --rebuild    # 重建镜像
  ./docker-deploy.sh --stop       # 停止服务
EOF
    exit 0
}

# --- 参数解析 ---

while [[ $# -gt 0 ]]; do
    case "$1" in
        -d|--debug)   DEBUG_MODE=1; shift ;;
        --rebuild)    REBUILD=1; shift ;;
        --stop)       STOP=1; shift ;;
        --logs)       LOGS=1; shift ;;
        -h|--help)    usage ;;
        *)            echo "  未知参数: $1"; usage ;;
    esac
done

# --- 停止服务 ---

if [ "$STOP" -eq 1 ]; then
    echo ""
    echo "  正在停止 MUD 服务..."
    echo ""
    docker compose down
    echo ""
    echo "  服务已停止"
    echo ""
    exit 0
fi

# --- 查看日志 ---

if [ "$LOGS" -eq 1 ]; then
    docker compose logs -f
    exit 0
fi

# --- 启动横幅 ---

echo ""
echo "  MUD Docker 部署"
echo "  ================"
echo ""

# --- 环境检测 ---

step "检测 Docker 环境..."

# 检查 Docker
if ! command -v docker &>/dev/null; then
    err "Docker 未安装"
    echo ""
    echo "  请先安装 Docker:"
    echo "    https://docs.docker.com/get-docker/"
    echo ""
    exit 1
fi

if ! docker info &>/dev/null; then
    err "Docker 未运行或当前用户无权限"
    echo ""
    echo "  尝试: sudo systemctl start docker"
    echo "  或: sudo usermod -aG docker \$USER"
    echo ""
    exit 1
fi

DOCKER_VERSION=$(docker version --format '{{.Server.Version}}' 2>/dev/null)
ok "Docker $DOCKER_VERSION"

# 检查 Docker Compose
COMPOSE_CMD=""
if docker compose version &>/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
    ok "Docker Compose (plugin)"
elif command -v docker-compose &>/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
    ok "docker-compose (standalone)"
else
    err "Docker Compose 不可用"
    exit 1
fi

# --- 配置检测 ---

step "检测配置文件..."

if [ ! -f "$CONFIG_FILE" ]; then
    err "配置文件不存在: $CONFIG_FILE"
    exit 1
fi
ok "config.cfg"

# 自动创建 .env
if [ ! -f "$ENV_FILE" ] && [ -f "$EXAMPLE_ENV" ]; then
    cp "$EXAMPLE_ENV" "$ENV_FILE"
    ok "data/.env 已从示例复制"
fi

# 检查 mudcore 子模块
MUDCORE_DIR="$ROOT_DIR/mudcore"
if [ -d "$MUDCORE_DIR" ] && [ -z "$(ls -A "$MUDCORE_DIR" 2>/dev/null)" ]; then
    warn "mudcore/ 为空，请运行: git submodule update --init"
fi

# --- 解析配置 ---

MUD_NAME="MUD"
if [ -f "$CONFIG_FILE" ]; then
    PARSED_NAME=$(grep -E '^\s*name\s*:\s*' "$CONFIG_FILE" 2>/dev/null | head -1 | sed 's/^[^:]*:\s*//' | sed 's/\s*$//')
    if [ -n "$PARSED_NAME" ]; then
        MUD_NAME="$PARSED_NAME"
    fi
fi

# --- 构建/启动 ---

echo ""
echo "  $MUD_NAME"
echo "  $(printf '=%.0s' $(seq 1 $((${#MUD_NAME} + 4))))"
echo ""

BUILD_FLAG=""
if [ "$REBUILD" -eq 1 ]; then
    step "强制重新构建镜像..."
    BUILD_FLAG="--build"
elif [ -z "$(docker images -q fluffos-mud 2>/dev/null)" ]; then
    step "首次部署，构建镜像 (这可能需要几分钟)..."
    BUILD_FLAG="--build"
else
    step "启动容器..."
fi

# 选择 profile
PROFILE_ARG=""
if [ "$DEBUG_MODE" -eq 1 ]; then
    PROFILE_ARG="--profile dev"
    ok "模式: 调试模式"
else
    ok "模式: 正常模式"
fi

# 执行 docker compose up
echo ""
$COMPOSE_CMD up -d $PROFILE_ARG $BUILD_FLAG
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo ""
    err "部署失败，显示错误日志:"
    echo ""
    $COMPOSE_CMD logs --tail 30
    exit 1
fi

# --- 就绪检查 ---

echo ""
step "等待服务就绪..."

READY=0
for i in $(seq 1 30); do
    sleep 1
    if $COMPOSE_CMD ps 2>/dev/null | grep -q "running"; then
        READY=1
        break
    fi
done

if [ "$READY" -eq 0 ]; then
    warn "容器可能未正常启动，请检查日志:"
    echo "    $COMPOSE_CMD logs"
    echo ""
fi

# --- 读取端口 ---

PORTS=()
if [ -f "$CONFIG_FILE" ]; then
    while IFS= read -r line; do
        proto=$(echo "$line" | sed 's/.*:\s*\(\w\+\)\s\+\([0-9]\+\).*/\1/')
        port=$(echo "$line" | sed 's/.*:\s*\(\w\+\)\s\+\([0-9]\+\).*/\2/')
        PORTS+=("$proto $port")
    done < <(grep -E '^\s*external_port_[0-9]+\s*:' "$CONFIG_FILE" 2>/dev/null)
fi

# --- 输出访问信息 ---

echo ""
ok "部署成功！"
echo ""
echo "  访问信息:"
echo ""

for entry in "${PORTS[@]}"; do
    proto=$(echo "$entry" | cut -d' ' -f1)
    port=$(echo "$entry" | cut -d' ' -f2)
    case "$proto" in
        telnet)
            echo "    Telnet:    localhost:$port"
            ;;
        websocket)
            echo "    WebSocket: http://localhost:$port/"
            ;;
        *)
            echo "    $proto: localhost:$port"
            ;;
    esac
done

echo ""
echo "  推荐客户端: Mudlet (https://www.mudlet.org/)"
echo ""
echo "  常用命令:"
echo "    ./docker-deploy.sh --logs       # 查看日志"
echo "    ./docker-deploy.sh -d           # 调试模式"
echo "    ./docker-deploy.sh --rebuild    # 重建镜像"
echo "    ./docker-deploy.sh --stop       # 停止服务"
echo ""

# 调试模式下自动跟踪日志
if [ "$DEBUG_MODE" -eq 1 ]; then
    echo "  [调试模式] 正在跟踪日志..."
    echo ""
    $COMPOSE_CMD logs -f
fi
