'use client';

import { useState } from 'react';
import Image from 'next/image';

export function AccountAvatar({ name, image, size = 32 }: { name: string; image?: string | null; size?: number }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const initials = name.trim().split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0] ?? '').join('').toUpperCase();
  return <span aria-hidden="true" className="relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-[#2A2623]/45 bg-[#F6D97A] font-display font-bold text-[#2A2623]" style={{ width: size, height: size, fontSize: size * 0.36 }}>
    {initials || 'P'}
    {image && /^https:\/\//i.test(image) && image !== failedImage && (
      <Image unoptimized src={image} width={size} height={size} className="absolute inset-0 size-full object-cover" alt="" referrerPolicy="no-referrer" onError={() => setFailedImage(image)} />
    )}
  </span>;
}
