###############################################################################
# FluffOS Docker 镜像 - 多阶段构建
#
# 构建: docker build -t fluffos-mud .
# 运行: docker run --rm -p 5566:5566 -p 6666:6666 -p 8888:8888 -v .:/mud fluffos-mud
# 或使用 docker compose: docker compose up -d
###############################################################################

# ---- 阶段 1: 编译 FluffOS ----
FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    bison \
    build-essential \
    autoconf \
    automake \
    cmake \
    pkg-config \
    gcc \
    g++ \
    libjemalloc-dev \
    zlib1g-dev \
    libssl-dev \
    libsqlite3-dev \
    libpcre3-dev \
    libevent-dev \
    libicu-dev \
    libdw-dev \
    libffi-dev \
    libbz2-dev \
    libzstd-dev \
    binutils-dev \
    && rm -rf /var/lib/apt/lists/*

# 克隆 FluffOS 源码
ARG FLUFFOS_VERSION=master
RUN git clone --depth 1 --branch ${FLUFFOS_VERSION} \
    https://github.com/fluffos/fluffos.git /tmp/fluffos

# 编译
WORKDIR /tmp/fluffos/build
RUN cmake \
    -DPACKAGE_DB_MYSQL="" \
    -DPACKAGE_DB_SQLITE=2 \
    -DPACKAGE_DB_DEFAULT_DB=2 \
    -DCMAKE_BUILD_TYPE=Release \
    .. && \
    make -j"$(nproc)" install

# ---- 阶段 2: 最小运行时镜像 ----
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# 仅安装运行时依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjemalloc2 \
    zlib1g \
    libssl3 \
    libsqlite3-0 \
    libpcre3 \
    libevent-2.1-7 \
    libicu70 \
    libdw1 \
    curl \
    python3 \
    locales \
    && rm -rf /var/lib/apt/lists/*

# 配置 UTF-8 区域
RUN locale-gen zh_CN.UTF-8
ENV LANG=zh_CN.UTF-8
ENV LC_ALL=zh_CN.UTF-8

# 从 builder 复制编译好的 driver
COPY --from=builder /tmp/fluffos/build/bin/driver /usr/local/bin/driver

# 设置工作目录
WORKDIR /mud

# 暴露端口
EXPOSE 5566 6666 8888

# 默认入口：运行 driver
ENTRYPOINT ["/usr/local/bin/driver"]
CMD ["config.cfg"]
