<#
.SYNOPSIS
    一键 Docker 部署启动 MUD 服务

.DESCRIPTION
    自动完成环境检测、端口冲突检查、镜像构建、容器启动、就绪检查，并输出访问信息。

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
function Write-Detail($msg) { Write-Host "     $msg" -ForegroundColor DarkGray }

# 安全执行外部命令，保留 $LASTEXITCODE
# 用法: $output = Invoke-SafeCommand docker version --format '{{.Server.Version}}'
function Invoke-SafeCommand {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Command, [string[]]$Arguments = @())
    if ($Arguments.Count -gt 0) {
        & $Command @Arguments 2>&1
    } else {
        & $Command 2>&1
    }
    return $LASTEXITCODE
}

# 检查端口是否被占用
function Test-PortAvailable([int]$Port) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect('127.0.0.1', $Port)
        $tcp.Close()
        return $false  # 可连接 = 已占用
    } catch {
        return $true   # 连接失败 = 可用
    }
}

# 输出失败诊断信息
function Show-Diagnostics {
    param([string]$ComposeCmd)
    Write-Host ''
    Write-Err '部署失败，最近日志:'
    Write-Host ''

    # 尝试获取容器日志
    $logOutput = docker compose logs --tail 50 2>&1
    if ($logOutput) {
        $logOutput | ForEach-Object { Write-Host "     $_" -ForegroundColor DarkGray }
    } else {
        Write-Warn '无法获取容器日志 (容器可能未成功创建)'
    }

    Write-Host ''
    Write-Host '  可能的原因:' -ForegroundColor Yellow
    Write-Host '    1. Docker 镜像构建失败 (检查网络/Disk 空间)' -ForegroundColor Gray
    Write-Host '    2. 端口被其他程序占用 (运行 netstat -ano | findstr "5566 6666 8888")' -ForegroundColor Gray
    Write-Host '    3. config.cfg 配置有误' -ForegroundColor Gray
    Write-Host '    4. mudcore 子模块未初始化 (运行 git submodule update --init)' -ForegroundColor Gray
    Write-Host ''
}

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
    $dockerVersion = (docker version --format '{{.Server.Version}}' 2>$null)
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

# 检查 Docker Compose (plugin -> standalone)
$composeCmd = $null
try {
    $null = docker compose version 2>$null
    if ($LASTEXITCODE -eq 0) {
        $composeCmd = 'docker compose'
        Write-Ok 'Docker Compose (plugin)'
    } else {
        throw 'plugin not available'
    }
} catch {
    try {
        $null = docker-compose version 2>$null
        if ($LASTEXITCODE -eq 0) {
            $composeCmd = 'docker-compose'
            Write-Ok 'docker-compose (standalone)'
        } else {
            throw 'standalone not available'
        }
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

# 检查 mudcore 子模块 (为空时自动初始化)
$mudcoreDir = Join-Path $RootDir 'mudcore'
if ((Test-Path $mudcoreDir) -and (Get-ChildItem $mudcoreDir -ErrorAction SilentlyContinue | Measure-Object).Count -eq 0) {
    Write-Warn 'mudcore/ 为空，正在自动初始化...'
    $gitmodules = Join-Path $RootDir '.gitmodules'
    if (Test-Path $gitmodules) {
        Push-Location $RootDir
        try {
            # git 把进度信息输出到 stderr，PowerShell 会误报为错误
            # 临时切换 ErrorActionPreference 以避免 NativeCommandError
            $prevEAP = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            try {
                $null = git submodule update --init 2>&1
            } finally {
                $ErrorActionPreference = $prevEAP
            }
            if ($LASTEXITCODE -eq 0) {
                Write-Ok 'mudcore 子模块已初始化'
            } else {
                Write-Err '子模块初始化失败，请手动运行: git submodule update --init'
                exit 1
            }
        } finally {
            Pop-Location
        }
    } else {
        Write-Err '未找到 .gitmodules (项目可能不是通过 git clone 获取的)'
        Write-Host '  请重新克隆: git clone --recurse-submodules <repo-url>' -ForegroundColor Gray
        exit 1
    }
}

# --- 端口冲突预检 ---

Write-Step '检查端口占用...'

$requiredPorts = @(5566, 6666, 8888)
$portConflict = $false

foreach ($port in $requiredPorts) {
    if (-not (Test-PortAvailable $port)) {
        # 端口被占用 — 但可能是我们自己的容器
        $ownContainer = docker compose ps --format '{{.Ports}}' 2>$null | Select-String ":$port->"
        if ($ownContainer) {
            Write-Detail "端口 $port (本容器已占用，将重新创建)"
        } else {
            Write-Err "端口 $port 已被其他程序占用"
            $portConflict = $true
        }
    } else {
        Write-Detail "端口 $port 可用"
    }
}

if ($portConflict) {
    Write-Host ''
    Write-Host '  请先释放端口或修改 config.cfg 中的端口配置' -ForegroundColor Gray
    Write-Host '  运行 netstat -ano | findstr "5566 6666 8888" 查看占用情况' -ForegroundColor Gray
    Write-Host ''
    exit 1
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

# 执行 docker compose up (使用 & 替代 Invoke-Expression，避免命令注入和错误丢失)
# 构建完整参数数组 (确保所有元素都是数组成员，避免字符串+数组拼接 bug)
$composeArgs = @()
if ($composeCmd -eq 'docker compose') {
    $composeExe = 'docker'
    $composeArgs += 'compose'    # 'compose' 作为 docker 的子命令
} else {
    $composeExe = 'docker-compose'
}
$composeArgs += 'up', '-d'
if ($profileArg) { $composeArgs += $profileArg -split ' ' }
if ($buildFlag)  { $composeArgs += $buildFlag }

Write-Host ''

# 主部署流程 — 用 try/catch 保护，确保任何异常都能输出诊断信息
# docker compose up --build 把构建进度输出到 stderr，
# PowerShell 会误报为 NativeCommandError，临时切换 ErrorActionPreference
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    try {
        & $composeExe $composeArgs 2>&1 | ForEach-Object { Write-Host "     $_" }
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prevEAP
    }
} catch {
    Write-Host ''
    Write-Err "命令执行异常: $_"
    Show-Diagnostics $composeCmd
    exit 1
}

if ($exitCode -ne 0) {
    Show-Diagnostics $composeCmd

    # 尝试清理失败的容器
    Write-Step '清理失败的容器...'
    docker compose down --remove-orphans 2>$null
    exit 1
}

Write-Ok '容器已启动'

# --- 就绪检查 ---

Write-Step '等待服务就绪...'

$timeout = 90
$elapsed = 0
$ready = $false

while ($elapsed -lt $timeout) {
    Start-Sleep -Seconds 2
    $elapsed += 2

    $psOutput = docker compose ps 2>$null

    # 容器退出或不存在
    if (-not $psOutput -or $psOutput -match 'exited|dead|restart') {
        if ($psOutput -match 'exited|dead') {
            Write-Host ''
            Write-Err '容器已退出'
            Show-Diagnostics $composeCmd
            exit 1
        }
        Write-Host '.' -NoNewline -ForegroundColor DarkGray
        continue
    }

    # docker compose ps 默认输出 "Up X minutes" 表示运行中
    if ($psOutput -match '\bUp\b') {
        $ready = $true
        break
    }

    Write-Host '.' -NoNewline -ForegroundColor DarkGray
}

Write-Host ''

if (-not $ready) {
    Write-Warn "服务在 ${timeout} 秒内未就绪"
    Write-Host ''
    Write-Host '  服务可能仍在启动中，请稍后手动检查:' -ForegroundColor Gray
    Write-Host "    docker compose logs" -ForegroundColor White
    Write-Host "    docker compose ps" -ForegroundColor White
    Write-Host ''
} else {
    Write-Ok "服务就绪 (${elapsed}s)"
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

if ($ready) {
    Write-Host ''
    Write-Ok '部署成功！'
}

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
