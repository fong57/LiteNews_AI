// services/agenticWriter/graph.js
const { StateGraph, Annotation } = require('@langchain/langgraph');
const { outlineNode } = require('./nodes/outline');
const { draftNode } = require('./nodes/draft');
const { reviseNode } = require('./nodes/revise');
const { formatNode } = require('./nodes/format');

// State schema: each key stores the latest value from nodes (no reducers).
const ArticleWriterState = Annotation.Root({
  topic: Annotation(),
  newsItems: Annotation(),
  options: Annotation(),
  outline: Annotation(),
  rawDraft: Annotation(),
  revisedDraft: Annotation(),
  finalArticle: Annotation(),
  error: Annotation()
});

const graphBuilder = new StateGraph(ArticleWriterState)
  .addNode('makeOutline', outlineNode)
  .addNode('writeDraft', draftNode)
  .addNode('reviseDraft', reviseNode)
  .addNode('formatOutput', formatNode)
  .addEdge('__start__', 'makeOutline')
  .addEdge('makeOutline', 'writeDraft')
  .addEdge('writeDraft', 'reviseDraft')
  .addEdge('reviseDraft', 'formatOutput')
  .addEdge('formatOutput', '__end__');

const compiledGraph = graphBuilder.compile();

module.exports = { compiledGraph, ArticleWriterState };
