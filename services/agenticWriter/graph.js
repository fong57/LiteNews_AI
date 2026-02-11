// services/agenticWriter/graph.js
const { StateGraph, Annotation } = require('@langchain/langgraph');
const { researchNode } = require('./nodes/research');
const { outlineFromResearchNode } = require('./nodes/outlineFromResearch');
const { draftNode } = require('./nodes/draft');
const { factCheckNode } = require('./nodes/factCheck');
const { reviseNode } = require('./nodes/revise');
const { finalReviewNode } = require('./nodes/finalReview');
const { formatNode } = require('./nodes/format');

// State schema: each key stores the latest value from nodes (no reducers).
// topic, newsItems, options = input; researchResults, outline, rawDraft, revisedDraft,
// factCheckResults, factCheckScore, styleNotes, finalReview, readyForPublish, finalArticle, error = artifacts.
const ArticleWriterState = Annotation.Root({
  topic: Annotation(),
  newsItems: Annotation(),
  options: Annotation(),
  researchResults: Annotation(),
  outline: Annotation(),
  rawDraft: Annotation(),
  revisedDraft: Annotation(),
  factCheckResults: Annotation(),
  factCheckScore: Annotation(),
  styleNotes: Annotation(),
  finalReview: Annotation(),
  readyForPublish: Annotation(),
  finalArticle: Annotation(),
  error: Annotation()
});

const graphBuilder = new StateGraph(ArticleWriterState)
  .addNode('research', researchNode)
  .addNode('makeOutline', outlineFromResearchNode)
  .addNode('draft', draftNode)
  .addNode('factCheck', factCheckNode)
  .addNode('revise', reviseNode)
  .addNode('doFinalReview', finalReviewNode)
  .addNode('format', formatNode)
  .addEdge('__start__', 'research')
  .addEdge('research', 'makeOutline')
  .addEdge('makeOutline', 'draft')
  .addEdge('draft', 'factCheck')
  .addEdge('factCheck', 'revise')
  .addEdge('revise', 'doFinalReview')
  .addEdge('doFinalReview', 'format')
  .addEdge('format', '__end__');

const compiledGraph = graphBuilder.compile();

module.exports = { compiledGraph, ArticleWriterState };
