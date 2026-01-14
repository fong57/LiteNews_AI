const mongoose = require('mongoose');

const SectionSchema = new mongoose.Schema(
  {
    heading: String,
    content: String,
  },
  { _id: false }
);

const JournalEntrySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true },
    title: { type: String },
    rawMarkdown: { type: String, required: true },
    plainText: { type: String, required: true },
    tags: [String],
    sections: [SectionSchema],
    embedding: { type: [Number], default: [] }, // vector for AI search (optional for now)
  },
  { timestamps: true }
);

module.exports = mongoose.model('JournalEntry', JournalEntrySchema);

