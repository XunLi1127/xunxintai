const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');

const PRIMARY_PROMPT_FILE = '小洵.md';
const LEGACY_PROMPT_FILE = 'system-prompt.txt';
const LEGACY_DEPRECATION_MESSAGE = 'system-prompt.txt is a legacy fallback; migrate product instructions to 小洵.md.';
const BUILTIN_FALLBACK = '你是洵心台中的 AI 助手。事实与证据优先；不得伪造文件、工具结果、外部状态或完成情况，并在完成前进行与风险相称的验证。';

function readUtf8Prompt(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(filePath));
  return content.trim() ? content : null;
}

function cleanLegacyPrompt(prompt) {
  return prompt
    .replace(/<override_instructions>[\s\S]*?<\/override_instructions>\s*/g, '')
    .replace(/<identity>[\s\S]*?<\/identity>\s*/g, '');
}

function loadProductPrompt(promptDirectory = __dirname) {
  const primary = readUtf8Prompt(path.join(promptDirectory, PRIMARY_PROMPT_FILE));
  if (primary) {
    return {
      prompt: primary,
      cleanPrompt: primary,
      source: 'primary',
      deprecated: false,
      deprecationMessage: null,
    };
  }

  const legacy = readUtf8Prompt(path.join(promptDirectory, LEGACY_PROMPT_FILE));
  if (legacy) {
    const cleanedLegacy = cleanLegacyPrompt(legacy);
    return {
      prompt: legacy,
      cleanPrompt: cleanedLegacy.trim() ? cleanedLegacy : BUILTIN_FALLBACK,
      source: 'legacy-fallback',
      deprecated: true,
      deprecationMessage: LEGACY_DEPRECATION_MESSAGE,
    };
  }

  return {
    prompt: BUILTIN_FALLBACK,
    cleanPrompt: BUILTIN_FALLBACK,
    source: 'builtin-fallback',
    deprecated: false,
    deprecationMessage: null,
  };
}

function composeSystemPrompt(productPrompt, runtimeSections = []) {
  return [productPrompt, ...runtimeSections].filter((section) => typeof section === 'string' && section.trim()).join('\n\n');
}

module.exports = {
  BUILTIN_FALLBACK,
  LEGACY_DEPRECATION_MESSAGE,
  composeSystemPrompt,
  loadProductPrompt,
};
