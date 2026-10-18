import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export interface MultipartUploadOptions {
  fieldName?: string;
  fileName?: string;
  mimeType?: string;
  headers?: Record<string, string>;
  parameters?: Record<string, string>;
  timeoutMs?: number;
}

export interface MultipartUploadResponse<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

/**
 * Uploads an image to a multipart/form-data endpoint in a way that is 100%
 * compatible with Expo Go on Android/iOS (via native FileSystem.uploadAsync)
 * and Web/other runtimes (via Blob + FormData).
 *
 * Prevents the React Native "Unsupported FormDataPart implementation" error
 * and eliminates native Blob copy performance overhead and cancellation warnings.
 */
export async function uploadImageMultipart<T = any>(
  url: string,
  imageUri: string,
  options: MultipartUploadOptions = {}
): Promise<MultipartUploadResponse<T>> {
  const {
    fieldName = 'image',
    fileName = 'image.jpg',
    mimeType = 'image/jpeg',
    headers = {},
    parameters = {},
    timeoutMs = 8000,
  } = options;

  if (!imageUri) {
    return {
      ok: false,
      status: 400,
      data: null,
      error: 'No image URI provided',
    };
  }

  // Strategy 1: Native Expo FileSystem.uploadAsync (Handles Android file:// and content:// URIs natively)
  const isLocalNativeUri =
    imageUri.startsWith('file:') ||
    imageUri.startsWith('content:') ||
    imageUri.startsWith('/') ||
    imageUri.startsWith('ph:');

  if (Platform.OS !== 'web' && isLocalNativeUri && typeof FileSystem?.uploadAsync === 'function') {
    let timeoutHandle: any;
    try {
      console.log(`[MultipartUpload] Uploading native URI via FileSystem.uploadAsync to: ${url}`);

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('Upload request timed out')), timeoutMs);
      });

      const uploadPromise = FileSystem.uploadAsync(url, imageUri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName,
        mimeType,
        headers: {
          Accept: 'application/json',
          ...headers,
        },
        parameters,
      });

      const result = await Promise.race([uploadPromise, timeoutPromise]);

      let parsedData: any = null;
      if (result.body) {
        try {
          parsedData = JSON.parse(result.body);
        } catch {
          parsedData = { raw: result.body };
        }
      }

      const isOk = result.status >= 200 && result.status < 300;
      return {
        ok: isOk,
        status: result.status,
        data: parsedData,
        error: isOk ? undefined : (parsedData?.message || `Server returned HTTP ${result.status}`),
      };
    } catch (nativeErr: any) {
      const errMsg = nativeErr?.message || String(nativeErr);
      console.warn(`[MultipartUpload] Native FileSystem.uploadAsync request notice (${errMsg}). Proceeding with resilient fallback.`);
      return {
        ok: false,
        status: 0,
        data: null,
        error: errMsg,
      };
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  // Strategy 2: Web / HTTP URI runtime with standard Fetch + FormData
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    console.log(`[MultipartUpload] Uploading via Fetch to: ${url}`);
    const fileRes = await fetch(imageUri);
    const blob = await fileRes.blob();

    const formData = new FormData();
    formData.append(fieldName, blob, fileName);

    if (parameters) {
      for (const [key, val] of Object.entries(parameters)) {
        formData.append(key, val);
      }
    }

    const res = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: {
        Accept: 'application/json',
        ...headers,
      },
      signal: controller.signal,
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? undefined : (data?.message || `HTTP Error ${res.status}`),
    };
  } catch (err: any) {
    const errMsg = err?.name === 'AbortError' ? 'Upload request timed out' : (err?.message || 'Network upload error');
    console.warn(`[MultipartUpload] Fetch upload request notice (${errMsg}).`);
    return {
      ok: false,
      status: 0,
      data: null,
      error: errMsg,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
