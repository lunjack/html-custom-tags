param([string]$Action = "package")

# 主打包函数
function Invoke-Package {
    # 检查并修复 BOM
    if (-not (Test-JsonFormat)) {
        Remove-BOM
    }

    # 更新版本号
    $newVersion = Update-Version
    Write-Host "✓ 版本更新: $newVersion" -ForegroundColor Green

    # 验证 JSON 格式
    if (-not (Test-JsonFormat)) {
        Write-Host "✗ JSON 格式错误" -ForegroundColor Red
        exit 1
    }

    # 打包扩展
    Package-Extension
}

# 检查 JSON 格式
function Test-JsonFormat {
    try {
        $null = Get-Content "package.json" -Raw | ConvertFrom-Json
        return $true
    } catch {
        return $false
    }
}

# 移除 BOM
function Remove-BOM {
    $bytes = [System.IO.File]::ReadAllBytes("package.json")

    if ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        $content = [System.Text.Encoding]::UTF8.GetString($bytes, 3, $bytes.Length - 3)
        [System.IO.File]::WriteAllText("package.json", $content, [System.Text.Encoding]::UTF8)
        Write-Host "✓ 已移除 BOM" -ForegroundColor Green
    }
}

# 更新版本号
function Update-Version {
    $content = Get-Content "package.json" -Raw

    if ($content -match '"version":\s*"(\d+)\.(\d+)\.(\d+)"') {
        $build = [int]$Matches[3] + 1
        $newVersion = "$($Matches[1]).$($Matches[2]).$build"
        $newContent = $content -replace $Matches[0], "`"version`": `"$newVersion`""

        [System.IO.File]::WriteAllText("package.json", $newContent, [System.Text.UTF8Encoding]::new($false))
        return $newVersion
    }

    throw "无法解析版本号"
}

# 打包扩展
function Package-Extension {
    # 创建必要文件
    Ensure-Readme

    # 获取扩展信息
    $package = Get-Content "package.json" -Raw | ConvertFrom-Json

    # 执行打包
    Write-Host "📦 正在打包..." -ForegroundColor Yellow

    $vsceOutput = vsce package --no-dependencies 2>&1
    if ($LASTEXITCODE -ne 0) {
        $vsceOutput = npx vsce package --no-dependencies 2>&1
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ 打包失败:`n$vsceOutput" -ForegroundColor Red
        exit 1
    }

    # 移动生成的文件
    Move-VsixFile $package.name
}

# 创建 README（如果不存在）
function Ensure-Readme {
    if (Test-Path README.md) { return }

    $package = Get-Content "package.json" -Raw | ConvertFrom-Json
    @"
# $($package.displayName)
$($package.description)

## 安装
使用 VSIX 文件安装此扩展
"@ | Out-File README.md -Encoding UTF8

    Write-Host "✓ 已创建 README" -ForegroundColor Gray
}

# 移动 VSIX 文件
function Move-VsixFile($extensionName) {
    $vsixFile = Get-ChildItem "$extensionName-*.vsix" | Sort LastWriteTime -Desc | Select -First 1

    if (-not $vsixFile) {
        Write-Host "✗ 未找到 VSIX 文件" -ForegroundColor Red
        exit 1
    }

    $outputDir = ".\extensions"
    New-Item -Type Directory $outputDir -Force | Out-Null

    Move-Item $vsixFile.FullName $outputDir -Force
    Write-Host "✅ 成功生成: $($vsixFile.Name)" -ForegroundColor Green
    Write-Host "📁 位置: $(Join-Path $outputDir $vsixFile.Name)" -ForegroundColor Cyan
}

# 执行主函数
if ($Action -eq "package") {
    Invoke-Package
} else {
    Write-Host "使用方法: .\package.ps1 -Action package" -ForegroundColor Yellow
}