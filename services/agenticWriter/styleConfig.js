// services/agenticWriter/styleConfig.js
// Article type guidelines for outline, draft, and style.

const ARTICLE_TYPE_CONFIG = {
  多方觀點: {
    key: '多方觀點',
    outlineGuidelines: `
- Present at least two clearly distinct viewpoints on the topic.
- Include sections for each side's arguments and evidence.
- Include a section summarizing key disagreements and open questions.
`,
    draftGuidelines: `
- Use neutral language and avoid taking sides.
- Attribute claims to sources ("支持者認為", "批評者指出", etc.).
- Explain why each side holds its view, not just what it is.
`,
    styleGuidelines: `
- Use clear headings for each perspective.
- Avoid sensationalism; focus on balanced explanation.
- Keep paragraphs relatively short.
`
  },
  懶人包: {
    key: '懶人包',
    outlineGuidelines: `
- Include sections such as: 背景, 重點整理, 爭議與影響, 下一步可能發展.
- Make sure a reader can understand the issue from scratch.
`,
    draftGuidelines: `
- Use simple language and short sentences.
- Explain jargon and context.
- Highlight key facts and timelines in a scannable way.
`,
    styleGuidelines: `
- Prioritize clarity over depth.
- Use signposting phrases ("簡單來說", "重點如下") where appropriate.
`
  },
  其他: {
    key: '其他',
    outlineGuidelines: '',
    draftGuidelines: '',
    styleGuidelines: ''
  }
};

module.exports = { ARTICLE_TYPE_CONFIG };
