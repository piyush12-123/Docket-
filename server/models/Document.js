import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const documentSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  originalFilename: {
    type: String,
    required: true,
  },
  fileUrl: {
    type: String,
    required: true,
  },
  fileType: {
    type: String,
    enum: ['pdf', 'image'],
    required: true,
  },
  extractedText: {
    type: String,
    default: '',
  },
  documentType: {
    type: String,
    enum: ['id', 'certificate', 'contract', 'invoice', 'insurance', 'warranty', 'other'],
    default: 'other',
  },
  issuer: {
    type: String,
    default: null,
  },
  issueDate: {
    type: Date,
    default: null,
  },
  expiryDate: {
    type: Date,
    default: null,
  },
  amount: {
    type: Number,
    default: null,
  },
  tags: [{ type: String, trim: true }],
  status: {
    type: String,
    enum: ['processing', 'ready', 'failed'],
    default: 'processing',
  },
  failureReason: {
    type: String,
    default: null,
  },
  alertsSent: [{ type: String, enum: ['30day', '7day', '1day'] }],
  reviewedByUser: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index to support AlertService query (userId + expiryDate range scans)
documentSchema.index({ userId: 1, expiryDate: 1 });

// Text index to support $text keyword search across title, extractedText, and issuer
documentSchema.index({ title: 'text', extractedText: 'text', issuer: 'text' });

// Keep updatedAt current on every save
documentSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

const Document = model('Document', documentSchema);

export default Document;
