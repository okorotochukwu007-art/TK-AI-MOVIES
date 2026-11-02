import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  MoreVertical,
  Play,
  PlusSquare,
  Share,
  Smartphone,
  Sparkles,
  WifiOff,
  X,
} from 'lucide-react';

interface LuxurySplashScreenProps {
  onFinish: () => void;
}

export const LuxurySplashScreen: React.FC<LuxurySplashScreenProps> = ({
  onFinish,
}) => {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, 1500);
    const doneTimer = setTimeout(() => {
      onFinish();
    }, 1900);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#050505] transition-opacity duration-400 select-none ${
        fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Ambient Luxury Crimson & Gold Radial Spotlight */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, rgba(225, 29, 72, 0.28) 0%, rgba(136, 19, 55, 0.12) 38%, rgba(5, 5, 5, 1) 75%)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        {/* Custom Red Luxury App Icon Crest */}
        <div className="relative mb-6">
          <div className="absolute -inset-4 rounded-[34px] bg-gradient-to-tr from-[#E11D48]/50 via-[#F59E0B]/30 to-[#E11D48]/50 blur-xl animate-pulse" />
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-[28px] p-1 bg-gradient-to-br from-[#FB7185] via-[#E11D48] to-[#F59E0B] shadow-[0_18px_50px_rgba(225,29,72,0.55)]">
            <img
              src="/icon.svg"
              alt="TK STORYWORLD Luxury App Icon"
              className="w-full h-full rounded-[24px] object-cover bg-[#050505]"
            />
          </div>
        </div>

        {/* Luxury Red Wordmark */}
        <div className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.28em] text-[#F59E0B] mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Original AI Luxury Cinema</span>
        </div>

        <h1 className="brand-luxury-red text-3xl sm:text-5xl font-black uppercase tracking-wider mb-2">
          TK STORYWORLD
        </h1>

        <p className="text-xs sm:text-sm text-slate-300 max-w-xs leading-relaxed mb-8">
          Nigerian &amp; International AI Love Stories · Billionaire Romance ·
          Complete Drama Series
        </p>

        {/* Sleek Crimson & Gold Loading Progress Track */}
        <div className="w-48 h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#E11D48] via-[#F59E0B] to-[#E11D48] transition-all duration-1000"
            style={{ width: fadeOut ? '100%' : '82%' }}
          />
        </div>
      </div>
    </div>
  );
};

interface OfflineIndicatorProps {
  isOnline: boolean;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  isOnline,
}) => {
  if (isOnline) return null;

  return (
    <div className="bg-amber-950/90 border-b border-amber-500/40 px-4 py-2 text-amber-200 text-xs flex items-center justify-center gap-2">
      <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <span>
        You are currently offline — browsing cached TK STORYWORLD catalogue.
        Reconnect to stream video playback.
      </span>
    </div>
  );
};

interface PWAInstallBannerProps {
  isInstalled: boolean;
  isStandalone: boolean;
  isInstallable: boolean;
  isIOS: boolean;
  onPromptInstall: () => Promise<'accepted' | 'dismissed' | 'manual'>;
  onOpenGuideModal: () => void;
}

export const PWAInstallBanner: React.FC<PWAInstallBannerProps> = ({
  isInstalled,
  isStandalone,
  isInstallable,
  isIOS,
  onPromptInstall,
  onOpenGuideModal,
}) => {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return (
        sessionStorage.getItem('tk_storyworld_pwa_banner_dismissed') === '1'
      );
    } catch {
      return false;
    }
  });

  if (isInstalled || isStandalone || dismissed) {
    return null;
  }

  const handlePrimaryInstallClick = async () => {
    if (isInstallable) {
      const result = await onPromptInstall();
      if (result === 'manual') {
        onOpenGuideModal();
      }
    } else {
      onOpenGuideModal();
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem('tk_storyworld_pwa_banner_dismissed', '1');
    } catch {
      // ignore
    }
  };

  return (
    <div className="bg-gradient-to-r from-[#1A050B] via-[#0F121C] to-[#1A0D05] border-b border-[#E11D48]/35 px-4 sm:px-10 py-2.5">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/icon.svg"
            alt="TK STORYWORLD App Icon"
            className="w-9 h-9 rounded-xl border border-[#F59E0B]/50 shadow-md shrink-0"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white truncate">
                Install TK STORYWORLD Mobile App
              </span>
              <span className="hidden sm:inline-block text-[10px] font-mono uppercase tracking-wider text-[#F59E0B]">
                Android &amp; iPhone Home Screen
              </span>
            </div>
            <p className="text-[11px] text-slate-300 truncate">
              {isIOS
                ? 'Tap to add the red luxury TK STORYWORLD icon to your iPhone Home Screen'
                : 'Add TK STORYWORLD to your phone home screen for instant full-screen cinema'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handlePrimaryInstallClick()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-semibold shadow-md transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isInstallable ? 'Install Now' : 'Add to Home Screen'}</span>
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 text-slate-400 hover:text-white cursor-pointer"
            aria-label="Dismiss app install banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

interface PWAInstallModalProps {
  isOpen: boolean;
  isInstallable: boolean;
  isInstalled: boolean;
  isStandalone: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  onPromptInstall: () => Promise<'accepted' | 'dismissed' | 'manual'>;
  onPreviewSplash: () => void;
  onClose: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({
  isOpen,
  isInstallable,
  isInstalled,
  isStandalone,
  isIOS,
  onPromptInstall,
  onPreviewSplash,
  onClose,
}) => {
  const [selectedPlatform, setSelectedPlatform] = useState<'android' | 'ios'>(
    isIOS ? 'ios' : 'android'
  );
  const [installFeedback, setInstallFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDirectInstall = async () => {
    if (isInstallable) {
      const outcome = await onPromptInstall();
      if (outcome === 'accepted') {
        setInstallFeedback(
          'TK STORYWORLD is being added to your Home Screen!'
        );
      }
    } else {
      setInstallFeedback(
        selectedPlatform === 'ios'
          ? 'Follow the 3 quick Safari steps below to add TK STORYWORLD to your iPhone Home Screen.'
          : 'Use your browser menu (⋮) and tap "Install app" or "Add to Home screen" to place TK STORYWORLD on your phone.'
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl rounded-2xl bg-[#0B0E17] border border-white/15 shadow-[0_25px_70px_rgba(0,0,0,0.9)] overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Luxury Crimson Header */}
        <div
          className="relative px-6 py-5 border-b border-white/10"
          style={{
            background:
              'linear-gradient(135deg, rgba(225, 29, 72, 0.24) 0%, rgba(15, 19, 31, 0.96) 60%, rgba(245, 158, 11, 0.16) 100%)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/40 hover:bg-black/70 text-slate-300 hover:text-white transition-colors cursor-pointer"
            aria-label="Close install modal"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-4">
            <img
              src="/icon.svg"
              alt="TK STORYWORLD Luxury Red App Icon"
              className="w-16 h-16 rounded-2xl border-2 border-[#F59E0B]/60 shadow-[0_10px_30px_rgba(225,29,72,0.5)] shrink-0"
            />
            <div>
              <div className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-[#F59E0B] mb-1">
                <Smartphone className="w-3.5 h-3.5" />
                <span>Native Mobile App Experience</span>
              </div>
              <h2 className="brand-luxury-red text-xl sm:text-2xl font-black uppercase">
                TK STORYWORLD APP
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Install on your Android or iPhone Home Screen with our custom
                Red Luxury Icon &amp; Cinema Splash Screen
              </p>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Status or 1-Tap Native Install CTA */}
          {isInstalled || isStandalone ? (
            <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-500/40 flex items-center gap-3 text-emerald-200 text-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <p className="font-semibold text-white">
                  TK STORYWORLD is Installed on Your Device
                </p>
                <p className="text-emerald-300/90 mt-0.5">
                  You can launch TK STORYWORLD anytime directly from your home
                  screen in full-screen standalone cinema mode.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[#121624] border border-[#E11D48]/35 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#F59E0B]" />
                  <span>One-Tap Home Screen Installation</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Opens like a native app without browser bars, with instant
                  access to Nigerian &amp; International AI love movies.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleDirectInstall()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold shadow-lg shadow-[#E11D48]/30 transition-colors shrink-0 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>
                  {isInstallable
                    ? 'Install TK STORYWORLD Now'
                    : 'Add to Home Screen'}
                </span>
              </button>
            </div>
          )}

          {installFeedback && (
            <div className="px-4 py-2.5 rounded-xl bg-[#1B1018] border border-[#F59E0B]/40 text-xs text-amber-200">
              {installFeedback}
            </div>
          )}

          {/* Simulated Phone Home Screen Icon & Splash Preview Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="p-4 rounded-xl bg-[#0E111A] border border-white/10 flex items-center gap-3.5">
              <div className="flex flex-col items-center shrink-0">
                <img
                  src="/icon.svg"
                  alt="TK Story Home Screen Icon"
                  className="w-14 h-14 rounded-2xl shadow-lg border border-[#E11D48]/50"
                />
                <span className="text-[11px] font-medium text-white mt-1.5">
                  TK Story
                </span>
              </div>
              <div className="text-xs space-y-1">
                <div className="font-semibold text-white">
                  Luxury Red Home Icon
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Custom crimson &amp; gold TK crest designed for iPhone &amp;
                  Android home screens.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#0E111A] border border-white/10 flex flex-col justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-white flex items-center justify-between">
                  <span>Cinema Splash Screen</span>
                  <span className="text-[10px] font-mono text-[#F59E0B]">
                     Full-Screen Launch
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Greets viewers with the signature red TK STORYWORLD emblem on
                  every launch.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onPreviewSplash();
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-[#F59E0B] transition-colors cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Preview Luxury Splash Screen</span>
              </button>
            </div>
          </div>

          {/* Platform Switcher: Android vs iPhone / iPad */}
          <div>
            <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-4">
              <button
                type="button"
                onClick={() => setSelectedPlatform('android')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  selectedPlatform === 'android'
                    ? 'bg-[#E11D48] text-white'
                    : 'bg-[#121622] text-slate-400 hover:text-white'
                }`}
              >
                Android Phone (Chrome)
              </button>
              <button
                type="button"
                onClick={() => setSelectedPlatform('ios')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  selectedPlatform === 'ios'
                    ? 'bg-[#E11D48] text-white'
                    : 'bg-[#121622] text-slate-400 hover:text-white'
                }`}
              >
                iPhone &amp; iPad (Safari)
              </button>
            </div>

            {selectedPlatform === 'android' ? (
              <div className="space-y-2.5 text-xs">
                <div className="p-3 rounded-xl bg-[#101420] border border-white/5 flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#E11D48]/20 border border-[#E11D48]/50 text-[#FB7185] font-mono font-bold flex items-center justify-center shrink-0">
                    1
                  </span>
                  <div>
                    <div className="font-semibold text-white flex items-center gap-1.5">
                      <span>Tap &ldquo;Install App&rdquo; or Browser Menu</span>
                      <MoreVertical className="w-3.5 h-3.5 text-[#F59E0B]" />
                    </div>
                    <p className="text-slate-400 mt-0.5">
                      Tap the red <strong>Install Now</strong> button above, or
                      tap the 3-dot menu icon in the top-right corner of Chrome.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#101420] border border-white/5 flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#E11D48]/20 border border-[#E11D48]/50 text-[#FB7185] font-mono font-bold flex items-center justify-center shrink-0">
                    2
                  </span>
                  <div>
                    <div className="font-semibold text-white flex items-center gap-1.5">
                      <span>
                        Select &ldquo;Install app&rdquo; or &ldquo;Add to Home
                        screen&rdquo;
                      </span>
                      <Download className="w-3.5 h-3.5 text-[#F59E0B]" />
                    </div>
                    <p className="text-slate-400 mt-0.5">
                      Confirm by tapping <strong>Install</strong> in the popup
                      prompt.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#101420] border border-white/5 flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#E11D48]/20 border border-[#E11D48]/50 text-[#FB7185] font-mono font-bold flex items-center justify-center shrink-0">
                    3
                  </span>
                  <div>
                    <div className="font-semibold text-white">
                      Open TK STORYWORLD from Your Phone Home Screen
                    </div>
                    <p className="text-slate-400 mt-0.5">
                      Tap the red luxury <strong>TK Story</strong> icon on your
                      home screen to watch movies in full-screen cinema mode!
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5 text-xs">
                <div className="p-3 rounded-xl bg-[#101420] border border-white/5 flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#E11D48]/20 border border-[#E11D48]/50 text-[#FB7185] font-mono font-bold flex items-center justify-center shrink-0">
                    1
                  </span>
                  <div>
                    <div className="font-semibold text-white flex items-center gap-1.5">
                      <span>Tap the Share Button in Safari</span>
                      <Share className="w-3.5 h-3.5 text-[#F59E0B]" />
                    </div>
                    <p className="text-slate-400 mt-0.5">
                      Open TK STORYWORLD in <strong>Safari</strong> on your
                      iPhone or iPad and tap the <strong>Share</strong> icon
                      (square with arrow pointing up) at the bottom bar.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#101420] border border-white/5 flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#E11D48]/20 border border-[#E11D48]/50 text-[#FB7185] font-mono font-bold flex items-center justify-center shrink-0">
                    2
                  </span>
                  <div>
                    <div className="font-semibold text-white flex items-center gap-1.5">
                      <span>Tap &ldquo;Add to Home Screen&rdquo;</span>
                      <PlusSquare className="w-3.5 h-3.5 text-[#F59E0B]" />
                    </div>
                    <p className="text-slate-400 mt-0.5">
                      Scroll down the share sheet menu and tap{' '}
                      <strong>Add to Home Screen</strong>.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#101420] border border-white/5 flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#E11D48]/20 border border-[#E11D48]/50 text-[#FB7185] font-mono font-bold flex items-center justify-center shrink-0">
                    3
                  </span>
                  <div>
                    <div className="font-semibold text-white">
                      Tap &ldquo;Add&rdquo; in the Top Right Corner
                    </div>
                    <p className="text-slate-400 mt-0.5">
                      The custom red luxury <strong>TK Story</strong> icon will
                      appear right on your iPhone Home Screen like a native app!
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
