import { useState } from 'react';

// Mirror assetImgWithFallback() (index.html:508-...): gambar dengan fallback
// kalau file tidak ada (logo/stempel opsional, belum tentu di-upload admin).
export function AssetImgWithFallback({ url, alt, className, fallback }: { url: string; alt: string; className?: string; fallback?: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return fallback ? <>{fallback}</> : null;
  return <img src={url} alt={alt} className={className} onError={() => setFailed(true)} />;
}
