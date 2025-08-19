// ======================
// 核心依赖导入
// ======================
const vscode = require('vscode');
const { Disposable } = require('vscode');

// ======================
// 本地模块导入
// ======================
const {
    CONFIG_KEYS,
    TEXT_SNIPPET_RANGE,
    TAG_TYPES,
    TAG_ICONS,
    TAG_DISPLAY_NAMES,
    RECOMMENDED_THEME
} = require('./modules/constants');

const { generateTagDetailsHTML } = require('./modules/tagDetailsTemplate');
const { sanitizeTagName, isInsideTagPosition } = require('./modules/tagUtils');

// ======================
// 编辑器辅助函数
// ======================
function getActiveHtmlEditor() {
    const editor = vscode.window.activeTextEditor;
    return editor && editor.document.languageId === 'html' ? editor : null;
}

function isHtmlDocument(document) {
    return document && document.languageId === 'html';
}

// ======================
// 面板管理器
// ======================
class PanelManager {
    constructor() {
        this.panels = new Map();
    }

    has(key) { return this.panels.has(key); }
    get(key) { return this.panels.get(key); }

    add(key, panel) {
        this.panels.set(key, panel);
        panel.onDidDispose(() => this.delete(key));
    }

    delete(key) { this.panels.delete(key); }

    disposeAll() {
        this.panels.forEach(panel => panel.dispose());
        this.panels.clear();
    }
}

// ======================
// 配置管理器
// ======================
class ConfigManager {
    static config = vscode.workspace.getConfiguration('editor');

    static updateEditorConfig(settings, configurationTarget) {
        Object.entries(settings).forEach(([key, value]) => {
            this.config.update(key, value, configurationTarget);
        });
    }

    static saveOriginalSettings() {
        return Object.fromEntries(
            Object.values(CONFIG_KEYS).map(key => [key, this.config.get(key)])
        );
    }

    static disableSuggestions() {
        try {
            this.updateEditorConfig({
                [CONFIG_KEYS.QUICK_SUGGESTIONS]: false,
                [CONFIG_KEYS.SUGGEST_ON_TRIGGER]: false,
                [CONFIG_KEYS.WORD_BASED]: false
            }, vscode.ConfigurationTarget.Workspace);
        } catch (error) {
            console.error('禁用提示功能失败:', error.message);
        }
    }

    static restoreSuggestions(originalSettings) {
        try {
            Object.entries(originalSettings).forEach(([key, value]) => {
                this.config.update(key, value, vscode.ConfigurationTarget.Workspace);
            });
        } catch (error) {
            console.error('恢复提示功能失败:', error.message);
        }
    }
}

// ======================
// 标签数据模型
// ======================
class CustomTagItem extends vscode.TreeItem {
    constructor(label, realTagName, tagType) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = TAG_DISPLAY_NAMES[tagType] || '未知标签';
        this.tooltip = `${this.label} - ${this.description}`;
        this.realTagName = realTagName;
        this.tagType = tagType;
        this.iconPath = new vscode.ThemeIcon(TAG_ICONS[tagType]);

        this.command = {
            command: 'html-custom-tags.jumpToTag',
            title: '跳转到标签',
            arguments: [this.realTagName, tagType]
        };
    }
}

// ======================
// 标签查找器（带缓存）
// ======================
class TagFinder {
    static tagCache = new Map();

    static clearCache(document) {
        if (document) {
            const uri = document.uri.toString();
            this.tagCache.delete(uri);
        }
    }

    static findAllCustomTags(document) {
        if (!isHtmlDocument(document)) return [];

        const uri = document.uri.toString();
        if (this.tagCache.has(uri)) return this.tagCache.get(uri);

        const tags = [];
        const text = document.getText();
        const regex = /\[([!~])([^\]\r\n]+)\]/g;

        let match;
        while ((match = regex.exec(text)) !== null) {
            const type = match[1] === '!' ? TAG_TYPES.OPENING : TAG_TYPES.CLOSING;
            const safeName = sanitizeTagName(match[2]);

            tags.push({
                name: safeName,
                type: type,
                fullText: match[0],
                range: new vscode.Range(
                    document.positionAt(match.index),
                    document.positionAt(match.index + match[0].length))
            });
        }

        this.tagCache.set(uri, tags);
        return tags;
    }

    static checkIfInsideCustomTag(document, position) {
        try {
            const lineText = document.lineAt(position.line).text;
            const textAround = lineText.substring(
                Math.max(0, position.character - TEXT_SNIPPET_RANGE),
                Math.min(lineText.length, position.character + TEXT_SNIPPET_RANGE)
            );

            return isInsideTagPosition(textAround, position.character, '[!') ||
                isInsideTagPosition(textAround, position.character, '[~');
        } catch (error) {
            console.error('检查模板标签位置失败:', error.message);
            return false;
        }
    }
}

// ======================
// 标签数据提供器
// ======================
class CustomTagProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.tags = [];
    }

    refresh() {
        const editor = getActiveHtmlEditor();
        this.refreshWithDocument(editor ? editor.document : null);
    }

    refreshWithDocument(document) {
        if (!isHtmlDocument(document)) {
            this.tags = [];
            this._onDidChangeTreeData.fire();
            return;
        }

        const allTags = TagFinder.findAllCustomTags(document);
        const uniqueTags = new Map();

        allTags.forEach(tag => {
            const key = `${tag.name}-${tag.type}`;
            if (!uniqueTags.has(key)) {
                const prefix = tag.type === TAG_TYPES.OPENING ? '[!' : '[~';
                uniqueTags.set(key, new CustomTagItem(
                    `${prefix}${tag.name}]`,
                    tag.name,
                    tag.type
                ));
            }
        });

        this.tags = Array.from(uniqueTags.values());
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element) { return element; }
    getChildren(element) { return element ? [] : this.tags; }
}

// ======================
// 状态管理器（带防抖）
// ======================
class StateManager {
    constructor(originalSettings) {
        this.isInsideCustomTag = false;
        this.timeout = null;
        this.originalSettings = originalSettings;
        this.updateQueue = [];
        this.debounceTimeout = null;
    }

    queueUpdate() {
        this.updateQueue.push(true);
        if (!this.debounceTimeout) {
            this.debounceTimeout = setTimeout(() => {
                this.processUpdates();
                this.debounceTimeout = null;
            }, 150); // 150ms防抖
        }
    }

    processUpdates() {
        const editor = getActiveHtmlEditor();
        if (editor) {
            this.checkState(editor);
        }
        this.updateQueue = [];
    }

    checkState(editor) {
        const insideTag = TagFinder.checkIfInsideCustomTag(
            editor.document,
            editor.selection.active
        );

        if (insideTag !== this.isInsideCustomTag) {
            this.isInsideCustomTag = insideTag;
            insideTag ?
                ConfigManager.disableSuggestions() :
                ConfigManager.restoreSuggestions(this.originalSettings);
        }
    }

    dispose() {
        clearTimeout(this.timeout);
        clearTimeout(this.debounceTimeout);
    }
}

// ======================
// 标签统计工具
// ======================
class TagStatistics {
    static calculate(tagName, tags) {
        const filteredTags = tags.filter(tag => tag.name === tagName);

        return {
            total: filteredTags.length,
            opening: filteredTags.filter(tag => tag.type === TAG_TYPES.OPENING).length,
            closing: filteredTags.filter(tag => tag.type === TAG_TYPES.CLOSING).length,
            locations: filteredTags.map(tag => ({
                fullText: tag.fullText,
                type: tag.type,
                range: tag.range
            })),
            unbalanced: filteredTags.filter(tag => tag.type === TAG_TYPES.OPENING).length !==
                filteredTags.filter(tag => tag.type === TAG_TYPES.CLOSING).length
        };
    }

    static generateDetailsHTML(tagName, statistics) {
        return generateTagDetailsHTML(tagName, statistics);
    }
}

// ======================
// 命令处理器
// ======================
class CommandHandler {
    static autoCloseCustomTag(event) {
        const editor = getActiveHtmlEditor();
        if (!editor || event.document !== editor.document) return;

        for (const change of event.contentChanges) {
            if (change.text !== ' ' || change.rangeLength > 0) continue;

            const position = change.range.start;
            const lineText = event.document.lineAt(position.line).text;
            const textBefore = lineText.substring(0, position.character);

            const match = textBefore.match(/\[!([^\]\r\n]+)\]\s*$/);
            if (!match) continue;

            const tagName = match[1].trim();
            if (!tagName || lineText.includes(`[~${tagName}]`)) continue;

            editor.edit(editBuilder => {
                editBuilder.insert(position.translate(0, 1), `[~${tagName}]`);
            }).then(() => {
                const newPosition = position.translate(0, 1);
                editor.selection = new vscode.Selection(newPosition, newPosition);
            });
        }
    }

    static async copyAllTags() {
        const editor = getActiveHtmlEditor();
        if (!editor) {
            vscode.window.showWarningMessage('请在HTML文件中使用此功能');
            return;
        }

        try {
            const tags = TagFinder.findAllCustomTags(editor.document);
            if (tags.length === 0) {
                vscode.window.showInformationMessage('未找到模板标签');
                return;
            }

            const uniqueTagSet = new Set(tags.map(tag => tag.fullText));
            const tagsText = [...uniqueTagSet].join('\n\n');

            await vscode.env.clipboard.writeText(tagsText);
            vscode.window.showInformationMessage(`已复制 ${uniqueTagSet.size} 个标签到剪贴板`);
        } catch (error) {
            vscode.window.showErrorMessage('复制标签失败: ' + error.message);
        }
    }

    static jumpToTag(tagName, tagType) {
        const editor = getActiveHtmlEditor();
        if (!editor) return;

        const document = editor.document;
        const tags = TagFinder.findAllCustomTags(document);

        const matchedTags = tags.filter(tag =>
            tag.name === tagName && tag.type === tagType
        );

        if (matchedTags.length > 0) {
            editor.selection = new vscode.Selection(
                matchedTags[0].range.start,
                matchedTags[0].range.end
            );
            editor.revealRange(matchedTags[0].range);
        } else {
            vscode.window.showWarningMessage(
                `未找到 "${tagName}" ${TAG_DISPLAY_NAMES[tagType]}`
            );
        }
    }

    static showTagDetails(node) {
        if (!node) {
            vscode.window.showErrorMessage('无法获取标签信息');
            return;
        }

        const tagName = node.realTagName;
        // 使用安全键名
        const panelKey = `tag-detail-${tagName.replace(/[^\w]/g, '-')}`;

        if (tagDetailPanels.has(panelKey)) {
            tagDetailPanels.get(panelKey).reveal();
            return;
        }

        const editor = getActiveHtmlEditor();
        if (!editor) {
            vscode.window.showErrorMessage('没有活动的编辑器');
            return;
        }

        const document = editor.document;
        const tags = TagFinder.findAllCustomTags(document);

        const panel = vscode.window.createWebviewPanel(
            'tagDetail',
            `标签统计: ${tagName}`,
            vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        const statistics = TagStatistics.calculate(tagName, tags);
        panel.webview.html = TagStatistics.generateDetailsHTML(tagName, statistics);

        panel.webview.onDidReceiveMessage(message => {
            if (message.command === 'navigate') {
                const startPos = new vscode.Position(message.startLine, message.startChar);
                const endPos = new vscode.Position(message.endLine, message.endChar);
                const selection = new vscode.Selection(startPos, endPos);
                editor.selection = selection;
                editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
            }
        });

        tagDetailPanels.add(panelKey, panel);
    }
}

// ======================
// 主题提示器
// ======================
class ThemeManager {
    static async checkTheme(context) {
        const config = vscode.workspace.getConfiguration();
        const currentTheme = config.get('workbench.colorTheme');
        if (currentTheme === RECOMMENDED_THEME) return;

        const disablePrompt = context.globalState.get('disableThemePrompt', false);
        if (disablePrompt) return;

        const choice = await vscode.window.showWarningMessage(
            'HTML Custom Tags扩展：推荐使用专用主题',
            {
                modal: true,
                detail: `当前主题 "${currentTheme}" 无法使用模板标签的高亮效果。推荐应用 "${RECOMMENDED_THEME}" 主题。`
            },
            '应用推荐主题',
            '不再提示'
        );

        if (choice === '应用推荐主题') {
            await config.update(
                'workbench.colorTheme',
                RECOMMENDED_THEME,
                vscode.ConfigurationTarget.Workspace
            );
            vscode.window.showInformationMessage("应用主题成功");
        } else if (choice === '不再提示') {
            await context.globalState.update('disableThemePrompt', true);
        }
    }
}

// ======================
// 全局状态
// ======================
const tagDetailPanels = new PanelManager();
let stateManager;
let originalSettings;

// ======================
// 插件激活/反激活
// ======================
function activate(context) {
    console.log('HTML Custom Tags Highlighter activated');

    // 初始化全局状态
    originalSettings = ConfigManager.saveOriginalSettings();
    stateManager = new StateManager(originalSettings);

    // 创建标签提供器和视图
    const tagProvider = new CustomTagProvider();
    const treeView = vscode.window.createTreeView('html-custom-tags-view', {
        treeDataProvider: tagProvider,
        title: '模板标签',
        showCollapseAll: true
    });

    // 注册命令
    const commands = [
        vscode.commands.registerCommand('html-custom-tags.jumpToTag', CommandHandler.jumpToTag),
        vscode.commands.registerCommand('html-custom-tags.showTagDetails', CommandHandler.showTagDetails),
        vscode.commands.registerCommand('html-custom-tags.copyAllTags', CommandHandler.copyAllTags)
    ];

    // 注册事件监听器
    const interceptor = vscode.languages.registerCompletionItemProvider('html', {
        provideCompletionItems: (document, position) =>
            TagFinder.checkIfInsideCustomTag(document, position)
                ? new vscode.CompletionList([], true)
                : undefined
    });

    // 统一状态更新处理函数
    const handleStateUpdate = () => {
        stateManager.queueUpdate();
        tagProvider.refresh();
    };

    // 事件监听列表
    const eventListeners = [
        interceptor,
        treeView,
        vscode.window.onDidChangeTextEditorSelection(handleStateUpdate),
        vscode.workspace.onDidChangeTextDocument(e => {
            TagFinder.clearCache(e.document); // 清除缓存
            CommandHandler.autoCloseCustomTag(e);
            handleStateUpdate();
        }),
        vscode.window.onDidChangeActiveTextEditor(() => {
            handleStateUpdate();
            vscode.commands.executeCommand('setContext',
                'showCustomTagsView',
                !!getActiveHtmlEditor()
            );
        }),
        vscode.workspace.onDidCloseTextDocument(doc => {
            TagFinder.clearCache(doc); // 文档关闭时清除缓存
        }),
        new Disposable(() => stateManager.dispose())
    ];

    // 初始状态检查
    handleStateUpdate();

    // 设置视图可见性上下文
    vscode.commands.executeCommand('setContext', 'showCustomTagsView', true);

    // 主题检查
    const showThemePrompt = async () => {
        if (vscode.window.state.focused) {
            ThemeManager.checkTheme(context);
        }
    };

    // 当插件激活时，如果VS Code已经获得焦点，延迟检查主题
    setTimeout(showThemePrompt, 3000);

    // 注册所有订阅
    context.subscriptions.push(...commands, ...eventListeners);
}

function deactivate() {
    console.log('HTML Custom Tags Highlighter deactivated');
    ConfigManager.restoreSuggestions(originalSettings);
    tagDetailPanels.disposeAll();
    stateManager?.dispose();
}

module.exports = {
    activate,
    deactivate
};