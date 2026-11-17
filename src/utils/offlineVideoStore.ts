// IndexedDB persistence for 100% offline, zero-data movie playback
const DB_NAME = 'tk_storyworld_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'offline_movies';

interface StoredOfflineRecord {
  movieId: string;
  fileName: string;
  fileSize: number;
  blob: Blob;
  updatedAt: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'movieId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open offline database'));
  });
}

export async function saveOfflineVideoBlob(
  movieId: string,
  blobOrFile: Blob | File,
  fileName?: string
): Promise<void> {
  try {
    const db = await openDB();
    const resolvedName =
      fileName || (blobOrFile instanceof File ? blobOrFile.name : `movie-${movieId}.mp4`);
    const record: StoredOfflineRecord = {
      movieId,
      fileName: resolvedName,
      fileSize: blobOrFile.size,
      blob: blobOrFile,
      updatedAt: new Date().toISOString(),
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to store offline video'));
    });
  } catch (err) {
    console.warn('Could not store video in IndexedDB (likely quota or private mode):', err);
    throw err;
  }
}

export async function getOfflineVideoBlob(
  movieId: string
): Promise<{ blob: Blob; fileName: string; fileSize: number } | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(movieId);
      req.onsuccess = () => {
        const res = req.result as StoredOfflineRecord | undefined;
        if (res && res.blob) {
          resolve({
            blob: res.blob,
            fileName: res.fileName,
            fileSize: res.fileSize,
          });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error || new Error('Failed to retrieve offline video'));
    });
  } catch (err) {
    console.warn('Failed to get offline video from IndexedDB:', err);
    return null;
  }
}

export async function hasOfflineVideo(movieId: string): Promise<boolean> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getKey(movieId);
      req.onsuccess = () => resolve(req.result !== undefined);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function removeOfflineVideo(movieId: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(movieId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to delete offline video'));
    });
  } catch (err) {
    console.warn('Failed to delete offline video from IndexedDB:', err);
  }
}

export async function getAllOfflineMovieIds(): Promise<string[]> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAllKeys();
      req.onsuccess = () => resolve((req.result as string[]) || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}
