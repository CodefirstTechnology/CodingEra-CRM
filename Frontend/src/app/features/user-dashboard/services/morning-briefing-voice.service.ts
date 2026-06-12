import { inject, Injectable, signal } from '@angular/core';
import { take } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { isAdmin } from '../../../core/auth/auth-role.util';
import { DashboardHttpService } from '../../../core/services/dashboard/dashboard-http.service';
import type { DailyBriefingMetrics } from '../../../core/services/dashboard/dashboard-api.models';
import { MorningBriefingStorageService } from './morning-briefing-storage.service';
import { normalizeBriefingForSpeech, pickBriefingVoice } from '../utils/briefing-speech.util';
import { buildDailyBriefingFromMetrics } from '../utils/morning-briefing-fallback.util';

export type MorningBriefingVoiceState = 'idle' | 'loading' | 'speaking' | 'text-only' | 'error';

@Injectable({ providedIn: 'root' })
export class MorningBriefingVoiceService {
  private readonly auth = inject(AuthService);
  private readonly dashboardHttp = inject(DashboardHttpService);
  private readonly storage = inject(MorningBriefingStorageService);

  private utterance: SpeechSynthesisUtterance | null = null;
  private speaking = false;
  private autoPlayInProgress = false;
  private dailyMetrics: DailyBriefingMetrics | null = null;

  readonly message = signal<string | null>(null);
  readonly state = signal<MorningBriefingVoiceState>('idle');
  readonly enabled = signal(true);
  readonly statusHint = signal<string | null>(null);
  readonly source = signal<string | null>(null);

  /** Sets today-only metrics from the admin dashboard (required before generating). */
  setDailyMetrics(metrics: DailyBriefingMetrics | null): void {
    this.dailyMetrics = metrics;
  }

  /** Loads preferences once; safe to call multiple times. */
  loadPreferences(): void {
    if (!isAdmin(this.auth.user())) return;

    this.dashboardHttp
      .getPreferences()
      .pipe(take(1))
      .subscribe({
        next: (pref) => this.enabled.set(pref.morningBriefingEnabled),
        error: () => {
          /* keep default enabled */
        },
      });
  }

  setEnabled(enabled: boolean): void {
    if (!isAdmin(this.auth.user())) return;

    this.enabled.set(enabled);
    this.dashboardHttp
      .updatePreferences(enabled)
      .pipe(take(1))
      .subscribe({ error: () => this.enabled.set(!enabled) });
  }

  /**
   * Attempt automatic once-per-day playback after the admin dashboard loads.
   * Requires setDailyMetrics() to have been called with today's dashboard data.
   */
  tryAutoPlayAfterDashboardLoad(): void {
    if (!isAdmin(this.auth.user())) return;
    if (this.autoPlayInProgress || !this.enabled()) return;
    if (!this.dailyMetrics) return;

    this.autoPlayInProgress = true;

    this.dashboardHttp
      .getPreferences()
      .pipe(take(1))
      .subscribe({
        next: (pref) => {
          this.enabled.set(pref.morningBriefingEnabled);
          if (!pref.morningBriefingEnabled) {
            this.autoPlayInProgress = false;
            return;
          }

          const alreadyPlayedToday =
            this.storage.wasAutoPlayedToday()
            || this.storage.isSameCalendarDay(pref.lastBriefingPlayedDate);

          if (alreadyPlayedToday) {
            this.loadDisplayOnly();
            return;
          }

          this.fetchAndPlay(true);
        },
        error: () => {
          this.autoPlayInProgress = false;
        },
      });
  }

  /** Manual play with voice — works any number of times. */
  playNow(regenerate = false): void {
    if (!isAdmin(this.auth.user())) return;

    if (!this.dailyMetrics) {
      this.statusHint.set('Open the admin dashboard first to load today\'s data.');
      return;
    }

    this.stop();
    this.statusHint.set(null);
    this.fetchAndPlay(false, regenerate);
  }

  /** Alias for playNow(). */
  replay(regenerate = false): void {
    this.playNow(regenerate);
  }

  /**
   * Clears daily play locks (browser + server) so auto-play can run again.
   * Optionally plays immediately after reset.
   */
  resetForTesting(playAfterReset = true): void {
    if (!isAdmin(this.auth.user())) return;

    this.storage.clearTodayCache();
    this.statusHint.set('Resetting daily play lock…');

    this.dashboardHttp
      .resetBriefingDaily()
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.statusHint.set('Daily play lock cleared. You can test auto-play again.');
          if (playAfterReset) {
            this.playNow(true);
          }
        },
        error: () => {
          this.statusHint.set('Could not reset on server. Try Play summary instead.');
          if (playAfterReset) {
            this.playNow(true);
          }
        },
      });
  }

  stop(): void {
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel();
    }
    this.speaking = false;
    if (this.state() === 'speaking') {
      this.state.set(this.message() ? 'text-only' : 'idle');
    }
  }

  private loadDisplayOnly(): void {
    this.state.set('loading');
    this.statusHint.set('Loading today\'s summary…');

    this.dashboardHttp
      .getCachedMorningBriefing()
      .pipe(take(1))
      .subscribe({
        next: (response) => {
          this.message.set(response.message);
          this.source.set(response.source);
          this.state.set('text-only');
          this.statusHint.set(
            this.briefingSourceHint(response.source, true)
              ?? 'Already played today. Click Play summary to hear again.',
          );
          this.autoPlayInProgress = false;
        },
        error: () => {
          this.tryLocalFallback();
          this.autoPlayInProgress = false;
        },
      });
  }

  private fetchAndPlay(isAuto: boolean, regenerate = false): void {
    if (!this.dailyMetrics) {
      this.autoPlayInProgress = false;
      return;
    }

    this.state.set('loading');
    this.statusHint.set(regenerate ? 'Regenerating summary…' : 'Generating summary…');

    this.dashboardHttp
      .postMorningBriefing(this.dailyMetrics, regenerate)
      .pipe(take(1))
      .subscribe({
        next: (response) => {
          this.message.set(response.message);
          this.source.set(response.source);
          const spoke = this.speak(response.message);
          this.state.set(spoke ? 'speaking' : 'text-only');
          const sourceHint = this.briefingSourceHint(response.source, response.cached);
          this.statusHint.set(
            sourceHint ?? (spoke ? null : 'Voice unavailable — summary shown as text.'),
          );

          if (isAuto && spoke) {
            this.storage.markAutoPlayedToday();
            this.dashboardHttp.markBriefingPlayed().pipe(take(1)).subscribe();
          }

          this.autoPlayInProgress = false;
        },
        error: () => {
          this.tryLocalFallback();
          this.autoPlayInProgress = false;
        },
      });
  }

  private briefingSourceHint(source: string, cached: boolean): string | null {
    if (cached) return 'Cached summary from earlier today.';
    if (source === 'ai') return 'Generated by Gemini AI.';
    if (source === 'fallback') {
      return 'Template summary — Gemini unavailable (check API key or rate limit).';
    }
    return null;
  }

  private tryLocalFallback(): void {
    if (this.dailyMetrics) {
      this.playFallbackMessage(buildDailyBriefingFromMetrics(this.dailyMetrics), true);
      return;
    }

    this.state.set('error');
    this.statusHint.set('Could not load summary. Open the admin dashboard and try again.');
  }

  private playFallbackMessage(message: string, fromApiError = false): void {
    if (!message.trim()) {
      this.state.set('error');
      this.statusHint.set('No summary data available.');
      return;
    }

    this.message.set(message);
    const spoke = this.speak(message);
    this.state.set(spoke ? 'speaking' : 'text-only');
    if (fromApiError) {
      this.statusHint.set('Using offline summary — restart backend to enable live API.');
    } else if (!spoke) {
      this.statusHint.set('Voice unavailable — summary shown as text.');
    }
  }

  private speak(text: string): boolean {
    if (!text.trim() || typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
      return false;
    }

    speechSynthesis.cancel();

    const spokenText = normalizeBriefingForSpeech(text);
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = 'en-US';
    utterance.rate = 0.92;
    utterance.pitch = 0.98;
    utterance.volume = 1;

    const applyVoice = (voices: SpeechSynthesisVoice[]): void => {
      const voice = pickBriefingVoice(voices);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
    };

    utterance.onend = () => {
      this.speaking = false;
      if (this.state() === 'speaking') {
        this.state.set('text-only');
      }
    };

    utterance.onerror = () => {
      this.speaking = false;
      this.state.set('text-only');
      this.statusHint.set('Voice playback failed — summary shown as text.');
    };

    this.utterance = utterance;
    this.speaking = true;

    const start = (voices: SpeechSynthesisVoice[]): void => {
      applyVoice(voices);
      speechSynthesis.speak(utterance);
    };

    const voices = speechSynthesis.getVoices();
    if (voices.length === 0) {
      speechSynthesis.onvoiceschanged = () => {
        speechSynthesis.onvoiceschanged = null;
        start(speechSynthesis.getVoices());
      };
      speechSynthesis.getVoices();
    } else {
      start(voices);
    }

    return true;
  }
}
