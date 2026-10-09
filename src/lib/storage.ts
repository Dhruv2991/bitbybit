import fs from 'fs';
import path from 'path';

const STORAGE_ROOT = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.join(process.cwd(), 'public', 'uploads');

/**
 * Ensures the target storage directory exists.
 */
function ensureDirectory(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Saves a file buffer to the local disk.
 * @param bucket Or subfolder (e.g. 'problem-images', 'certificates', 'avatars')
 * @param fileName File name or relative path within bucket
 * @param buffer Data buffer
 */
export async function saveFile(
  bucket: string,
  fileName: string,
  buffer: Buffer
): Promise<{ filePath: string; publicUrl: string; size: number }> {
  const bucketDir = path.join(STORAGE_ROOT, bucket);
  ensureDirectory(bucketDir);

  const cleanFileName = path.basename(fileName);
  const targetPath = path.join(bucketDir, cleanFileName);

  await fs.promises.writeFile(targetPath, buffer);

  // If stored in public/uploads, can be served directly or via /api/images/:bucket/:fileName
  const publicUrl = `/api/images/${bucket}/${cleanFileName}`;

  return {
    filePath: targetPath,
    publicUrl,
    size: buffer.length,
  };
}

/**
 * Reads a file buffer from the local disk.
 */
export async function readFile(bucket: string, fileName: string): Promise<Buffer | null> {
  const cleanFileName = path.basename(fileName);
  const targetPath = path.join(STORAGE_ROOT, bucket, cleanFileName);

  try {
    if (fs.existsSync(targetPath)) {
      return await fs.promises.readFile(targetPath);
    }
    // Also check root uploads dir directly
    const fallbackPath = path.join(STORAGE_ROOT, cleanFileName);
    if (fs.existsSync(fallbackPath)) {
      return await fs.promises.readFile(fallbackPath);
    }
  } catch (err) {
    console.error(`[storage] Error reading file ${bucket}/${fileName}:`, err);
  }
  return null;
}

/**
 * Deletes a file from local disk.
 */
export async function deleteFile(bucket: string, fileName: string): Promise<boolean> {
  const cleanFileName = path.basename(fileName);
  const targetPath = path.join(STORAGE_ROOT, bucket, cleanFileName);

  try {
    if (fs.existsSync(targetPath)) {
      await fs.promises.unlink(targetPath);
      return true;
    }
  } catch (err) {
    console.error(`[storage] Error deleting file ${bucket}/${fileName}:`, err);
  }
  return false;
}

/**
 * Checks if a file exists locally.
 */
export function fileExists(bucket: string, fileName: string): boolean {
  const cleanFileName = path.basename(fileName);
  const targetPath = path.join(STORAGE_ROOT, bucket, cleanFileName);
  return fs.existsSync(targetPath) || fs.existsSync(path.join(STORAGE_ROOT, cleanFileName));
}

/**
 * Gets the relative public URL for an asset.
 */
export function getAssetUrl(bucket: string, fileName: string): string {
  const cleanFileName = path.basename(fileName);
  return `/api/images/${bucket}/${cleanFileName}`;
}
