### 1.创建扩展项目:
> 选择：
```PowerShell
    yo code
    ? What type of extension do you want to create? New Language Support
    ? URL or file to import, or none for new: [回车]
    ? What's the name of your extension? HTML Custom Tags Highlighter
    ? What's the identifier of your extension? html-custom-tags
    ? What's the description of your extension? Syntax highlighting for custom [!tag][~tag] in HTML files
    ? Language id: html
    ? Language name: HTML with Custom Tags
    ? File extensions: .html
    ? Scope names: text.html.custom
    ? Initialize a git repository? (Y/n) [按需选择]
    ? Do you want to open the new folder with Visual Studio Code? Open with `code` [回车]
```
---
### 2.修改扩展: package.json

---
### 3.修改语法文件: syntaxes/html-custom.tmLanguage.json

---
### 4.添加强制关联设置:
> 在扩展项目根目录创建 .vscode/settings.json:
```JSON
{
    "files.associations": {
        "*.html": "html-custom"
    }
}
```
---
### 5.创建入口文件: extension.js

---
### 6.更新: language-configuration.json

---
### 7.更新: launch.json(强制禁用冲突扩展)

---
### 8.删除所有临时文件:​
- 删除项目中的 node_modules文件夹
- 删除 package-lock.json
- 在终端中运行: ` npm cache clean --force `

---
### 9.纯净模式启动:
```PowerShell
code --disable-extensions --disable-workspace-trust "项目路径"
```

---
### 10.重新安装依赖:​​
> -  在终端中运行 `npm install`

---
### 11.启动调试会话:(按F5)
>1. 打开测试文件 test.html
>2. 使用作用域检查器：
    >按 Ctrl+Shift+P 输入 `Developer: Inspect Editor Tokens and Scopes`

---
### 12.打包:
> #### 打包扩展: `   vsce package    `
> #### 脚本打包：
```PowerShell
 .\package.ps1 -Action package
```

注:打包后，生成了 VSIX 文件，复制这个文件给其他人安装，即可使用。

---
### 13.安装扩展:(PowerShell)
> - 直接安装:
```PowerShell
code --install-extension "html-custom-tags-1.0.3.vsix"
```
> - 脚本安装：
```PowerShell
    .\setup.ps1
```

---
### 14.脚本发布命令:(PowerShell)
```PowerShell
    .\publish.ps1
```

---
15.直接在项目设置中自定义颜色:
>  >在​项目根目录​，通过 .vscode/settings.json文件自定义颜色：
```JSON
{
    "editor.tokenColorCustomizations": {
        "textMateRules": [
            // 紫灰色括号
            {
                "scope": ["custom-tag.bracket.open", "custom-tag.bracket.close"],
                "settings": {"foreground": "#8d7272"}
            },
            // 紫色标志
            {
                "scope": "custom-tag.flag",
                "settings": {"foreground": "#C792EA"}
            },
            // 锈棕色标签名（粗体）
            {
                "scope": "custom-tag.name",
                "settings": {
                "foreground": "#9c5a0a",
                "fontStyle": "bold"
                }
            }
        ]
    }
}
```

---
### 16.打包工具操作:
```PowerShell
npm uninstall -g @vscode/vsce --force    # 强制清理旧安装

npm cache clean --force                  # 清理npm缓存

npm install -g @vscode/vsce --force      # 重新安装vsce（以管理员身份运行PowerShell）

```

---
### 17.使用技巧:
>     输入完 [!tag] 后,输入空格会自动触发补全闭标签 [~tag]

---
### 18.项目结构:
    html-custom-tags/
    ├── icons/
    │   ├── custom-tag.svg              # 活动栏图标 (28x28px)
    │   ├── tag-view-icon.svg           # 视图标题图标 (16x16px)
    │   └── extension-icon.png          # 扩展市场图标 (128x128px)
    ├── modules/
    │    ├── constants.js               # 常量
    │    ├── tagDetailsTemplate.js      # html标签统计模板
    │    └── tagUtils.js                # 标签工具
    ├── syntaxes/
    │   └── html-custom.tmLanguage.json
    ├── themes/
    │   └── custom-tags-color-theme.json
    ├── extension.js
    ├── package.json
    └── language-configuration.json

---
### 19.扩展发布:
>1. 创建发布者账号(如果没有)
    >> - 访问 Visual Studio Marketplace 发布者管理页面,填写相关信息
    >> - 无法创建发布者解决方法:
        >>> 1. 浏览器安装header editor插件
        >>> 2. 导入代理规则(VS.json)

>2. 添加许可证 LICENSE文件（根目录）PS指令:
    >>> 创建 MIT 许可证文件
```PowerShell
        New-Item -Path . -Name LICENSE -ItemType File
        @"
        MIT License

        Copyright (c) $(Get-Date -Format yyyy) lunjack

        Permission is hereby granted, free of charge, to any person obtaining a copy
        ...
        "@ | Out-File -Encoding utf8 LICENSE
```
>3. 生成个人访问令牌 (PAT)
>   >1. 在发布者管理页面
        https://dev.azure.com/china0826/_usersSettings/tokens
        点击 Create Token
        Organization（组织）: china0826
>   >2. 设置名称
        lunjack-VSCE-Token    有效期建议选 1年。
>   >3. 权限范围勾选 Marketplace 选择全部:
        >>>- ☑️ Marketplace（市场）> Acquire（获取权限）
        >>>- ☑️ Marketplace（市场）> Manage（管理权限）
        >>>- ☑️ Marketplace（市场）> Publish（发布权限）
>   >4. 发布指令
        ` vsce publish `
        或指定版本
        ` vsce publish 1.0.1 `
>4. 手动上传
    在发布者管理页面点击 New extension → 上传在Visual Studio Code
    生成的 .vsix 文件。

---
### 20.创建仓库步骤:(GH)
```PowerShell
git init      # 初始化本地仓库

git add .     # 添加所有文件（确保已创建.vscodeignore过滤不需要的文件）

git commit -m "提交说明"      #提交初始版本

gh repo create 仓库名 --public --push --source .      # 创建远程仓库并推送（核心命令！）
```

---
### 21.重新提交分支步骤:(GH)
>    1. 备份当前代码（复制整个项目文件夹到安全位置）

>    2. 彻底重置Git历史（保留当前代码）
```PowerShell
        Remove-Item -Recurse -Force .\.git     # 删除所有Git历史
```
>    3. 重新初始化Git仓库
```PowerShell
        git init
        git branch -m main
        git add .
        git commit -m "全新提交文件"
```

>    4. 设置正确的.gitignore（确保包含所有敏感文件）

>    5. 强制推送到全新仓库
```PowerShell
        git remote add origin https://github.com/lunjack/html-custom-tags.git
        git push -u origin main --force
```