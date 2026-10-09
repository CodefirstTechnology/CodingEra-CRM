import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { UserStatusSignalRService } from '../../core/services/user-status-signalr.service';

@Component({
  selector: 'app-follow-up-alert-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './follow-up-alert-modal.component.html',
  styleUrl: './follow-up-alert-modal.component.scss'
})
export class FollowUpAlertModalComponent {
  private readonly signalR = inject(UserStatusSignalRService);
  private readonly http = inject(HttpClient);

  protected readonly event = computed(() => this.signalR.activeFollowUpPopup());

  protected readonly showRescheduleForm = signal(false);
  protected readonly showNotesForm = signal(false);
  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected newDueDate = '';
  protected rescheduleReason = '';
  protected completionNotes = '';

  constructor() {
    effect(() => {
      const active = this.event();
      if (active) {
        this.playAudioAlert();
      }
    });
  }

  private playAudioAlert(): void {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 tone
      osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.3);

      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch {
      // Audio playback blocked by browser policy until user interaction
    }
  }

  protected openNotesForm(): void {
    this.completionNotes = '';
    this.formError.set(null);
    this.showNotesForm.set(true);
    this.showRescheduleForm.set(false);
  }

  protected cancelNotes(): void {
    this.showNotesForm.set(false);
    this.formError.set(null);
  }

  protected openRescheduleForm(): void {
    const defaultDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    this.newDueDate = defaultDate.toISOString().slice(0, 16);
    this.rescheduleReason = '';
    this.formError.set(null);
    this.showRescheduleForm.set(true);
    this.showNotesForm.set(false);
  }

  protected cancelReschedule(): void {
    this.showRescheduleForm.set(false);
    this.formError.set(null);
  }

  protected submitCompletion(isCall: boolean): void {
    const ev = this.event();
    if (!ev) return;

    this.submitting.set(true);
    this.formError.set(null);

    const apiBase = (environment.apiUrl || '/api').replace(/\/$/, '');
    const url = `${apiBase}/followup/tasks/${ev.taskId}/complete-followup`;

    const body = {
      taskId: ev.taskId,
      notes: isCall ? 'Outbound call completed via alert modal' : this.completionNotes.trim(),
      callDurationSeconds: 60,
      isCallLogged: isCall
    };

    this.http.post(url, body).subscribe({
      next: () => {
        this.submitting.set(false);
        this.signalR.dismissLocalPopup();
        this.showNotesForm.set(false);
      },
      error: (err) => {
        this.submitting.set(false);
        this.formError.set(err?.error || 'Failed to complete task. Please try again.');
      }
    });
  }

  protected submitReschedule(): void {
    const ev = this.event();
    if (!ev) return;

    if (!this.newDueDate) {
      this.formError.set('Please select a new due date & time.');
      return;
    }

    if (!this.rescheduleReason.trim()) {
      this.formError.set('A valid reschedule reason is mandatory.');
      return;
    }

    this.submitting.set(true);
    this.formError.set(null);

    const apiBase = (environment.apiUrl || '/api').replace(/\/$/, '');
    const url = `${apiBase}/followup/tasks/${ev.taskId}/reschedule-followup`;

    const body = {
      taskId: ev.taskId,
      newDueDate: new Date(this.newDueDate).toISOString(),
      rescheduleReason: this.rescheduleReason.trim()
    };

    this.http.post(url, body).subscribe({
      next: () => {
        this.submitting.set(false);
        this.signalR.dismissLocalPopup();
        this.showRescheduleForm.set(false);
      },
      error: (err) => {
        this.submitting.set(false);
        this.formError.set(err?.error || 'Failed to reschedule task. Please try again.');
      }
    });
  }
}
