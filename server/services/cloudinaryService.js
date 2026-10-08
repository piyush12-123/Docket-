import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a file buffer to Cloudinary via upload_stream.
 *
 * @param {Buffer} buffer - The file buffer to upload
 * @param {object} options - Cloudinary upload options (e.g. folder, resource_type)
 * @returns {Promise<{ fileUrl: string, publicId: string }>}
 */
export const uploadStream = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      resource_type: 'auto',
      ...options,
    };

    const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
      if (error) {
        return reject(error);
      }
      resolve({
        fileUrl: result.secure_url,
        publicId: result.public_id,
      });
    });

    stream.end(buffer);
  });
};

/**
 * Delete a file from Cloudinary by its public ID.
 *
 * @param {string} publicId - The Cloudinary public_id of the file to delete
 * @returns {Promise<void>}
 */
export const deleteFile = (publicId) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) {
        return reject(error);
      }
      resolve(result);
    });
  });
};
