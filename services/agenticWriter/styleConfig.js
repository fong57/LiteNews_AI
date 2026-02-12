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
    // Quantifiable core config (for automation/style checks)
    maxSentenceLength: 20,
    maxParagraphLength: 80,
    minSections: 3,
    maxSections: 5,
    forbiddenPhrases: ['絕對', '肯定', '毫無疑問', '必然'],
    recommendedSignposts: ['簡單來說', '重點如下', '核心資訊', '時間軸', '常見Q&A', '總結一下'],
    outlineGuidelines: `
# 大綱規則（強制遵循）
1. 必須包含【2個核心章節】:背景、重點整理（缺一不可）。
2. 可選補充章節(選1-2個):爭議與影響、下一步可能發展、常見Q&A、時間軸。
3. 章節順序建議:背景 → 重點整理 → [可選章節]（符合讀者認知邏輯）。
4. 每個章節標題需簡潔(≤8個字),例如:「背景：事件起因」「重點整理：關鍵時間點」。
5. 大綱需確保零基礎讀者能從零理解事件，避免跳步。
`,
    draftGuidelines: `
# 寫作規則（強制遵循）
1. 語言與句式：
   - 單句字符數≤20(避免長句);
   - 只用小學至初中級中文詞匯,禁止專業術語(如必須使用,需用括號解釋,例:「CPI(消費者物價指數)」);
   - 主動語態優先（例：「政府推出政策」而非「政策被政府推出」）。
2. 格式與可讀性（實現"易掃描"):
   - 重點整理章節必須使用「數字列表」(1. 2. 3.）呈現關鍵事實；
   - 時間相關內容必須用「時間軸格式」(YYYY/MM/DD:事件);
   - 每個段落僅講1個核心信息,段落間空行分隔;
   - 關鍵數據/事實用「加粗」標注（例：「本次政策影響**超500萬人**」）。
3. 內容要求：
   - 只保留事實性信息，禁止主觀評價（例：避免「這個政策很好」）；
   - 時間、人物、數字等關鍵信息必須明確,禁止模糊表述(例:「近日」→「2026/02/10」)。
`,
    styleGuidelines: `
# 風格規則（強制遵循）
1. 優先級：清晰性 > 簡潔性 > 深度（只講核心，不展開無關細節）。
2. 路標短語使用：
   - 開頭用「簡單來說」/「核心資訊」引入主題；
   - 重點整理前用「重點如下」引導；
   - 結尾用「總結一下」收束全文；
   - 每1-2個段落可使用1個推薦路標短語(避免過度堆砌）。
3. 語氣：
   - 全程保持中立客觀，禁止情緒化詞匯（如「離譜」「糟糕」）；
   - 避免過度絕對化用語(參考forbiddenPhrases),不確定信息標注「據媒體報導」/「暫未確認」。
4. 格式細節：
   - 禁止使用Markdown標題(##/###），章節名直接文字呈現；
   - 禁止使用英文縮寫(除非帶中文解釋）；
   - 數字用阿拉伯數字(例:「5天」而非「五天」),日期用YYYY/MM/DD格式。
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
