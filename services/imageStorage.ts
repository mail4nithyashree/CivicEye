import * as FileSystem from 'expo-file-system/legacy';

const COMPLAINTS_DIR = `${FileSystem.documentDirectory}complaints/`;

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(COMPLAINTS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(COMPLAINTS_DIR, { intermediates: true });
  }
}

/**
 * Copies a temporary image URI (camera/gallery) into the app's persistent
 * document directory. Returns the new persistent URI.
 *
 * The stored file survives navigation, app restarts, and cache clears.
 */
export async function saveComplaintImage(tempUri: string): Promise<string> {
  await ensureDir();
  const filename = `complaint_${Date.now()}.jpg`;
  const destUri = `${COMPLAINTS_DIR}${filename}`;
  await FileSystem.copyAsync({ from: tempUri, to: destUri });
  return destUri;
}

/**
 * Deletes a previously saved complaint image.
 * Safe to call even if the file no longer exists.
 */
export async function deleteComplaintImage(uri: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch {
    // Silently ignore — deletion is best-effort
  }
}
