<#
.SYNOPSIS
    FluffOS 驱动构建脚本 - 支持预编译下载和本地编译

.DESCRIPTION
    默认从 GitHub Releases 下载预编译的 FluffOS 驱动（秒级完成）。
    使用 -Build 开关从源码本地编译（需要 MSYS2 环境）。

.PARAMETER Version
    指定 FluffOS 版本号，如 "v2026.0901.0"。默认获取最新版本。

.PARAMETER Build
    从源码本地编译，而非下载预编译包。需要已安装 MSYS2。

.PARAMETER Force
    强制覆盖已存在的 bin\driver.exe。

.PARAMETER Proxy
    下载代理地址，如 "http://127.0.0.1:7890"。

.EXAMPLE
    .\build.ps1                        # 下载最新版预编译包
    .\build.ps1 -Version v2026.0901.0  # 下载指定版本
    .\build.ps1 -Build                 # 本地编译
    .\build.ps1 -Force                 # 强制覆盖已有驱动
#>

[CmdletBinding()]
param(
    [string]$Version,
    [switch]$Build,
    [switch]$Force,
    [string]$Proxy
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$RootDir = $PSScriptRoot
$BinDir = Join-Path $RootDir 'bin'
$DriverExe = Join-Path $BinDir 'driver.exe'

# --- 工具函数 ---

function Write-Step($msg) { Write-Host ">> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "   $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "   $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "   $msg" -ForegroundColor Red }

function Get-LatestVersion {
    Write-Step '查询 FluffOS 最新版本...'
    try {
        $params = @{
            Uri     = 'https://api.github.com/repos/fluffos/fluffos/releases/latest'
            Headers = @{ 'User-Agent' = 'mud-build-script' }
        }
        if ($Proxy) { $params['Proxy'] = $Proxy }
        $release = Invoke-RestMethod @params
        $tag = $release.tag_name
        Write-Ok "最新版本: $tag"
        return $tag
    } catch {
        Write-Err "无法查询 GitHub Releases: $_"
        Write-Warn '请检查网络连接，或使用 -Proxy 参数设置代理'
        throw
    }
}

function Get-ReleaseVersion($ver) {
    if ($ver -and $ver -notmatch '^v') { $ver = "v$ver" }
    return $ver
}

# --- 下载预编译包 ---

function Install-Prebuilt($ver) {
    $ver = Get-ReleaseVersion $ver
    $zipName = "fluffos-$ver-windows-x86_64.zip"
    $downloadUrl = "https://github.com/fluffos/fluffos/releases/download/$ver/$zipName"
    $tempZip = Join-Path $RootDir $zipName

    Write-Step "下载 $ver Windows 预编译包..."
    Write-Host "   URL: $downloadUrl"

    try {
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add('User-Agent', 'mud-build-script')
        if ($Proxy) {
            $wc.Proxy = New-Object System.Net.WebProxy($Proxy)
        }

        # 异步下载 + 进度显示
        $downloadTask = $wc.DownloadFileTaskAsync($downloadUrl, $tempZip)
        while (-not $downloadTask.IsCompleted) {
            Start-Sleep -Milliseconds 500
            if (Test-Path $tempZip) {
                $received = (Get-Item $tempZip).Length
                $mb = [math]::Round($received / 1MB, 1)
                Write-Host "`r   已下载 ${mb} MB..." -NoNewline
            }
        }
        Write-Host ''

        if (-not (Test-Path $tempZip)) {
            throw '下载失败，文件不存在'
        }
        $fileSize = [math]::Round((Get-Item $tempZip).Length / 1MB, 1)
        Write-Ok "下载完成 (${fileSize} MB)"
    } catch {
        Write-Err "下载失败: $_"
        Write-Warn '提示: 如果下载缓慢，可尝试 -Proxy http://127.0.0.1:7890'
        throw
    }

    Write-Step '解压到 bin 目录...'
    $tempDir = Join-Path $RootDir '_fluffos_temp'
    if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
    Expand-Archive -Path $tempZip -DestinationPath $tempDir -Force

    # 复制 exe 文件到 bin/
    if (-not (Test-Path $BinDir)) { New-Item -ItemType Directory -Path $BinDir | Out-Null }
    $exeFiles = Get-ChildItem -Path $tempDir -Recurse -Filter '*.exe'
    foreach ($exe in $exeFiles) {
        $dest = Join-Path $BinDir $exe.Name
        Copy-Item $exe.FullName $dest -Force
        Write-Ok "  $($exe.Name) -> bin\"
    }

    # 清理临时文件
    Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue

    Write-Ok '预编译包安装完成！'
}

# --- 本地编译 ---

function Invoke-LocalBuild {
    $msys2Bash = 'C:\msys64\usr\bin\bash.exe'
    if (-not (Test-Path $msys2Bash)) {
        Write-Err "未找到 MSYS2 ($msys2Bash)"
        Write-Warn '请先安装 MSYS2: https://www.msys2.org/'
        throw
    }

    $buildScript = Join-Path $RootDir 'build_msys2.sh'
    if (-not (Test-Path $buildScript)) {
        Write-Err "未找到 $buildScript"
        throw
    }

    Write-Step '在 MSYS2 MinGW64 环境下编译 FluffOS...'
    Write-Warn '本地编译可能需要 10-30 分钟，请耐心等待'

    $env:MSYSTEM = 'MINGW64'
    $env:CHERE_INVOKING = '1'
    $env:MSYS2_PATH_TYPE = 'inherit'

    # 转换 Windows 路径为 MSYS2 路径
    $drive = $RootDir.Substring(0, 1).ToLower()
    $rest = $RootDir.Substring(3).Replace('\', '/')
    $msysPath = "/$drive/$rest"

    & $msys2Bash -lc "cd $msysPath; bash build_msys2.sh"

    if ($LASTEXITCODE -ne 0) {
        Write-Err "编译失败 (exit code: $LASTEXITCODE)"
        throw
    }

    if (Test-Path $DriverExe) {
        Write-Ok '编译成功！driver.exe 已就位'
    } else {
        Write-Err '编译完成但 driver.exe 未找到'
        throw
    }
}

# --- 主流程 ---

Write-Host ''
Write-Host '  FluffOS 驱动构建工具' -ForegroundColor White
Write-Host '  ====================' -ForegroundColor DarkGray
Write-Host ''

# 检查是否已存在 driver.exe
if ((Test-Path $DriverExe) -and -not $Force) {
    $existingVersion = (Get-Item $DriverExe).LastWriteTime
    Write-Warn "driver.exe 已存在 (最后修改: $existingVersion)"
    Write-Warn '使用 -Force 强制覆盖'

    $answer = Read-Host '   是否继续 (y/N)'
    if ($answer -notin @('y', 'Y', 'yes')) {
        Write-Host '   已取消。' -ForegroundColor Gray
        exit 0
    }
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()

try {
    if ($Build) {
        Invoke-LocalBuild
    } else {
        if (-not $Version) {
            $Version = Get-LatestVersion
        }
        Install-Prebuilt $Version
    }
} catch {
    Write-Err "构建失败: $_"
    exit 1
}

$sw.Stop()
Write-Host ''
Write-Host "  总耗时: $([math]::Round($sw.Elapsed.TotalSeconds, 1))s" -ForegroundColor DarkGray
Write-Host ''

# 验证结果
if (Test-Path $DriverExe) {
    $size = [math]::Round((Get-Item $DriverExe).Length / 1MB, 1)
    Write-Host "  driver.exe 已就绪 (${size} MB)" -ForegroundColor Green
    Write-Host '  运行 .\run.ps1 启动 MUD' -ForegroundColor Gray
} else {
    Write-Err 'driver.exe 未找到，构建可能失败'
    exit 1
}
