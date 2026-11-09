import React, { useEffect, useState } from 'react';
import { Film } from 'lucide-react';

interface CinemaPosterImageProps {
  src: string;
  fallbackVideoId?: string;
  alt: string;
  category?: string;
  className?: string;
}

export const CinemaPosterImage: React.FC<CinemaPosterImageProps> = ({
  src,
  fallbackVideoId,
  alt,
  category,
  className = '',
}) => {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [triedHqFallback, setTriedHqFallback] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    setCurrentSrc(src);
    setTriedHqFallback(false);
    setHasFailed(false);
  }, [src, fallbackVideoId]);

  const handleError = () => {
    if (!triedHqFallback && fallbackVideoId) {
      setTriedHqFallback(true);
      setCurrentSrc(`https://i.ytimg.com/vi/${fallbackVideoId}/hqdefault.jpg`);
      return;
    }
    setHasFailed(true);
  };

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    // Detect YouTube's 120x90 grey 3-dots placeholder when maxresdefault is missing
    if (img.naturalWidth > 0 && img.naturalWidth <= 120 && img.naturalHeight <= 90) {
      handleError();
    }
  };

  if (hasFailed || !currentSrc) {
    return (
      <div
        className={`relative flex flex-col items-center justify-center bg-gradient-to-br from-[#141824] via-[#0B0D13] to-[#1F0910] p-4 text-center select-none overflow-hidden ${className}`}
      >
        <Film className="w-8 h-8 text-[#E11D48]/70 mb-2 shrink-0" />
        <p className="font-display text-xs font-semibold text-slate-200 line-clamp-2 max-w-[18ch]">
          {alt}
        </p>
        {category && (
          <span className="mt-1 text-[11px] text-slate-400">{category}</span>
        )}
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onLoad={handleLoad}
      onError={handleError}
      className={className}
      loading="lazy"
      decoding="async"
      fetchPriority="low"
    />
  );
};
