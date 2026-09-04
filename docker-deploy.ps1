<#
.SYNOPSIS
    一键 Docker 部署启动 MUD 服务

.DESCRIPTION
    自动完成环境检测、镜像构建、容器启动、就绪检查，并输出访问信息。

.PARAMETER DebugMode
    以调试模式启动，输出详细日志到控制台。

.PARAMETER Rebuild
    强制重新构建 Docker 镜像 (相当于 docker compose up --build)。

.PARAMETER Stop
    停止并移除运行中的容器。

.PARAMETER Logs
    启动后持续输出容器日志。

.EXAMPLE
    .\docker-deploy.ps1              # 一键部署
    .\docker-deploy.ps1 -DebugMode   # 调试模式
    .\docker-deploy.ps1 -Rebuild     # 重建镜像
    .\docker-deploy.ps1 -Stop        # 停止服务
    .\docker-deploy.ps1 -Logs        # 查看日志
#>

[CmdletBinding()]
param(
    [switch]$DebugMode,
    [switch]$Rebuild,
    [switch]$Stop,
    [switch]$Logs
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$RootDir = $PSScriptRoot
$ConfigFile = Join-Path $RootDir 'config.cfg'
$ExampleEnv = Join-Path $RootDir 'data\.env.example'
$EnvFile = Join-Path $RootDir 'data\.env'

# --- 工具函数 ---

function Write-Step($msg)  { Write-Host "  >> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "     $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "     $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "     [错误] $msg" -ForegroundColor Red }

# --- 停止服务 ---

if ($Stop) {
    Write-Host ''
    Write-Host '  正在停止 MUD 服务...' -ForegroundColor Yellow
    Write-Host ''
    docker compose down
    Write-Host ''
    Write-Host '  服务已停止' -ForegroundColor Green
    Write-Host ''
    exit 0
}

# --- 查看日志 ---

if ($Logs) {
    docker compose logs -f
    exit 0
}

# --- 启动横幅 ---

Write-Host ''
Write-Host '  MUD Docker 部署' -ForegroundColor White
Write-Host '  ================' -ForegroundColor DarkGray
Write-Host ''

# --- 环境检测 ---

Write-Step '检测 Docker 环境...'

# 检查 Docker
try {
    $dockerVersion = docker version --format '{{.Server.Version}}' 2>$null
    if (-not $dockerVersion) { throw 'Docker 未运行' }
    Write-Ok "Docker $dockerVersion"
} catch {
    Write-Err 'Docker 未安装或未运行'
    Write-Host ''
    Write-Host '  请先安装 Docker Desktop:' -ForegroundColor Gray
    Write-Host '    https://www.docker.com/products/docker-desktop/' -ForegroundColor White
    Write-Host ''
    exit 1
}

# 检查 Docker Compose
$composeCmd = $null
try {
    $null = docker compose version 2>$null
    $composeCmd = 'docker compose'
    Write-Ok 'Docker Compose (plugin)'
} catch {
    try {
        $null = docker-compose version 2>$null
        $composeCmd = 'docker-compose'
        Write-Ok 'docker-compose (standalone)'
    } catch {
        Write-Err 'Docker Compose 不可用'
        exit 1
    }
}

# --- 配置检测 ---

Write-Step '检测配置文件...'

if (-not (Test-Path $ConfigFile)) {
    Write-Err "配置文件不存在: $ConfigFile"
    exit 1
}
Write-Ok 'config.cfg'

# 自动创建 .env
if (-not (Test-Path $EnvFile) -and (Test-Path $ExampleEnv)) {
    Copy-Item $ExampleEnv $EnvFile
    Write-Ok 'data\.env 已从示例复制'
}

# 检查 mudcore 子模块
$mudcoreDir = Join-Path $RootDir 'mudcore'
if ((Test-Path $mudcoreDir) -and (Get-ChildItem $mudcoreDir -ErrorAction SilentlyContinue | Measure-Object).Count -eq 0) {
    Write-Warn 'mudcore/ 为空，请运行: git submodule update --init'
}

# --- 解析配置 ---

$mudName = 'MUD'
foreach ($line in [System.IO.File]::ReadAllLines($ConfigFile, [System.Text.Encoding]::UTF8)) {
    if ($line -match '^\s*name\s*:\s*(.+?)$') {
        $mudName = $Matches[1].Trim()
        break
    }
}

# --- 构建/启动 ---

Write-Host ''
Write-Host "  $mudName" -ForegroundColor White
Write-Host ('  ' + ('=' * ($mudName.Length + 4))) -ForegroundColor DarkGray
Write-Host ''

$buildFlag = ''
if ($Rebuild) {
    Write-Step '强制重新构建镜像...'
    $buildFlag = '--build'
} elseif (-not (docker images -q fluffos-mud 2>$null)) {
    Write-Step '首次部署，构建镜像 (这可能需要几分钟)...'
    $buildFlag = '--build'
} else {
    Write-Step '启动容器...'
}

# 选择 profile
$profileArg = ''
if ($DebugMode) {
    $profileArg = '--profile dev'
    Write-Ok '模式: 调试模式'
} else {
    Write-Ok '模式: 正常模式'
}

# 执行 docker compose up
$upCmd = "$composeCmd up -d $profileArg $buildFlag".Trim()
Write-Host ''
Invoke-Expression $upCmd
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
    Write-Host ''
    Write-Err '部署失败，显示错误日志:'
    Write-Host ''
    docker compose logs --tail 30
    exit 1
}

# --- 就绪检查 ---

Write-Host ''
Write-Step '等待服务就绪...'

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    $containerState = docker compose ps --format '{{.State}}' 2>$null
    if ($containerState -match 'running') {
        $ready = $true
        break
    }
}

if (-not $ready) {
    Write-Warn '容器可能未正常启动，请检查日志:'
    Write-Host "    $composeCmd logs" -ForegroundColor White
    Write-Host ''
}

# --- 读取端口 ---

$ports = @()
foreach ($line in [System.IO.File]::ReadAllLines($ConfigFile, [System.Text.Encoding]::UTF8)) {
    if ($line -match '^\s*external_port_\d+\s*:\s*(\w+)\s+(\d+)') {
        $ports += [PSCustomObject]@{
            Protocol = $Matches[1]
            Port     = [int]$Matches[2]
        }
    }
}

# --- 输出访问信息 ---

Write-Host ''
Write-Ok '部署成功！' -ForegroundColor Green
Write-Host ''
Write-Host '  访问信息:' -ForegroundColor White
Write-Host ''

foreach ($p in $ports) {
    switch ($p.Protocol) {
        'telnet' {
            Write-Host "    Telnet:    localhost:$($p.Port)" -ForegroundColor Cyan
        }
        'websocket' {
            Write-Host "    WebSocket: http://localhost:$($p.Port)/" -ForegroundColor Cyan
        }
        default {
            Write-Host "    $($p.Protocol): localhost:$($p.Port)" -ForegroundColor Cyan
        }
    }
}

Write-Host ''
Write-Host '  推荐客户端: Mudlet (https://www.mudlet.org/)' -ForegroundColor DarkGray
Write-Host ''
Write-Host '  常用命令:' -ForegroundColor DarkGray
Write-Host "    .\docker-deploy.ps1 -Logs       # 查看日志" -ForegroundColor Gray
Write-Host "    .\docker-deploy.ps1 -DebugMode   # 调试模式" -ForegroundColor Gray
Write-Host "    .\docker-deploy.ps1 -Rebuild     # 重建镜像" -ForegroundColor Gray
Write-Host "    .\docker-deploy.ps1 -Stop        # 停止服务" -ForegroundColor Gray
Write-Host ''

# 调试模式下自动跟踪日志
if ($DebugMode) {
    Write-Host '  [调试模式] 正在跟踪日志...' -ForegroundColor Yellow
    Write-Host ''
    docker compose logs -f
}
