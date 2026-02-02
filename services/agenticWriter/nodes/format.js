// services/agenticWriter/nodes/format.js

/**
 * Node: from revisedDraft (and outline for title) produce finalArticle { title, body }.
 * @param {Object} state - Graph state with outline, revisedDraft
 * @returns {Promise<{ finalArticle: { title, body } }>}
 */
async function formatNode(state) {
  const { outline, revisedDraft } = state;
  const title = (outline && outline.headline) ? String(outline.headline).trim() : 'Untitled';
  const body = (revisedDraft && String(revisedDraft).trim()) || '';

  return {
    finalArticle: {
      title: title || 'Untitled',
      body: body || ''
    }
  };
}

module.exports = { formatNode };
