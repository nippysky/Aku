/**
 * Cloudinary avatar upload helper.
 *
 * Setup:
 *  1. Go to cloudinary.com → Dashboard
 *  2. Copy Cloud Name, API Key, API Secret → set in .env
 */
import { v2 as cloudinary } from 'cloudinary';

let configured = false;

function configure(): void {
  if (configured) return;
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary environment variables are not set');
  }
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key:    CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure:     true,
  });
  configured = true;
}

/**
 * Upload a Buffer (image file) to Cloudinary.
 * Returns the secure HTTPS URL.
 *
 * @param buffer   - Raw image bytes
 * @param userId   - Used as the public_id so each user has exactly one avatar
 * @param mimeType - e.g. "image/jpeg", "image/png"
 */
export async function uploadAvatar(
  buffer:   Buffer,
  userId:   string,
  mimeType: string,
): Promise<string> {
  configure();

  // Determine format from mime type
  const format = mimeType === 'image/png' ? 'png' : 'jpg';

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder:            'aku/avatars',
        public_id:         `user_${userId}`,
        overwrite:         true,
        invalidate:        true,    // Bust CDN cache on update
        transformation:    [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto:good', fetch_format: 'auto' },
        ],
        format,
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Cloudinary upload failed'));
        } else {
          resolve(result.secure_url);
        }
      },
    );

    uploadStream.end(buffer);
  });
}

/**
 * Delete a user's avatar from Cloudinary (e.g. on account deletion).
 */
export async function deleteAvatar(userId: string): Promise<void> {
  configure();
  await cloudinary.uploader.destroy(`aku/avatars/user_${userId}`);
}
