// services/agenticWriter/nodes/draft.js
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { getModel } = require('../getModel');
const { ARTICLE_TYPE_CONFIG } = require('../styleConfig');

/**
 * Node: from outline + newsItems + researchResults produce rawDraft (type-aware).
 * @param {Object} state - Graph state with outline, newsItems, researchResults, options
 * @returns {Promise<{ rawDraft: string }>}
 */
async function draftNode(state) {
  const { outline, newsItems, researchResults, options } = state;
  const articleType = options?.articleType || '懶人包';
  const publication = options?.publication || 'LiteNews';
  const config = ARTICLE_TYPE_CONFIG[articleType] || ARTICLE_TYPE_CONFIG['其他'];

  const lang = options?.language === 'zh-TW' ? '繁體中文' : 'Traditional Chinese';
  const length = typeof options?.length === 'number' && options.length > 0 ? options.length : 800;

  const internalSnippets = (newsItems || [])
    .slice(0, 10)
    .map(
      (item, i) =>
        `${i + 1}. ${item.title}\n   ${(item.description || '').slice(0, 300)}`
    )
    .join('\n\n');

  const externalSnippets = (researchResults || [])
    .slice(0, options?.maxResearchArticles || 8)
    .map(
      (item, i) =>
        `${i + 1}. ${item.title}\n   ${(item.snippet || '').slice(0, 300)}`
    )
    .join('\n\n');

  // Cap sample body length to avoid huge prompts (e.g. 多方觀點 has very long samples)
  const MAX_SAMPLE_BODY_CHARS = 600;
  const fewShotBlock = (config.sampleArticles && config.sampleArticles.length > 0)
    ? `
[同類型文章範例（請參考其結構、語氣與格式）]
${config.sampleArticles.map((s, i) => {
      const body = (s.body || '').slice(0, MAX_SAMPLE_BODY_CHARS);
      const suffix = (s.body || '').length > MAX_SAMPLE_BODY_CHARS ? '…' : '';
      return `【範例 ${i + 1}】\n標題：${s.headline || ''}\n內文：\n${body}${suffix}`;
    }).join('\n\n')}

以上僅供參考風格，請依本次大綱與來源撰寫新文章。
`
    : '';

  const systemPrompt = `
你是一個香港專業報章的新聞撰稿人。
- 語言：正式書面語，混合適量香港口語（如「市民」而非「居民」、「當局」而非「政府」），避免過度文言或俗語，符合香港新聞的語境習慣；
- 立場：客觀中立，以事實為核心，不加入個人評論，僅在引述時體現不同聲音；
- 若無來源，切勿捏造事實、數據或引述。
- 若資訊不足，請寫「暫無公開資料」，不要猜測。
- 對不確定的事項避免使用過於肯定的用語（例如「絕對」、「已證實」）。
- 新聞寫作規範：落實5W 核心要素（何人、何事、何時、何地、為何）；文中所有引用內容，必須標註發言人具體姓名和資訊來源媒體。標註方式應符合香港新聞規範，例如人物第一次出現時標註較詳細身份信息。標註方式應自然揉合到文章行文之中，例如「根據《明報》報導，特首李家超表示…」。對於事實報導，只需要引用來源報章，不需要標注具體記者。

請撰寫一篇 ${articleType} 文章。
目標字數：${length} 字，請嚴格遵守。
${fewShotBlock}

請遵循以下準則：

[文章類型撰寫準則]
${config.draftGuidelines}

使用者額外指示：
${options?.extraInstructions || '無'}

請依大綱與來源以 ${lang} 撰寫完整文章。
使用清楚段落，勿包含 JSON 或元註解。
僅輸出文章正文。
`.trim();

  const userPrompt = `
大綱：
標題：${outline?.headline || '未命名'}
段落：${(outline?.sections || []).join(' | ')}

內部來源：
${internalSnippets || '無'}

外部研究：
${externalSnippets || '無'}

請以 ${lang} 撰寫完整文章。
僅輸出文章內文。`.trim();

  const model = getModel();
  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt)
  ]);
  const rawDraft =
    typeof response.content === 'string'
      ? response.content
      : response.content?.trim?.() || '';

  return { rawDraft };
}

module.exports = { draftNode };
