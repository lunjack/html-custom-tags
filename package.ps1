param([switch]$p)  # 发布开关

# 1. 检查并修复 JSON
try {
    $pkg = Get-Content package.json -Raw | ConvertFrom-Json
} catch {
    # 移除 BOM
    $bytes = [System.IO.File]::ReadAllBytes("package.json")
    if ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        $content = [System.Text.Encoding]::UTF8.GetString($bytes, 3, $bytes.Length - 3)
        [System.IO.File]::WriteAllText("package.json", $content, [System.Text.Encoding]::UTF8)
        Write-Host "✓ 已移除 BOM" -ForegroundColor Green
    }
    $pkg = Get-Content package.json -Raw | ConvertFrom-Json
}

# 2. 更新版本号
if ($pkg.version -match '(\d+)\.(\d+)\.(\d+)') {
    $newVer = "$($Matches[1]).$($Matches[2]).$([int]$Matches[3]+1)"
    $content = (Get-Content package.json -Raw) -replace $Matches[0], $newVer
    [System.IO.File]::WriteAllText("package.json", $content, [System.Text.UTF8Encoding]::new($false))
    Write-Host "✓ 版本更新: $newVer" -ForegroundColor Green
} else { throw "无法解析版本号" }

# 3. 创建必要文件
if (-not (Test-Path README.md)) {
    "# $($pkg.displayName)`n$($pkg.description)`n`n## 安装`n使用 VSIX 文件安装此扩展" |
    Out-File README.md -Encoding UTF8
    Write-Host "✓ 已创建 README" -ForegroundColor Gray
}

# 4. 打包扩展
Write-Host "📦 正在打包..." -ForegroundColor Yellow

# 尝试 vsce 或 npx vsce
$vsceOutput = vsce package --no-dependencies 2>&1
if ($LASTEXITCODE -ne 0) { $vsceOutput = npx vsce package --no-dependencies 2>&1 }
if ($LASTEXITCODE -ne 0) { throw "打包失败:`n$vsceOutput" }

# 5. 移动文件
$vsix = Get-ChildItem "$($pkg.name)-*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($vsix) {
    $outputDir = ".\extensions"
    New-Item -Type Directory $outputDir -Force | Out-Null
    Move-Item $vsix.FullName $outputDir -Force
    Write-Host "✅ 成功生成: $($vsix.Name)" -ForegroundColor Green
    Write-Host "📁 位置: $(Join-Path $outputDir $vsix.Name)" -ForegroundColor Cyan
} else { throw "未找到 VSIX 文件" }