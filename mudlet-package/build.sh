#!/bin/bash
# build_mpackage.sh - 将 mudlet-package/ 打包为 Mudlet 扩展包
# 用法: ./mudlet-package/build.sh [输出目录]
#
# 输出的 .mpackage.zip 可直接在 Mudlet 中安装，
# 也可部署到 Web 服务器供 GMCP Client.GUI 协议自动下载。

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="${1:-$SCRIPT_DIR}"
PACKAGE_NAME="mudren"
OUTPUT_FILE="$OUTPUT_DIR/${PACKAGE_NAME}.mpackage.zip"

# 检查源文件
if [ ! -f "$SCRIPT_DIR/config.lua" ]; then
    echo "错误: config.lua 不存在"
    exit 1
fi

if [ ! -f "$SCRIPT_DIR/mudren.xml" ]; then
    echo "错误: mudren.xml 不存在"
    exit 1
fi

if [ ! -f "$SCRIPT_DIR/.mudlet/Icon/MudRen.png" ]; then
    echo "错误: .mudlet/Icon/MudRen.png 不存在"
    exit 1
fi

# 读取版本号
VERSION=$(grep 'version' "$SCRIPT_DIR/config.lua" | head -1 | sed 's/.*\[\[\(.*\)\]\].*/\1/')
echo "打包 ${PACKAGE_NAME} v${VERSION} ..."

# 创建临时目录
TEMP_DIR=$(mktemp -d)
trap "rm -rf '$TEMP_DIR'" EXIT

# 复制文件到临时目录
cp "$SCRIPT_DIR/config.lua" "$TEMP_DIR/"
cp "$SCRIPT_DIR/mudren.xml" "$TEMP_DIR/"
mkdir -p "$TEMP_DIR/.mudlet/Icon"
cp "$SCRIPT_DIR/.mudlet/Icon/MudRen.png" "$TEMP_DIR/.mudlet/Icon/"

# 打包为 zip（mpackage 本质就是 zip）
cd "$TEMP_DIR"
if command -v zip &> /dev/null; then
    zip -r "$OUTPUT_FILE" config.lua mudren.xml .mudlet/
else
    # 使用 PowerShell 作为后备（Windows/MSYS2 环境）
    powershell.exe -Command "Compress-Archive -Path 'config.lua','mudren.xml','.mudlet' -DestinationPath '$OUTPUT_FILE' -Force"
fi

echo "完成: $OUTPUT_FILE"
echo "文件大小: $(du -h "$OUTPUT_FILE" | cut -f1)"
