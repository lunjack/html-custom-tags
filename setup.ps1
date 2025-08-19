# 获取最新生成的 VSIX 文件
$vsixFiles = Get-ChildItem -Path ".\vscode\extensions" -Filter "*.vsix" | 
Sort-Object LastWriteTime -Descending

if (-not $vsixFiles) {
    Write-Host "找不到 VSIX 文件，请先运行打包脚本" -ForegroundColor Red
    exit 1
}

$latestVsix = $vsixFiles[0].FullName
Write-Host "找到最新扩展文件: $latestVsix" -ForegroundColor Cyan

# 从VSIX文件名中提取完整扩展ID (格式: publisher.extensionname)
$fullExtensionId = [System.IO.Path]::GetFileNameWithoutExtension($vsixFiles[0].Name) -replace '-\d+\.\d+\.\d+$', ''
Write-Host "扩展完整ID: $fullExtensionId" -ForegroundColor DarkCyan

# 检查是否已安装（使用完整ID匹配）
$installed = code --list-extensions | Where-Object { $_ -eq $fullExtensionId }

if ($installed) {
    Write-Host "扩展已安装，执行更新操作..." -ForegroundColor Yellow
    
    # 增强卸载逻辑：添加重试机制
    $retryCount = 0
    $maxRetries = 3
    $uninstalled = $false
    
    while (-not $uninstalled -and $retryCount -lt $maxRetries) {
        code --uninstall-extension $fullExtensionId
        Start-Sleep -Milliseconds 500  # 等待卸载完成
        
        # 验证是否卸载成功
        $stillInstalled = code --list-extensions | Where-Object { $_ -eq $fullExtensionId }
        if (-not $stillInstalled) {
            $uninstalled = $true
            Write-Host "卸载成功" -ForegroundColor Green
        }
        else {
            $retryCount++
            Write-Host "卸载失败，正在重试 ($retryCount/$maxRetries)..." -ForegroundColor Yellow
        }
    }
    
    if (-not $uninstalled) {
        Write-Host "无法卸载旧扩展，请手动执行: code --uninstall-extension $fullExtensionId" -ForegroundColor Red
        exit 1
    }
}

# 安装扩展
Write-Host "正在安装扩展..." -ForegroundColor Cyan
code --install-extension $latestVsix

# 配置工作区设置
$settingsPath = ".vscode\settings.json"
$settings = @{
    "files.associations" = @{
        "*.html" = "html"
    }
}

# 创建目录
if (-not (Test-Path ".vscode")) { 
    New-Item -Name ".vscode" -ItemType Directory | Out-Null 
}

# 合并现有设置（如果存在）
if (Test-Path $settingsPath) {
    $existingSettings = Get-Content $settingsPath -Raw | ConvertFrom-Json -AsHashtable
    
    # 保留所有现有设置
    foreach ($key in $existingSettings.Keys) {
        $settings[$key] = $existingSettings[$key]
    }
    
    # 确保文件关联设置正确
    if (-not $settings["files.associations"]) {
        $settings["files.associations"] = @{}
    }
    
    $settings["files.associations"]["*.html"] = "html"
}

# 保存设置
$settings | ConvertTo-Json -Depth 10 | Set-Content $settingsPath -Encoding UTF8

Write-Host "安装完成! 已配置 HTML 文件关联" -ForegroundColor Green