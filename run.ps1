<#
.SYNOPSIS
    启动 MUD 服务

.DESCRIPTION
    启动 FluffOS 驱动运行 MUD 游戏服务。
    自动从 config.cfg 读取端口和 MUD 名称。
    如果 driver.exe 不存在，可自动下载或提示手动构建。

.PARAMETER DebugMode
    以调试模式启动，输出详细日志到控制台。

.PARAMETER AutoBuild
    如果 driver.exe 不存在，自动下载预编译包。

.PARAMETER Config
    指定配置文件路径。默认为 config.cfg。

.PARAMETER Restart
    驱动退出后自动重启。

.PARAMETER TailLog
    启动后实时输出日志文件内容（不影响驱动运行）。

.EXAMPLE
    .\run.ps1                  # 正常启动
    .\run.ps1 -DebugMode       # 调试模式
    .\run.ps1 -AutoBuild       # 自动下载驱动后启动
    .\run.ps1 -Restart         # 崩溃自动重启
#>

[CmdletBinding()]
param(
    [switch]$DebugMode,
    [switch]$AutoBuild,
    [switch]$Restart,
    [string]$Config = 'config.cfg',
    [switch]$TailLog
)

$ErrorActionPreference = 'Stop'

$RootDir = $PSScriptRoot
$DriverExe = Join-Path $RootDir 'bin\driver.exe'
$ConfigFile = Join-Path $RootDir $Config

# --- 配置解析 ---

function Read-ConfigValue($path, $key) {
    if (-not (Test-Path $path)) { return $null }
    foreach ($line in [System.IO.File]::ReadAllLines($path, [System.Text.Encoding]::UTF8)) {
        $line = $line.Trim()
        if ($line -match "^${key}\s*:\s*(.+?)(\s*#.*)?$") {
            return $Matches[1].Trim()
        }
    }
    return $null
}

function Get-PortConfig($path) {
    $ports = @()
    if (-not (Test-Path $path)) { return $ports }
    foreach ($line in [System.IO.File]::ReadAllLines($path, [System.Text.Encoding]::UTF8)) {
        if ($line -match '^\s*external_port_\d+\s*:\s*(\w+)\s+(\d+)') {
            $ports += [PSCustomObject]@{
                Protocol = $Matches[1]
                Port     = [int]$Matches[2]
            }
        }
    }
    return $ports
}

# --- 环境检查 ---

function Test-Environment {
    $issues = @()

    # 检查 data/.env
    $envFile = Join-Path $RootDir 'data\.env'
    if (-not (Test-Path $envFile)) {
        $example = Join-Path $RootDir 'data\.env.example'
        if (Test-Path $example) {
            Copy-Item $example $envFile
            Write-Host '  [auto] data\.env 已从 .env.example 复制' -ForegroundColor DarkYellow
        } else {
            $issues += 'data\.env 和 data\.env.example 均不存在'
        }
    }

    # 检查 mudcore 子模块
    $mudcoreDir = Join-Path $RootDir 'mudcore'
    if ((Test-Path $mudcoreDir) -and (Get-ChildItem $mudcoreDir -ErrorAction SilentlyContinue | Measure-Object).Count -eq 0) {
        $issues += 'mudcore/ 为空，请运行: git submodule update --init'
    }

    if ($issues.Count -gt 0) {
        Write-Host ''
        foreach ($issue in $issues) {
            Write-Host "  [!] $issue" -ForegroundColor Yellow
        }
        Write-Host ''
    }
}

# --- 检查驱动 ---

if (-not (Test-Path $DriverExe)) {
    Write-Host ''
    Write-Host '  driver.exe 未找到' -ForegroundColor Yellow
    Write-Host ''

    if ($AutoBuild) {
        Write-Host '  正在自动下载预编译驱动...' -ForegroundColor Cyan
        & (Join-Path $RootDir 'build.ps1')
        if (-not (Test-Path $DriverExe)) {
            Write-Host '  自动下载失败，请手动运行 .\build.ps1' -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host '  请先运行以下命令下载驱动:' -ForegroundColor Gray
        Write-Host '    .\build.ps1' -ForegroundColor White
        Write-Host ''
        Write-Host '  或从源码编译:' -ForegroundColor Gray
        Write-Host '    .\build.ps1 -Build' -ForegroundColor White
        Write-Host ''
        exit 1
    }
}

# --- 检查配置 ---

if (-not (Test-Path $ConfigFile)) {
    Write-Host "  配置文件未找到: $Config" -ForegroundColor Red
    exit 1
}

# --- 读取配置信息 ---

$mudName = Read-ConfigValue $ConfigFile 'name'
if (-not $mudName) { $mudName = 'MUD' }
$portConfig = Get-PortConfig $ConfigFile

# --- 环境检查 ---

Test-Environment

# --- 启动信息 ---

Write-Host ''
Write-Host "  $mudName" -ForegroundColor White
Write-Host ('  ' + ('=' * ($mudName.Length + 4))) -ForegroundColor DarkGray
Write-Host ''

$driverInfo = Get-Item $DriverExe
Write-Host "  驱动: bin\driver.exe ($([math]::Round($driverInfo.Length / 1MB, 1)) MB)" -ForegroundColor DarkGray
Write-Host "  配置: $Config" -ForegroundColor DarkGray

if ($DebugMode) {
    Write-Host '  模式: 调试模式' -ForegroundColor Yellow
} else {
    Write-Host '  模式: 正常模式' -ForegroundColor DarkGray
}

if ($Restart) {
    Write-Host '  自动重启: 已启用' -ForegroundColor Yellow
}

if ($portConfig.Count -gt 0) {
    Write-Host ''
    Write-Host '  端口:' -ForegroundColor DarkGray
    foreach ($p in $portConfig) {
        $label = switch ($p.Protocol) {
            'telnet'    { 'Telnet' }
            'websocket' { 'WebSocket' }
            default     { $p.Protocol }
        }
        Write-Host "    ${label}: $($p.Port)" -ForegroundColor Gray
    }
}

Write-Host ''

# --- 构建启动参数 ---

$startArgs = @($ConfigFile)
if ($DebugMode) { $startArgs += '-d' }

# --- 设置控制台标题 ---

$host.UI.RawUI.WindowTitle = "$mudName"

# --- 启动驱动 ---

$driverProcess = $null

function Start-Driver {
    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = $DriverExe
    $processInfo.Arguments = ($startArgs -join ' ')
    $processInfo.WorkingDirectory = $RootDir
    $processInfo.UseShellExecute = $false

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $processInfo
    $proc.Start() | Out-Null
    return $proc
}

function Stop-DriverProcess {
    if ($driverProcess -and -not $driverProcess.HasExited) {
        try { $driverProcess.Kill() } catch {}
    }
}

try {
    Write-Host '  启动中...' -ForegroundColor Green
    Write-Host ''

    # 日志跟踪
    $logJob = $null
    if ($TailLog) {
        $logFile = Join-Path $RootDir 'log\debug.log'
        if (Test-Path $logFile) {
            $logJob = Start-Job -ScriptBlock {
                param($file)
                Get-Content $file -Wait -Tail 20
            } -ArgumentList $logFile
        }
    }

    do {
        $driverProcess = Start-Driver

        # 等待进程退出
        while (-not $driverProcess.HasExited) {
            Start-Sleep -Milliseconds 500
        }

        $exitCode = $driverProcess.ExitCode
        $driverProcess.Dispose()
        $driverProcess = $null

        Write-Host ''
        Write-Host "  驱动已退出 (code: $exitCode)" -ForegroundColor Yellow

        if ($Restart) {
            Write-Host '  5 秒后自动重启... (Ctrl+C 取消)' -ForegroundColor Cyan
            Start-Sleep -Seconds 5
            Write-Host '  正在重启...' -ForegroundColor Green
            Write-Host ''
        }
    } while ($Restart)

    # 清理日志任务
    if ($logJob) {
        Stop-Job $logJob -ErrorAction SilentlyContinue
        Remove-Job $logJob -ErrorAction SilentlyContinue
    }
} catch {
    Write-Host ''
    Write-Host "  已中断" -ForegroundColor Yellow
} finally {
    Stop-DriverProcess
}

Write-Host ''
Write-Host '  已退出' -ForegroundColor DarkGray
Write-Host ''
