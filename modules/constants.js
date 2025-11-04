// modules/constants.js

module.exports = {
    TAG_REGEX: /\[([!~])([^\]\r\n]+)\]/g,
    OPENING_TAG_REGEX: /\[!([^\]\r\n]+)\]\s*$/,
    CONFIG_KEYS: {
        QUICK_SUGGESTIONS: 'quickSuggestions',
        SUGGEST_ON_TRIGGER: 'suggestOnTriggerCharacters',
        WORD_BASED: 'wordBasedSuggestions'
    },

    TEXT_SNIPPET_RANGE: 20,

    TAG_TYPES: {
        OPENING: 'OPENING',
        CLOSING: 'CLOSING'
    },

    TAG_DISPLAY_NAMES: {
        OPENING: '开标签',
        CLOSING: '闭标签'
    },

    RECOMMENDED_THEME: 'Custom Tags Theme'
};