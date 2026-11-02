import React, { useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Heart,
  MessageCircle,
  Send,
  Share2,
  Sparkles,
  X,
} from 'lucide-react';
import { MovieItem } from '../types/cinema.ts';
import { CinemaPosterImage } from './CinemaPosterImage.tsx';

export function buildMovieShareUrl(movieId: string): string {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.origin);
  url.searchParams.set('movie', movieId);
  return url.toString();
}

export function buildMovieShareMessage(movie: MovieItem, shareUrl: string): string {
  const episodeTag = movie.episodeNumber
    ? ` (Season ${movie.seasonNumber || 1}, Episode ${movie.episodeNumber})`
    : '';
  return `🎬 Watch "${movie.title}"${episodeTag} [${movie.primaryCategory}] 100% FREE on TK STORYWORLD — The Luxury Home of Nigerian & International AI Love Movies!\n\n✨ ${movie.synopsis.slice(0, 130)}...\n\n👉 Watch Full Movie Free Here: ${shareUrl}`;
}

interface BrandedShareCardProps {
  movie: MovieItem;
  averageRating?: number;
  likesCount?: number;
  onClose?: () => void;
  compact?: boolean;
}

export const BrandedShareCard: React.FC<BrandedShareCardProps> = ({
  movie,
  averageRating = 4.9,
  likesCount = 120,
  onClose,
  compact = false,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedFullInvite, setCopiedFullInvite] = useState(false);

  const shareUrl = buildMovieShareUrl(movie.id);
  const shareMessage = buildMovieShareMessage(movie, shareUrl);

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
  const telegramHref = `https://t.me/share/url?url=${encodeURIComponent(
    shareUrl
  )}&text=${encodeURIComponent(
    `🎬 Watch "${movie.title}" (${movie.primaryCategory}) on TK STORYWORLD!`
  )}`;
  const twitterHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    `Watching "${movie.title}" (${movie.primaryCategory}) on TK STORYWORLD ❤️🎬`
  )}&url=${encodeURIComponent(shareUrl)}`;
  const facebookHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
    shareUrl
  )}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2600);
    } catch {
      // fallback copy
    }
  };

  const handleCopyFullInvite = async () => {
    try {
      await navigator.clipboard.writeText(shareMessage);
      setCopiedFullInvite(true);
      window.setTimeout(() => setCopiedFullInvite(false), 2600);
    } catch {
      // fallback copy
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${movie.title} | TK STORYWORLD`,
          text: `Watch "${movie.title}" (${movie.primaryCategory}) on TK STORYWORLD!`,
          url: shareUrl,
        });
      } catch {
        // user cancelled
      }
    } else {
      void handleCopyLink();
    }
  };

  return (
    <div className="rounded-2xl bg-gradient-to-b from-[#131722] to-[#0B0D14] border border-[#E11D48]/35 p-4 sm:p-6 shadow-2xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#E11D48]/20 border border-[#E11D48]/40 text-[#E11D48] flex items-center justify-center shrink-0">
            <Share2 className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="brand-luxury-red text-[11px] font-black uppercase">
                TK STORYWORLD
              </span>
              <span className="text-[11px] text-[#F59E0B] font-semibold">
                · VIP Movie Invitation Card
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Invite friends on WhatsApp or social media with a direct link to this story
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Close Share Panel"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Visual Branded Share Ticket Preview */}
      <div className="relative rounded-xl overflow-hidden bg-[#080A0F] border border-white/15 p-3.5 sm:p-4 flex flex-col sm:flex-row gap-4 items-center">
        <div className="relative w-full sm:w-44 aspect-video rounded-lg overflow-hidden shrink-0 bg-black border border-white/10">
          <CinemaPosterImage
            src={movie.thumbnailUrl}
            fallbackVideoId={movie.youtubeVideoId}
            alt={movie.title}
            category={movie.primaryCategory}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
          <div className="absolute top-2 left-2.5">
            <span className="brand-luxury-red text-[9px] font-black uppercase">
              TK STORYWORLD
            </span>
          </div>
          <div className="absolute bottom-1.5 right-2 text-[10px] font-mono text-white bg-black/70 px-1.5 py-0.5 rounded">
            {movie.durationFormatted}
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-1.5 text-left w-full">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="px-2 py-0.5 rounded bg-[#E11D48]/20 text-rose-300 border border-[#E11D48]/30 font-semibold">
              {movie.primaryCategory}
            </span>
            <span className="font-mono text-[#F59E0B] tabular-nums">
              ★ {averageRating}
            </span>
            <span className="font-mono text-rose-400 tabular-nums inline-flex items-center gap-1">
              <Heart className="w-3 h-3 fill-current" />
              {likesCount.toLocaleString()}
            </span>
          </div>

          <h4 className="font-display text-base sm:text-lg font-bold text-white line-clamp-1">
            {movie.title}
          </h4>

          <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
            {movie.synopsis}
          </p>

          <div className="pt-1 flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono truncate">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{shareUrl}</span>
          </div>
        </div>
      </div>

      {/* Primary Action Row: Share to WhatsApp & Copy Direct Link */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-xs sm:text-sm shadow-lg transition-all cursor-pointer"
        >
          <MessageCircle className="w-4 h-4 fill-current" />
          <span>Share to WhatsApp</span>
          <ExternalLink className="w-3.5 h-3.5 opacity-80" />
        </a>

        <button
          type="button"
          onClick={handleCopyLink}
          className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-xs sm:text-sm border transition-all cursor-pointer ${
            copiedLink
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
              : 'bg-[#E11D48] hover:bg-[#BE123C] border-[#E11D48] text-white shadow-lg'
          }`}
        >
          {copiedLink ? (
            <>
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Direct Movie Link Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Copy Direct Movie Link</span>
            </>
          )}
        </button>
      </div>

      {/* Secondary Viral Channels & Full Invite Copy */}
      {!compact && (
        <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-white/10">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={telegramHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0E131F] hover:bg-white/10 border border-white/10 text-xs text-slate-200 transition-colors"
            >
              <Send className="w-3.5 h-3.5 text-sky-400" />
              <span>Telegram</span>
            </a>

            <a
              href={facebookHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0E131F] hover:bg-white/10 border border-white/10 text-xs text-slate-200 transition-colors"
            >
              <span>Facebook</span>
            </a>

            <a
              href={twitterHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0E131F] hover:bg-white/10 border border-white/10 text-xs text-slate-200 transition-colors"
            >
              <span>X / Twitter</span>
            </a>

            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0E131F] hover:bg-white/10 border border-white/10 text-xs text-slate-200 transition-colors cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span>More Apps</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleCopyFullInvite}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-xs text-[#F59E0B] font-medium transition-colors cursor-pointer"
          >
            {copiedFullInvite ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">
                  Full Invite Message Copied!
                </span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Story Caption + Link</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

interface ShareMovieModalProps {
  movie: MovieItem;
  averageRating?: number;
  likesCount?: number;
  onClose: () => void;
}

export const ShareMovieModal: React.FC<ShareMovieModalProps> = ({
  movie,
  averageRating,
  likesCount,
  onClose,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Share ${movie.title}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <BrandedShareCard
          movie={movie}
          averageRating={averageRating}
          likesCount={likesCount}
          onClose={onClose}
        />
      </div>
    </div>
  );
};
