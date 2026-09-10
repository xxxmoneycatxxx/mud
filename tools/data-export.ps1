<#
.SYNOPSIS
    导出 MUD 运行时数据，打包为带时间戳的 ZIP 用于服务器迁移

.DESCRIPTION
    将 data/ 下的玩家数据、NPC、商店、守护进程等 .o 持久化文件打包为 ZIP。
    自动排除 .env（环境配置）和 .gitignore（版本控制元数据）。
    若 ai_service/data/ 存在实际数据，也会一并打包。

.PARAMETER OutputDir
    输出目录，默认为项目根目录下的 backup 文件夹。

.EXAMPLE
    .\tools\data-export.ps1                  # 导出到 backup/
    .\tools\data-export.ps1 -OutputDir D:\   # 导出到指定目录
#>

[CmdletBinding()]
param(
    [string]$OutputDir
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$RootDir = Split-Path -Parent $PSScriptRoot
$DataDir = Join-Path $RootDir 'data'

if (-not $OutputDir) {
    $OutputDir = Join-Path $RootDir 'backup'
}

function Write-Step($msg)   { Write-Host "  >> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)     { Write-Host "     $msg" -ForegroundColor Green }
function Write-Warn($msg)   { Write-Host "     $msg" -ForegroundColor Yellow }
function Write-Err($msg)    { Write-Host "     [错误] $msg" -ForegroundColor Red }

# --- 横幅 ---

Write-Host ''
Write-Host '  MUD 数据导出' -ForegroundColor White
Write-Host '  ============' -ForegroundColor DarkGray
Write-Host ''

# --- 检测 ---

Write-Step '检测数据目录...'

if (-not (Test-Path $DataDir)) {
    Write-Err "数据目录不存在: $DataDir"
    exit 1
}
Write-Ok "data/"

# 收集需要打包的路径（排除 .env / .env.example / .gitignore）
$excludeNames = @('.env', '.env.example', '.gitignore')
$items = Get-ChildItem -Path $DataDir | Where-Object { $excludeNames -notcontains $_.Name }

if ($items.Count -eq 0) {
    Write-Warn 'data/ 下没有需要导出的运行时数据'
    exit 0
}

# 统计文件数和大小
$fileCount = 0
$totalSize = 0
foreach ($item in $items) {
    if ($item.PSIsContainer) {
        $sub = Get-ChildItem -Path $item.FullName -Recurse -File -ErrorAction SilentlyContinue |
               Where-Object { $excludeNames -notcontains $_.Name }
        $fileCount += ($sub | Measure-Object).Count
        $totalSize += ($sub | Measure-Object -Property Length -Sum).Sum
    } else {
        $fileCount++
        $totalSize += $item.Length
    }
}

Write-Ok "找到 $fileCount 个文件，共 $([math]::Round($totalSize / 1KB, 1)) KB"

# 检查 ai_service 数据
$aiDataDir = Join-Path (Join-Path $RootDir 'ai_service') 'data'
$aiItems = $null
if (Test-Path $aiDataDir) {
    $aiItems = Get-ChildItem -Path $aiDataDir | Where-Object { $_.Name -ne '.gitignore' }
    if ($aiItems -and $aiItems.Count -gt 0) {
        Write-Ok '发现 ai_service/data/ 数据，将一并打包'
    } else {
        $aiItems = $null
    }
}

# --- 准备暂存目录 ---

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$zipName = "mud-data-$timestamp.zip"
$zipPath = Join-Path $OutputDir $zipName

# 确保输出目录存在
if (-not (Test-Path $OutputDir)) {
    $null = New-Item -ItemType Directory -Path $OutputDir -Force
}

$stagingDir = Join-Path $OutputDir ".export-staging-$timestamp"
$stagingData = Join-Path $stagingDir 'data'

Write-Step '准备暂存目录...'

if (Test-Path $stagingDir) {
    Remove-Item -Recurse -Force $stagingDir
}
$null = New-Item -ItemType Directory -Path $stagingData -Force

# --- 复制数据 ---

Write-Step '复制运行时数据...'

foreach ($item in $items) {
    $dest = Join-Path $stagingData $item.Name
    if ($item.PSIsContainer) {
        # 递归复制子目录，但排除 .gitignore 等
        $null = New-Item -ItemType Directory -Path $dest -Force
        $subItems = Get-ChildItem -Path $item.FullName -Recurse -File |
                    Where-Object { $excludeNames -notcontains $_.Name }
        foreach ($sub in $subItems) {
            $relPath = $sub.FullName.Substring($item.FullName.Length)
            $subDest = Join-Path $dest $relPath
            $subDestDir = Split-Path -Parent $subDest
            if (-not (Test-Path $subDestDir)) {
                $null = New-Item -ItemType Directory -Path $subDestDir -Force
            }
            Copy-Item $sub.FullName $subDest
        }
    } else {
        Copy-Item $item.FullName $dest
    }
    Write-Host "     + data/$($item.Name)" -ForegroundColor DarkGray
}

# 复制 ai_service 数据
if ($aiItems) {
    $stagingAi = Join-Path $stagingDir 'ai_service' 'data'
    $null = New-Item -ItemType Directory -Path $stagingAi -Force
    foreach ($item in $aiItems) {
        $dest = Join-Path $stagingAi $item.Name
        if ($item.PSIsContainer) {
            Copy-Item -Recurse $item.FullName $dest
        } else {
            Copy-Item $item.FullName $dest
        }
        Write-Host "     + ai_service/data/$($item.Name)" -ForegroundColor DarkGray
    }
}

# --- 打包 ---

Write-Step "打包为 $zipName..."

if (Test-Path $zipPath) {
    Remove-Item -Force $zipPath
}
Compress-Archive -Path "$stagingDir\*" -DestinationPath $zipPath -Force

# --- 清理 ---

Write-Step '清理暂存目录...'
Remove-Item -Recurse -Force $stagingDir

# --- 结果 ---

$zipSize = (Get-Item $zipPath).Length
$sizeStr = if ($zipSize -gt 1MB) {
    "$([math]::Round($zipSize / 1MB, 2)) MB"
} else {
    "$([math]::Round($zipSize / 1KB, 1)) KB"
}

Write-Host ''
Write-Ok "导出完成!"
Write-Host ''
Write-Host "  文件: $zipPath" -ForegroundColor Cyan
Write-Host "  大小: $sizeStr" -ForegroundColor Cyan
Write-Host "  包含: $fileCount 个运行时数据文件" -ForegroundColor Cyan
if ($aiItems) {
    Write-Host "  额外: ai_service 数据" -ForegroundColor Cyan
}
Write-Host ''
Write-Host '  迁移到新服务器时:' -ForegroundColor DarkGray
Write-Host '    1. 解压 ZIP 到项目根目录（会还原 data/ 结构）' -ForegroundColor Gray
Write-Host '    2. 从 data/.env.example 生成新的 data/.env' -ForegroundColor Gray
Write-Host '    3. 启动服务: .\docker-deploy.ps1' -ForegroundColor Gray
Write-Host ''
