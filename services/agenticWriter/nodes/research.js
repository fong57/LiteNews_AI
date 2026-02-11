// services/agenticWriter/nodes/research.js
const { searchWeb } = require('../tools/searchWeb');

/**
 * Node: perform external research for the topic.
 * @param {Object} state - Graph state with topic, options
 * @returns {Promise<{ researchResults: Array }>}
 */
async function researchNode(state) {
  const { topic, options } = state;
  const maxArticles = options?.maxResearchArticles ?? 8;
  const query = topic?.title || topic?.summary || '時事';

  const results = await searchWeb({
    query,
    maxResults: maxArticles
  });

  const researchResults = (results || []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.snippet || '',
    content: r.content || ''
  }));

  return { researchResults };
}

module.exports = { researchNode };
