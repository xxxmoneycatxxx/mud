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

# 检查端口是否被占用
check_port() {
    if nc -z 127.0.0.1 "$1" 2>/dev/null; then
        return 1  # 可连接 = 已占用
    else
        return 0  # 连接失败 = 可用
    fi
}

# 输出失败诊断信息
show_diagnostics() {
    echo ""
    err "部署失败，最近日志:"
    echo ""
    docker compose logs --tail 50 2>/dev/null | while IFS= read -r line; do
        echo "     $line"
    done
    echo ""
    echo "  可能的原因:"
    echo "    1. Docker 镜像构建失败 (检查网络/Disk 空间)"
    echo "    2. 端口被其他程序占用 (运行 ss -tlnp | grep '5566\|6666\|8888')"
    echo "    3. config.cfg 配置有误"
    echo "    4. mudcore 子模块未初始化 (运行 git submodule update --init)"
    echo ""
}

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

# 检查 mudcore 子模块 (为空时自动初始化)
MUDCORE_DIR="$ROOT_DIR/mudcore"
if [ -d "$MUDCORE_DIR" ] && [ -z "$(ls -A "$MUDCORE_DIR" 2>/dev/null)" ]; then
    warn "mudcore/ 为空，正在自动初始化..."
    if [ -f "$ROOT_DIR/.gitmodules" ]; then
        if (cd "$ROOT_DIR" && git submodule update --init 2>/dev/null); then
            ok "mudcore 子模块已初始化"
        else
            err "子模块初始化失败，请手动运行: git submodule update --init"
            exit 1
        fi
    else
        err "未找到 .gitmodules (项目可能不是通过 git clone 获取的)"
        echo "  请重新克隆: git clone --recurse-submodules <repo-url>"
        exit 1
    fi
fi

# --- 端口冲突预检 ---

step "检查端口占用..."

REQUIRED_PORTS=(5566 6666 8888)
PORT_CONFLICT=0

for port in "${REQUIRED_PORTS[@]}"; do
    if ! check_port "$port"; then
        # 端口被占用 — 但可能是我们自己的容器
        OWN_CONTAINER=$(docker compose ps --format '{{.Ports}}' 2>/dev/null | grep ":${port}->")
        if [ -n "$OWN_CONTAINER" ]; then
            echo "     端口 $port (本容器已占用，将重新创建)"
        else
            err "端口 $port 已被其他程序占用"
            PORT_CONFLICT=1
        fi
    fi
done

if [ "$PORT_CONFLICT" -eq 1 ]; then
    echo ""
    echo "  请先释放端口或修改 config.cfg 中的端口配置"
    echo "  运行 ss -tlnp | grep '5566\|6666\|8888' 查看占用情况"
    echo ""
    exit 1
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
    show_diagnostics

    # 尝试清理失败的容器
    step "清理失败的容器..."
    docker compose down --remove-orphans 2>/dev/null
    exit 1
fi

ok "容器已启动"

# --- 就绪检查 ---

echo ""
step "等待服务就绪..."

READY=0
TIMEOUT=90
ELAPSED=0

while [ $ELAPSED -lt $TIMEOUT ]; do
    sleep 2
    ELAPSED=$((ELAPSED + 2))

    PS_OUTPUT=$($COMPOSE_CMD ps 2>/dev/null)

    # 容器退出或不存在
    if [ -z "$PS_OUTPUT" ] || echo "$PS_OUTPUT" | grep -qE "exited|dead|restart"; then
        if echo "$PS_OUTPUT" | grep -qE "exited|dead"; then
            echo ""
            err "容器已退出"
            show_diagnostics
            exit 1
        fi
        continue
    fi

    # docker compose ps 默认输出 "Up X minutes" 表示运行中
    if echo "$PS_OUTPUT" | grep -q "Up"; then
        READY=1
        break
    fi
done

if [ "$READY" -eq 0 ]; then
    warn "服务在 ${TIMEOUT} 秒内未就绪"
    echo ""
    echo "  服务可能仍在启动中，请稍后手动检查:"
    echo "    docker compose logs"
    echo "    docker compose ps"
    echo ""
else
    ok "服务就绪 (${ELAPSED}s)"
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

if [ "$READY" -eq 1 ]; then
    echo ""
    ok "部署成功！"
fi

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
