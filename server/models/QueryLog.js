import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const queryLogSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  questionText: {
    type: String,
    required: true,
  },
  answerText: {
    type: String,
    required: true,
  },
  matchedDocumentIds: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Document',
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const QueryLog = model('QueryLog', queryLogSchema);

export default QueryLog;
