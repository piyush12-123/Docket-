import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const notificationSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  documentId: {
    type: Schema.Types.ObjectId,
    ref: 'Document',
    default: null,
  },
  message: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['expiry_alert', 'processing_complete', 'processing_failed'],
    required: true,
  },
  read: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Notification = model('Notification', notificationSchema);

export default Notification;
