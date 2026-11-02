import React, { useMemo, useState } from 'react';
import {
  Bell,
  BellRing,
  Check,
  CheckCheck,
  Clock,
  Flame,
  Play,
  Share2,
  Sparkles,
  X,
} from 'lucide-react';
import { MovieItem } from '../types/cinema.ts';
import { CinemaPosterImage } from './CinemaPosterImage.tsx';

interface NotificationsPopoverProps {
  movies: MovieItem[];
  lastDiscoveryRunAt?: string | null;
  discoveryIntervalHours?: number;
  seenIds: string[];
  onMarkAllSeen: (ids: string[]) => void;
  onSelectMovie: (movie: MovieItem, autoPlay?: boolean) => void;
  onShareMovie: (movie: MovieItem) => void;
  onClose: () => void;
}

interface ComingSoonDrop {
  id: string;
  title: string;
  category: string;
  windowLabel: string;
  description: string;
}

const UPCOMING_DROPS: ComingSoonDrop[] = [
  {
    id: 'drop-lagos-billionaire',
    title: 'Lagos Billionaire & Lekki Dynasty Premieres',
    category: 'Nigerian AI Movies · Billionaire Romance',
    windowLabel: 'Dropping Next Cycle',
    description:
      'New full-length Nigerian AI love stories featuring undercover billionaires, pre-wedding secrets, and royal Lagos families.',
  },
  {
    id: 'drop-contract-marriage',
    title: 'Contract & Secret Marriage — New Episodes',
    category: 'Contract Marriage · Secret Marriage',
    windowLabel: 'Upcoming 24h Window',
    description:
      'Fresh multi-episode continuations of paper brides, mistaken wedding vows, and hidden CEO husbands.',
  },
  {
    id: 'drop-royal-folktale',
    title: 'Royal Folktale & Palace Maid Chronicles',
    category: 'Fantasy Romance · Maid & Prince Dramas',
    windowLabel: 'Scheduled Release',
    description:
      'Enchanted African kingdom folktales, palace intrigue, and forbidden affection between princes and humble heroines.',
  },
  {
    id: 'drop-revenge-rebirth',
    title: 'Betrayed & Reborn: CEO Revenge Specials',
    category: 'Revenge Romance · CEO Love Stories',
    windowLabel: 'Coming Soon',
    description:
      'High-drama second-chance love stories where betrayed wives return stronger to claim their destiny.',
  },
];

const REMINDERS_STORAGE_KEY = 'tk_storyworld_coming_soon_reminders_v1';

export function getNewReleaseMovies(movies: MovieItem[]): {
  movie: MovieItem;
  isWithin48h: boolean;
  badgeText: string;
}[] {
  const now = Date.now();
  const hours48Ms = 48 * 60 * 60 * 1000;

  const sorted = [...movies].sort((a, b) => {
    const timeA = Math.max(
      new Date(a.createdAt || 0).getTime(),
      new Date(a.publishedAt || 0).getTime()
    );
    const timeB = Math.max(
      new Date(b.createdAt || 0).getTime(),
      new Date(b.publishedAt || 0).getTime()
    );
    return timeB - timeA;
  });

  return sorted.slice(0, 10).map((movie, index) => {
    const createdMs = new Date(movie.createdAt || 0).getTime();
    const publishedMs = new Date(movie.publishedAt || 0).getTime();
    const newestTimestamp = Math.max(createdMs, publishedMs);
    const ageMs = Math.max(0, now - newestTimestamp);
    const isWithin48h = ageMs <= hours48Ms || index < 4;

    let badgeText = 'NEW PREMIERE';
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
    if (ageHours <= 6) {
      badgeText = 'JUST ADDED · LAST 6H';
    } else if (ageHours <= 48) {
      badgeText = `NEW · ${ageHours}H AGO`;
    } else if (index < 4) {
      badgeText = 'FRESH 48H SPOTLIGHT';
    }

    return {
      movie,
      isWithin48h,
      badgeText,
    };
  });
}

export const NotificationsPopover: React.FC<NotificationsPopoverProps> = ({
  movies,
  lastDiscoveryRunAt,
  discoveryIntervalHours = 6,
  seenIds,
  onMarkAllSeen,
  onSelectMovie,
  onShareMovie,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'new_releases' | 'coming_soon'>(
    'new_releases'
  );
  const [reminders, setReminders] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(REMINDERS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : ['drop-lagos-billionaire'];
    } catch {
      return ['drop-lagos-billionaire'];
    }
  });

  const newReleaseItems = useMemo(() => getNewReleaseMovies(movies), [movies]);
  const seenSet = useMemo(() => new Set(seenIds), [seenIds]);

  const unreadCount = useMemo(
    () => newReleaseItems.filter((item) => !seenSet.has(item.movie.id)).length,
    [newReleaseItems, seenSet]
  );

  const toggleReminder = (dropId: string) => {
    setReminders((prev) => {
      const next = prev.includes(dropId)
        ? prev.filter((id) => id !== dropId)
        : [...prev, dropId];
      try {
        localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage quota
      }
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-black/60 backdrop-blur-xs pt-16 sm:pt-20 px-3 sm:px-8"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-[#0B0E17] border border-white/15 shadow-2xl overflow-hidden flex flex-col max-h-[82vh]"
      >
        {/* Top Header */}
        <div className="p-4 sm:p-5 bg-[#07090F] border-b border-white/10 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#E11D48]/20 border border-[#E11D48]/40 text-[#E11D48] flex items-center justify-center shrink-0">
                <BellRing className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="brand-luxury-red text-[11px] font-black uppercase">
                    TK STORYWORLD
                  </span>
                  <span className="text-[11px] text-[#F59E0B] font-semibold">
                    · Release Radar
                  </span>
                </div>
                <h3 className="font-display text-sm sm:text-base font-bold text-white">
                  New Releases & Coming Soon
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onMarkAllSeen(newReleaseItems.map((i) => i.movie.id))
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title="Mark all notifications as read"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Mark Read</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Close notifications"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#111522] border border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab('new_releases')}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'new_releases'
                  ? 'bg-[#E11D48] text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>New in 48h ({newReleaseItems.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('coming_soon')}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'coming_soon'
                  ? 'bg-[#F59E0B] text-black shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Coming Soon ({UPCOMING_DROPS.length})</span>
            </button>
          </div>
        </div>

        {/* Scrollable Notification Feed */}
        <div className="overflow-y-auto flex-1 p-3.5 sm:p-4 space-y-3">
          {activeTab === 'new_releases' ? (
            <>
              <div className="px-3 py-2 rounded-xl bg-[#121624] border border-white/10 flex items-center justify-between text-[11px] text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#F59E0B]" />
                  <span>
                    Auto-updated every {discoveryIntervalHours} hours with new AI love stories
                  </span>
                </span>
                <span className="text-emerald-400 font-mono font-semibold">
                  LIVE
                </span>
              </div>

              {newReleaseItems.map(({ movie, badgeText }) => {
                const isUnread = !seenSet.has(movie.id);
                return (
                  <div
                    key={movie.id}
                    className={`group rounded-xl p-3 border transition-all flex gap-3.5 items-start ${
                      isUnread
                        ? 'bg-[#131826] border-[#E11D48]/40 hover:border-[#E11D48]'
                        : 'bg-[#0E121C] border-white/10 hover:border-white/25'
                    }`}
                  >
                    <div
                      onClick={() => {
                        onMarkAllSeen([movie.id]);
                        onClose();
                        onSelectMovie(movie, true);
                      }}
                      className="relative w-28 aspect-video rounded-lg overflow-hidden bg-black shrink-0 cursor-pointer border border-white/10"
                    >
                      <CinemaPosterImage
                        src={movie.thumbnailUrl}
                        fallbackVideoId={movie.youtubeVideoId}
                        alt={movie.title}
                        category={movie.primaryCategory}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                        <div className="w-7 h-7 rounded-full bg-[#E11D48] text-white flex items-center justify-center shadow">
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        </div>
                      </div>
                      <div className="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 rounded text-[9px] font-mono text-white">
                        {movie.durationFormatted}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#F59E0B]">
                          {badgeText}
                        </span>
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-[#E11D48] shrink-0" />
                        )}
                      </div>

                      <h4
                        onClick={() => {
                          onMarkAllSeen([movie.id]);
                          onClose();
                          onSelectMovie(movie, true);
                        }}
                        className="font-display text-xs sm:text-sm font-bold text-white group-hover:text-[#F59E0B] transition-colors line-clamp-1 cursor-pointer"
                      >
                        {movie.title}
                      </h4>

                      <div className="text-[11px] text-slate-400 truncate">
                        {movie.primaryCategory} · {movie.channelTitle}
                      </div>

                      <div className="pt-1 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onMarkAllSeen([movie.id]);
                            onClose();
                            onSelectMovie(movie, true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-[11px] font-semibold cursor-pointer"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Watch</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onShareMovie(movie);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-slate-200 text-[11px] font-medium cursor-pointer"
                        >
                          <Share2 className="w-3 h-3 text-[#F59E0B]" />
                          <span>Share</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl bg-gradient-to-r from-[#E11D48]/15 via-[#131826] to-[#F59E0B]/15 border border-white/15 p-3.5 space-y-1">
                <div className="text-[11px] font-semibold text-[#F59E0B] uppercase tracking-wider">
                  TK STORYWORLD Automated Premiere Pipeline
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Our discovery engine scans Nigerian and international AI cinema studios every{' '}
                  <strong>{discoveryIntervalHours} hours</strong> for new full-length love movies.
                </p>
                {lastDiscoveryRunAt && (
                  <div className="text-[11px] font-mono text-slate-400 pt-1">
                    Last Catalogue Sync:{' '}
                    {new Date(lastDiscoveryRunAt).toLocaleString()}
                  </div>
                )}
              </div>

              {UPCOMING_DROPS.map((drop) => {
                const isSubscribed = reminders.includes(drop.id);
                return (
                  <div
                    key={drop.id}
                    className="rounded-xl bg-[#0E121C] border border-white/10 p-3.5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-emerald-400">
                        {drop.windowLabel}
                      </span>
                      <span className="text-[11px] text-[#F59E0B] font-medium">
                        {drop.category}
                      </span>
                    </div>

                    <h4 className="font-display text-sm font-bold text-white">
                      {drop.title}
                    </h4>

                    <p className="text-xs text-slate-400 leading-relaxed">
                      {drop.description}
                    </p>

                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => toggleReminder(drop.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          isSubscribed
                            ? 'bg-emerald-950/70 border border-emerald-500/40 text-emerald-300'
                            : 'bg-white/10 hover:bg-white/15 text-white'
                        }`}
                      >
                        {isSubscribed ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Reminder Active</span>
                          </>
                        ) : (
                          <>
                            <Bell className="w-3.5 h-3.5 text-[#F59E0B]" />
                            <span>Notify Me When Live</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
