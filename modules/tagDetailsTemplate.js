// modules/tagDetailsTemplate.js
const vscode = require('vscode');
const { TAG_TYPES, TAG_DISPLAY_NAMES } = require('./constants');
const { sanitizeTagName } = require('./tagUtils');

module.exports.generateTagDetailsHTML = (tagName, statistics) => {
    return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>标签统计: ${sanitizeTagName(tagName)}</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                padding: 20px;
                background-color: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
                line-height: 1.6;
            }
            .header {
                border-bottom: 1px solid var(--vscode-editorWidget-border);
                padding-bottom: 10px;
                margin-bottom: 20px;
            }
            h1 {
                color: var(--vscode-editor-foreground);
                margin-bottom: 5px;
            }
            .tag-preview {
                font-size: 1.2em;
                margin: 10px 0;
                padding: 8px 12px;
                background: var(--vscode-editorHoverWidget-background);
                border-radius: 4px;
                display: inline-block;
            }
            .stats-container {
                display: flex;
                gap: 20px;
                margin-bottom: 20px;
            }
            .stat-card {
                flex: 1;
                padding: 15px;
                border-radius: 4px;
                background: var(--vscode-editorHoverWidget-background);
                text-align: center;
            }
            .stat-value {
                font-size: 2em;
                font-weight: bold;
                margin: 5px 0;
            }
            .unbalanced {
                color: #f14c4c;
            }
            .balanced {
                color: #73c991;
            }
            .locations {
                margin-top: 20px;
            }
            .location-item {
                padding: 8px 12px;
                margin: 5px 0;
                border-radius: 4px;
                background: var(--vscode-editorHoverWidget-background);
                cursor: pointer;
                transition: background 0.2s;
            }
            .location-item:hover {
                background: var(--vscode-list-hoverBackground);
            }
            .line-number {
                display: inline-block;
                width: 50px;
                color: var(--vscode-editorLineNumber-foreground);
            }
            .tag-type {
                display: inline-block;
                width: 60px;
                text-align: center;
                border-radius: 3px;
                padding: 2px 5px;
                margin: 0 10px;
                font-size: 0.9em;
            }
            .opening-tag {
                background: rgba(67, 160, 71, 0.2);
                color: #43a047;
            }
            .closing-tag {
                background: rgba(239, 83, 80, 0.2);
                color: #ef5350;
            }
            .tag-content {
                font-family: 'Consolas', 'Courier New', monospace;
            }
            .warning {
                background: rgba(255, 152, 0, 0.2);
                padding: 10px;
                border-radius: 4px;
                margin: 10px 0;
                border-left: 3px solid #ff9800;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>标签对象: <strong>${sanitizeTagName(tagName)}</strong></h1>
            <div class="tag-preview">
                ${sanitizeTagName(`[!${tagName}]`)} / ${sanitizeTagName(`[~${tagName}]`)}
            </div>
        </div>

        <div class="stats-container">
             <div class="stat-card">
                <div>总出现次数</div>
                <div class="stat-value">${statistics.total}</div>
            </div>

            <div class="stat-card">
                <div>开标签数量</div>
                <div class="stat-value">${statistics.opening}</div>
            </div>

            <div class="stat-card">
                <div>闭标签数量</div>
                <div class="stat-value">${statistics.closing}</div>
            </div>

            <div class="stat-card ${statistics.unbalanced ? 'unbalanced' : 'balanced'}">
                <div>标签平衡状态</div>
                <div class="stat-value">${statistics.unbalanced ? '不平衡' : '平衡'}</div>
            </div>
        </div>

        ${statistics.unbalanced ? `
        <div class="warning">
            ⚠ 警告: 此标签不平衡! 开标签(${statistics.opening}) 和 闭标签(${statistics.closing}) 数量不一致
        </div>
        ` : ''}

        <div class="locations">
            <h2>出现位置 (共 ${statistics.locations.length} 处)</h2>
            ${statistics.locations.map(loc => `
                <div class="location-item"
                    data-start-line="${loc.range.start.line}"
                    data-start-char="${loc.range.start.character}"
                    data-end-line="${loc.range.end.line}"
                    data-end-char="${loc.range.end.character}">
                    <span class="line-number">行 ${loc.range.start.line + 1}</span>
                    <span class="tag-type ${loc.type === TAG_TYPES.OPENING ? 'opening-tag' : 'closing-tag'}">
                        ${TAG_DISPLAY_NAMES[loc.type]}
                    </span>
                    <span class="tag-content">${sanitizeTagName(loc.fullText)}</span>
                </div>
            `).join('')}
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            document.querySelectorAll('.location-item').forEach(item => {
                item.addEventListener('click', () => {
                    const startLine = parseInt(item.getAttribute('data-start-line'));
                    const startChar = parseInt(item.getAttribute('data-start-char'));
                    const endLine = parseInt(item.getAttribute('data-end-line'));
                    const endChar = parseInt(item.getAttribute('data-end-char'));
                    vscode.postMessage({
                        command: 'navigate',
                        startLine: startLine,
                        startChar: startChar,
                        endLine: endLine,
                        endChar: endChar
                    });
                });
            });
        </script>
    </body>
    </html>
    `;
};