// services/agenticWriter/nodes/research.js
const { searchWeb } = require('../tools/searchWeb');

/**
 * Node: perform external research for the topic.
 * @param {Object} state - Graph state with topic, options
 * @returns {Promise<{ researchResults: Array }>} Returns a Promise that resolves to an object with a researchResults key (an array of standardized search results).
 */
async function researchNode(state) { // Defines an async function researchNode, The only parameter is state, which is the full LangGraph state object passed into every node in the workflow.
  // Extract Inputs from State
  const { topic, options } = state;
  const maxArticles = options?.maxResearchArticles ?? 20; // Default max articles to 20 if not specified in options
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
