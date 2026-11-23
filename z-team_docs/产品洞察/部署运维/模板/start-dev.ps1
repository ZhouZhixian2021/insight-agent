# 启动产品洞察的 Web 界面（Windows）。
#
# 用法：改下面两个路径，然后 .\start-dev.ps1
#   .\start-dev.ps1            默认 54512 端口
#   .\start-dev.ps1 -Port 54520 换端口
#   .\start-dev.ps1 -Build     先重新构建再启动

[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 54512,
  [switch]$Build
)

$ErrorActionPreference = 'Stop'

# 改成自己的路径
$repo = '<仓库路径>'          # 例：D:\code\insight-agent-dev
$workspace = '<工作区路径>'   # 例：D:\code\insight，决定会话分组

$bin = Join-Path $repo 'apps\cli\lib\bin.js'

if (-not (Test-Path $repo)) {
  Write-Host "找不到仓库目录：$repo" -ForegroundColor Red
  exit 1
}

# 构建产物缺失或显式要求时先构建
if ($Build -or -not (Test-Path $bin)) {
  Write-Host '构建中（约 3 分钟）...' -ForegroundColor Yellow
  Push-Location $repo
  try {
    pnpm run build:artifacts
    if ($LASTEXITCODE -ne 0) {
      Write-Host '构建失败，已中止。' -ForegroundColor Red
      exit 1
    }
  } finally {
    Pop-Location
  }
}

# 端口占用检查
$busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  $owner = ($busy | Select-Object -First 1).OwningProcess
  Write-Host "端口 $Port 已被进程 $owner 占用，换一个端口或用 -Port 指定。" -ForegroundColor Red
  exit 1
}

# TEMP 必须在工作区之外，否则沙箱的临时目录不变式会让 GUI 起不来
$env:DSH_HOME = Join-Path $repo '.dsh-runtime'
$env:TEMP = 'D:\tmp'
$env:TMP = 'D:\tmp'
New-Item -ItemType Directory -Force 'D:\tmp' | Out-Null

Set-Location $workspace

& node $bin web --port $Port
exit $LASTEXITCODE
