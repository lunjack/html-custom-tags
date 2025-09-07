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
    static originalSettings = null;

    static updateEditorConfig(settings, configurationTarget) {
        Object.entries(settings).forEach(([key, value]) => {
            this.config.update(key, value, configurationTarget);
        });
    }

    static saveOriginalSettings() {
        if (!this.originalSettings) {
            this.originalSettings = Object.fromEntries(
                Object.values(CONFIG_KEYS).map(key => [key, this.config.get(key)])
            );
        }
        return this.originalSettings;
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

    static restoreSuggestions() {
        if (!this.originalSettings) return;

        try {
            Object.entries(this.originalSettings).forEach(([key, value]) => {
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

    // 增量更新缓存
    static updateCache(document, changes) {
        const uri = document.uri.toString();
        if (!this.tagCache.has(uri)) return;

        const tags = this.tagCache.get(uri);
        let updated = false;

        // 根据文档变化更新标签位置
        changes.forEach(change => {
            const offset = change.rangeOffset;
            const lengthChange = change.text.length - change.rangeLength;

            for (let i = 0; i < tags.length; i++) {
                const tag = tags[i];
                const tagStart = document.offsetAt(tag.range.start);

                // 如果修改发生在标签前面
                if (offset < tagStart) {
                    // 更新标签位置
                    const newStart = document.positionAt(tagStart + lengthChange);
                    tag.range = new vscode.Range(
                        newStart,
                        document.positionAt(document.offsetAt(tag.range.end) + lengthChange)
                    );
                    updated = true;
                }
                // 如果修改影响标签本身
                else if (offset >= tagStart && offset <= document.offsetAt(tag.range.end)) {
                    // 重新解析
                    tags.splice(i, 1);
                    i--;
                    updated = true;
                }
            }
        });

        if (updated) {
            this.tagCache.set(uri, tags);
        }
    }

    static findAllCustomTags(document) {
        if (!document || document.languageId !== 'html') return [];

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
// 装饰器管理器（用于标签高亮）
// ======================
class DecorationManager {
    constructor() {
        this.currentDecorations = [];
        this.correspondingDecorations = [];

        // 开标签装饰器
        this.openingDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(67, 160, 71, 0.4)', // 绿色背景
            borderRadius: '3px',
            border: '1px solid #43A047',  // 绿色边框
            fontWeight: 'bold'
        });

        // 闭标签装饰器
        this.closingDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(239, 83, 80, 0.4)', // 红色背景
            borderRadius: '3px',
            border: '1px solid #EF5350',  // 红色边框
            fontWeight: 'bold'
        });

        // 对应开标签装饰器
        this.correspondingOpeningDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(67, 160, 71, 0.1)', // 淡绿色背景
            borderRadius: '3px',
            border: '1px dashed #43A047',  // 绿色虚线边框
            fontWeight: 'bold'
        });

        // 对应闭标签装饰器
        this.correspondingClosingDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(239, 83, 80, 0.1)', // 淡红色背景
            borderRadius: '3px',
            border: '1px dashed #EF5350',  // 红色虚线边框
            fontWeight: 'bold'
        });
    }

    // 清除所有高亮装饰
    clearAllDecorations(editor) {
        if (editor) {
            editor.setDecorations(this.openingDecorationType, []);
            editor.setDecorations(this.closingDecorationType, []);
            editor.setDecorations(this.correspondingOpeningDecorationType, []);
            editor.setDecorations(this.correspondingClosingDecorationType, []);
        }
        this.currentDecorations = [];
        this.correspondingDecorations = [];
    }

    // 高亮标签和对应标签
    highlightTagAndCounterpart(editor, tag, allTags) {
        this.clearAllDecorations(editor);

        // 验证标签范围是否有效
        if (!this.isValidRange(editor.document, tag.range)) {
            return;
        }

        // 根据标签类型选择装饰器
        const currentDecorationType = tag.type === TAG_TYPES.OPENING ?
            this.openingDecorationType : this.closingDecorationType;

        // 高亮当前标签
        this.currentDecorations.push({
            range: tag.range
        });
        editor.setDecorations(currentDecorationType, this.currentDecorations);

        // 查找并高亮对应标签
        const counterpartType = tag.type === TAG_TYPES.OPENING ? TAG_TYPES.CLOSING : TAG_TYPES.OPENING;
        const counterpartTags = allTags.filter(t =>
            t.name === tag.name &&
            t.type === counterpartType
        );

        if (counterpartTags.length > 0) {
            // 根据对应标签的类型选择正确的装饰器
            const counterpartDecorationType = counterpartType === TAG_TYPES.OPENING ?
                this.correspondingOpeningDecorationType : this.correspondingClosingDecorationType;

            this.correspondingDecorations = counterpartTags.map(t => ({
                range: t.range
            }));
            editor.setDecorations(counterpartDecorationType, this.correspondingDecorations);
        }
    }

    // 检查范围是否在文档有效范围内
    isValidRange(document, range) {
        const docEnd = document.lineAt(document.lineCount - 1).range.end;
        return range.start.isBeforeOrEqual(docEnd) &&
            range.end.isBeforeOrEqual(docEnd);
    }

    dispose() {
        this.openingDecorationType.dispose();
        this.closingDecorationType.dispose();
        this.correspondingOpeningDecorationType.dispose();
        this.correspondingClosingDecorationType.dispose();
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
    constructor() {
        this.isInsideCustomTag = false;
        this.debounceTimeout = null;
    }

    queueUpdate() {
        if (this.debounceTimeout) clearTimeout(this.debounceTimeout);

        this.debounceTimeout = setTimeout(() => {
            this.processUpdates();
        }, 150);
    }

    processUpdates() {
        const editor = getActiveHtmlEditor();
        if (editor) {
            this.checkState(editor);
        }
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
                ConfigManager.restoreSuggestions();
        }
    }

    dispose() {
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
}

// ======================
// 标签高亮管理器（重构）
// ======================
class TagHighlighter {
    static decorationManager = new DecorationManager();
    static activeEditor = null;
    static activeTag = null;
    static allTags = [];

    // 统一高亮入口
    static updateHighlightFromPosition(editor, position) {
        if (!editor || editor.document.languageId !== 'html') return;

        const document = editor.document;
        const tags = TagFinder.findAllCustomTags(document);

        // 查找当前位置所在的标签
        const currentTag = tags.find(tag =>
            tag.range.contains(position)
        );

        if (currentTag) {
            this.setActiveTag(editor, currentTag, tags);
        } else {
            // 不在标签内时清除高亮
            this.clearActiveTag();
        }
    }

    static setActiveTag(editor, tag, tags = null) {
        this.activeEditor = editor;
        this.activeTag = tag;
        this.allTags = tags || TagFinder.findAllCustomTags(editor.document);
        this.updateHighlights();
    }

    static clearActiveTag() {
        this.decorationManager.clearAllDecorations(this.activeEditor);
        this.activeEditor = null;
        this.activeTag = null;
        this.allTags = [];
    }

    static updateHighlights() {
        if (!this.activeEditor || !this.activeTag) return;

        this.decorationManager.highlightTagAndCounterpart(
            this.activeEditor,
            this.activeTag,
            this.allTags
        );
    }

    // 文档变化处理
    static handleDocumentChange(event) {
        if (this.activeEditor && event.document === this.activeEditor.document) {
            // 重新验证当前活动标签
            if (this.activeTag) {
                const tags = TagFinder.findAllCustomTags(event.document);
                const tagStillExists = tags.some(tag =>
                    tag.range.isEqual(this.activeTag.range)
                );

                if (!tagStillExists) {
                    this.clearActiveTag();
                } else {
                    this.allTags = tags;
                    this.updateHighlights();
                }
            }
        }
    }

    // 当插件停用时释放资源
    static dispose() {
        this.clearActiveTag();
        this.decorationManager.dispose();
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
            const firstMatch = matchedTags[0];
            editor.selection = new vscode.Selection(
                firstMatch.range.start,
                firstMatch.range.end
            );
            editor.revealRange(firstMatch.range);

            // 高亮当前标签和对应标签
            TagHighlighter.setActiveTag(editor, firstMatch, tags);
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
        panel.webview.html = generateTagDetailsHTML(tagName, statistics);

        panel.webview.onDidReceiveMessage(message => {
            if (message.command === 'navigate') {
                const startPos = new vscode.Position(message.startLine, message.startChar);
                const endPos = new vscode.Position(message.endLine, message.endChar);
                const selection = new vscode.Selection(startPos, endPos);
                editor.selection = selection;
                editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);

                // 点击后高亮标签和对应标签
                const clickedTag = tags.find(tag =>
                    tag.range.start.line === message.startLine &&
                    tag.range.start.character === message.startChar
                );

                if (clickedTag) {
                    TagHighlighter.setActiveTag(editor, clickedTag, tags);
                }
            }
        });

        tagDetailPanels.add(panelKey, panel);
    }

    // 清除所有高亮的命令
    static clearHighlights() {
        TagHighlighter.clearActiveTag();
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

// ======================
// 插件激活/反激活
// ======================
function activate(context) {
    console.log('HTML Custom Tags Highlighter activated');

    // 初始化全局状态
    ConfigManager.saveOriginalSettings();
    stateManager = new StateManager();

    // 创建标签提供器和视图
    const tagProvider = new CustomTagProvider();
    const treeView = vscode.window.createTreeView('html-custom-tags-view', {
        treeDataProvider: tagProvider,
        title: '模板标签',
        showCollapseAll: true
    });

    // 状态更新处理函数
    const handleStateUpdate = () => {
        stateManager.queueUpdate();
        tagProvider.refresh();
    };

    // 注册命令
    const commands = [
        vscode.commands.registerCommand('html-custom-tags.jumpToTag', CommandHandler.jumpToTag),
        vscode.commands.registerCommand('html-custom-tags.showTagDetails', CommandHandler.showTagDetails),
        vscode.commands.registerCommand('html-custom-tags.copyAllTags', CommandHandler.copyAllTags),
        vscode.commands.registerCommand('html-custom-tags.clearHighlights', CommandHandler.clearHighlights)
    ];

    // 注册事件监听器
    const interceptor = vscode.languages.registerCompletionItemProvider('html', {
        provideCompletionItems: (document, position) =>
            TagFinder.checkIfInsideCustomTag(document, position)
                ? new vscode.CompletionList([], true)
                : undefined
    });

    // 事件监听列表
    const eventListeners = [
        interceptor,
        treeView,
        vscode.window.onDidChangeTextEditorSelection(e => {
            handleStateUpdate();
            // 高亮更新入口
            TagHighlighter.updateHighlightFromPosition(
                e.textEditor,
                e.selections[0].active
            );
        }),
        vscode.workspace.onDidChangeTextDocument(e => {
            // 增量缓存更新
            TagFinder.updateCache(e.document, e.contentChanges);
            CommandHandler.autoCloseCustomTag(e);
            handleStateUpdate();

            // 文档变化处理
            TagHighlighter.handleDocumentChange(e);
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
        new Disposable(() => stateManager.dispose()),

        // 窗口焦点变化时更新高亮
        vscode.window.onDidChangeWindowState(state => {
            if (state.focused) {
                const editor = getActiveHtmlEditor();
                if (editor) {
                    TagHighlighter.updateHighlightFromPosition(
                        editor,
                        editor.selection.active
                    );
                }
            }
        })
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
    ConfigManager.restoreSuggestions();
    tagDetailPanels.disposeAll();
    stateManager?.dispose();
    TagHighlighter.dispose(); // 释放高亮资源
}

module.exports = {
    activate,
    deactivate
};