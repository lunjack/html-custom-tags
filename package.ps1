param([string]$Action)

function Update-Version {
    $packageJsonPath = "package.json"
    $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
    
    # 解析版本号，支持 x.y.z 格式
    $versionParts = $packageJson.version -split '\.'
    $build = [int]$versionParts[2] + 1
    
    $newVersion = "$($versionParts[0]).$($versionParts[1]).$build"
    $packageJson.version = $newVersion
    
    $packageJson | ConvertTo-Json -Depth 100 | Set-Content $packageJsonPath -Encoding UTF8
    return $newVersion
}

if ($Action -eq "package") {
    # 更新版本
    $version = Update-Version
    Write-Host "更新版本到: $version"
    
    # 获取扩展名称
    $package = Get-Content "package.json" -Raw | ConvertFrom-Json
    $extensionName = $package.name
    
    # 创建临时 README
    if (-not (Test-Path README.md)) {
        @"
# $($package.displayName)
$($package.description)

## 安装
使用 VSIX 文件安装此扩展
"@ | Out-File README.md -Encoding UTF8
    }

    # 打包
    $output = npx vsce package --no-dependencies 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "打包失败! 错误信息:" -ForegroundColor Red
        $output
        exit 1
    }
    
    # 查找生成的 VSIX 文件
    $vsixFile = Get-ChildItem -Path ".\" -Filter "$extensionName-*.vsix" | 
    Sort-Object LastWriteTime -Descending | 
    Select-Object -First 1
    
    if (-not $vsixFile) {
        Write-Host "找不到生成的 VSIX 文件!" -ForegroundColor Red
        exit 1
    }

    # 创建输出目录
    $outputDir = ".\vscode\extensions"
    if (-not (Test-Path $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir | Out-Null
    }
    
    # 移动文件
    Move-Item -Path $vsixFile.FullName -Destination $outputDir -Force
    
    Write-Host "成功生成扩展: $($vsixFile.Name)" -ForegroundColor Green
    Write-Host "文件位置: $(Join-Path $outputDir $vsixFile.Name)" -ForegroundColor Cyan
}