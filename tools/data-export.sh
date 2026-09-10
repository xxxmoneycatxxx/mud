#!/bin/bash
#
# 导出 MUD 运行时数据，打包为带时间戳的 ZIP 用于服务器迁移
#
# 用法:
#   ./tools/data-export.sh                    # 导出到 backup/
#   ./tools/data-export.sh -o /path/to/dir    # 导出到指定目录
#

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$ROOT_DIR/data"
OUTPUT_DIR="$ROOT_DIR/backup"

# 解析参数
while [[ $# -gt 0 ]]; do
    case "$1" in
        -o|--output) OUTPUT_DIR="$2"; shift 2 ;;
        -h|--help)
            cat <<'EOF'
用法: ./tools/data-export.sh [选项]

选项:
  -o, --output <dir>  输出目录（默认: backup/）
  -h, --help          显示帮助
EOF
            exit 0
            ;;
        *) echo "未知参数: $1"; exit 1 ;;
    esac
done

# --- 工具函数 ---

step()  { echo "  >> $1"; }
ok()    { echo "     $1"; }
warn()  { echo "     [!] $1"; }
err()   { echo "     [错误] $1" >&2; }

# --- 横幅 ---

echo ""
echo "  MUD 数据导出"
echo "  ============"
echo ""

# --- 检测 ---

step '检测数据目录...'

if [ ! -d "$DATA_DIR" ]; then
    err "数据目录不存在: $DATA_DIR"
    exit 1
fi
ok "data/"

# 检查是否有运行时数据（排除 .env / .env.example / .gitignore）
DATA_ITEMS=$(find "$DATA_DIR" -maxdepth 1 \
    ! -name '.env' ! -name '.env.example' ! -name '.gitignore' \
    ! -path "$DATA_DIR" -prune)

if [ -z "$DATA_ITEMS" ]; then
    warn 'data/ 下没有需要导出的运行时数据'
    exit 0
fi

# 统计文件数和大小
FILE_COUNT=$(find "$DATA_DIR" -type f \
    ! -name '.env' ! -name '.env.example' ! -name '.gitignore' | wc -l)
TOTAL_SIZE=$(find "$DATA_DIR" -type f \
    ! -name '.env' ! -name '.env.example' ! -name '.gitignore' \
    -exec stat -f%z {} + 2>/dev/null || find "$DATA_DIR" -type f \
    ! -name '.env' ! -name '.env.example' ! -name '.gitignore' \
    -exec stat -c%s {} + 2>/dev/null)
TOTAL_SIZE_KB=$(( ${TOTAL_SIZE:-0} / 1024 ))

ok "找到 $FILE_COUNT 个文件，共 ${TOTAL_SIZE_KB} KB"

# 检查 ai_service 数据
AI_DATA_DIR="$ROOT_DIR/ai_service/data"
HAS_AI_DATA=0
if [ -d "$AI_DATA_DIR" ]; then
    AI_COUNT=$(find "$AI_DATA_DIR" -maxdepth 1 ! -name '.gitignore' ! -path "$AI_DATA_DIR" -prune | wc -l)
    if [ "$AI_COUNT" -gt 0 ]; then
        HAS_AI_DATA=1
        ok '发现 ai_service/data/ 数据，将一并打包'
    fi
fi

# --- 准备暂存目录 ---

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
ZIP_NAME="mud-data-${TIMESTAMP}.zip"

mkdir -p "$OUTPUT_DIR"
ZIP_PATH="$OUTPUT_DIR/$ZIP_NAME"

STAGING_DIR="$OUTPUT_DIR/.export-staging-$TIMESTAMP"
STAGING_DATA="$STAGING_DIR/data"

step '准备暂存目录...'
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DATA"

# --- 复制数据 ---

step '复制运行时数据...'

# 使用 rsync 排除不需要的文件，若不可用则回退到 cp + find
if command -v rsync &>/dev/null; then
    rsync -a --exclude='.env' --exclude='.env.example' --exclude='.gitignore' \
        "$DATA_DIR/" "$STAGING_DATA/"
else
    # 回退：逐个复制，跳过排除项
    for item in "$DATA_DIR"/*; do
        base=$(basename "$item")
        case "$base" in
            .env|.env.example|.gitignore) continue ;;
        esac
        if [ -d "$item" ]; then
            mkdir -p "$STAGING_DATA/$base"
            find "$item" -type f ! -name '.gitignore' | while read -r f; do
                rel="${f#$item/}"
                dest_dir="$STAGING_DATA/$base/$(dirname "$rel")"
                mkdir -p "$dest_dir"
                cp "$f" "$STAGING_DATA/$base/$rel"
            done
        else
            cp "$item" "$STAGING_DATA/"
        fi
    done
fi

# 列出已复制的顶层项
for item in "$STAGING_DATA"/*; do
    echo "     + data/$(basename "$item")"
done

# 复制 ai_service 数据
if [ "$HAS_AI_DATA" -eq 1 ]; then
    STAGING_AI="$STAGING_DIR/ai_service/data"
    mkdir -p "$STAGING_AI"
    if command -v rsync &>/dev/null; then
        rsync -a --exclude='.gitignore' "$AI_DATA_DIR/" "$STAGING_AI/"
    else
        find "$AI_DATA_DIR" -type f ! -name '.gitignore' | while read -r f; do
            rel="${f#$AI_DATA_DIR/}"
            dest_dir="$STAGING_AI/$(dirname "$rel")"
            mkdir -p "$dest_dir"
            cp "$f" "$STAGING_AI/$rel"
        done
    fi
    echo "     + ai_service/data/"
fi

# --- 打包 ---

step "打包为 $ZIP_NAME..."

if ! command -v zip &>/dev/null; then
    err '未找到 zip 命令，请先安装: apt install zip / yum install zip'
    rm -rf "$STAGING_DIR"
    exit 1
fi

# 在暂存目录内打包，保持 data/ 和 ai_service/ 的目录结构
(cd "$STAGING_DIR" && zip -r "$ZIP_PATH" . -q)

# --- 清理 ---

step '清理暂存目录...'
rm -rf "$STAGING_DIR"

# --- 结果 ---

ZIP_SIZE=$(stat -f%z "$ZIP_PATH" 2>/dev/null || stat -c%s "$ZIP_PATH" 2>/dev/null)
if [ "${ZIP_SIZE:-0}" -gt 1048576 ]; then
    SIZE_STR="$(( ZIP_SIZE / 1048576 )) MB"
else
    SIZE_STR="$(( ZIP_SIZE / 1024 )) KB"
fi

echo ""
ok "导出完成!"
echo ""
echo "  文件: $ZIP_PATH"
echo "  大小: $SIZE_STR"
echo "  包含: $FILE_COUNT 个运行时数据文件"
if [ "$HAS_AI_DATA" -eq 1 ]; then
    echo "  额外: ai_service 数据"
fi
echo ""
echo "  迁移到新服务器时:"
echo "    1. 解压 ZIP 到项目根目录: unzip $ZIP_NAME -d /path/to/mud/"
echo "    2. 从 data/.env.example 生成新的 data/.env"
echo "    3. 启动服务: ./docker-deploy.sh"
echo ""
