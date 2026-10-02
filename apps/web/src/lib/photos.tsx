import { useEffect, useState } from 'react';
import type { AxiosInstance } from 'axios';

/**
 * Shrink a phone photo before upload: a 12 MP camera image is 4–12 MB, which is
 * slow on cellular and pointless at screen size. Falls back to the original file
 * when the browser can't decode it (e.g. HEIC outside Safari) — the server
 * normalises again either way.
 */
export async function shrinkPhoto(file: File, maxEdge = 1600, quality = 0.82): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export async function uploadPhoto(client: AxiosInstance, url: string, file: File): Promise<void> {
  const blob = await shrinkPhoto(file);
  const fd = new FormData();
  fd.append('photo', blob, file.name.replace(/\.(heic|heif|png|webp)$/i, '.jpg'));
  await client.post(url, fd);
}

/**
 * <img> can't send an Authorization header, so authenticated photos are fetched
 * as blobs and shown via an object URL. Clicking opens the full image.
 */
export function AuthPhoto({ client, url, className }: { client: AxiosInstance; url: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    client
      .get(url, { responseType: 'blob' })
      .then((r) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(r.data as Blob);
        setSrc(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client, url]);

  if (failed) {
    return <div className={`${className ?? ''} bg-slate-100 flex items-center justify-center text-[10px] text-slate-400`}>Unavailable</div>;
  }
  if (!src) return <div className={`${className ?? ''} bg-slate-100 animate-pulse`} />;
  return (
    <a href={src} target="_blank" rel="noreferrer" title="Open full size">
      <img src={src} alt="" className={`${className ?? ''} object-cover`} />
    </a>
  );
}
