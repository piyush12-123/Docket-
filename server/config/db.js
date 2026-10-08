import mongoose from 'mongoose';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

export const connectDB = async (retries = MAX_RETRIES) => {
  const uri = process.env.MONGODB_URI;
  
  if (!uri) {
    console.error('MONGODB_URI environment variable is not set');
    process.exit(1);
  }

  // Mask credentials for logging
  const maskedUri = uri.replace(/:\/\/([^:]+):([^@]+)@/, '://<user>:<pass>@');
  console.log(`Connecting to MongoDB: ${maskedUri}`);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
      });
      console.log('MongoDB connected successfully');
      return;
    } catch (err) {
      console.error(`MongoDB connection attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt < retries) {
        console.log(`Retrying in ${RETRY_DELAY_MS}ms...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      } else {
        console.error('All MongoDB connection attempts failed');
        process.exit(1);
      }
    }
  }
};
