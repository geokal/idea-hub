import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../services/theme.service';
import { IdeaService } from '../../services/idea.service';
import { UserRole } from '../../models/idea.model';

@Component({
  selector: 'app-header',
  imports: [DatePipe, FormsModule],
  template: `
    <header class="pt-6 sm:pt-8 pb-4">
      <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        
        <!-- Brand & Sketch Title -->
        <div>
          <div class="flex items-center gap-2.5">
            <h1 class="text-3xl sm:text-4xl font-serif font-bold text-stone-900 dark:text-stone-100 tracking-tight">
              Feedback Dashboard
            </h1>
            <span
              class="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border"
              [class.bg-blue-50]="ideaService.currentRole() === 'customer'"
              [class.text-blue-600]="ideaService.currentRole() === 'customer'"
              [class.border-blue-200]="ideaService.currentRole() === 'customer'"
              [class.dark:bg-blue-950/40]="ideaService.currentRole() === 'customer'"
              [class.dark:text-blue-400]="ideaService.currentRole() === 'customer'"
              [class.dark:border-blue-900]="ideaService.currentRole() === 'customer'"
              
              [class.bg-amber-50]="ideaService.currentRole() === 'team'"
              [class.text-amber-700]="ideaService.currentRole() === 'team'"
              [class.border-amber-200]="ideaService.currentRole() === 'team'"
              [class.dark:bg-amber-950/40]="ideaService.currentRole() === 'team'"
              [class.dark:text-amber-400]="ideaService.currentRole() === 'team'"
              [class.dark:border-amber-900]="ideaService.currentRole() === 'team'"

              [class.bg-purple-50]="ideaService.currentRole() === 'admin'"
              [class.text-purple-700]="ideaService.currentRole() === 'admin'"
              [class.border-purple-200]="ideaService.currentRole() === 'admin'"
              [class.dark:bg-purple-950/40]="ideaService.currentRole() === 'admin'"
              [class.dark:text-purple-400]="ideaService.currentRole() === 'admin'"
              [class.dark:border-purple-900]="ideaService.currentRole() === 'admin'"
            >
              {{ roleLabel() }}
            </span>
          </div>
          <p class="text-xs font-medium text-stone-400 dark:text-stone-500 mt-1">
            {{ todayFormatted }} · Public feedback & roadmap board (Sarah's Dashboard Wireframe)
          </p>
        </div>

        <!-- Controls: Role Switcher, CSV Export, Notification Bell, Theme Toggle -->
        <div class="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          
          <!-- Role Switcher (Customer, Team, Admin) -->
          <div class="flex bg-stone-200/60 dark:bg-stone-850 p-1 rounded-xl border border-stone-200 dark:border-stone-800 text-xs font-medium">
            <button
              type="button"
              (click)="ideaService.setRole('customer')"
              class="px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5"
              [class.bg-white]="ideaService.currentRole() === 'customer'"
              [class.dark:bg-stone-700]="ideaService.currentRole() === 'customer'"
              [class.text-stone-900]="ideaService.currentRole() === 'customer'"
              [class.dark:text-white]="ideaService.currentRole() === 'customer'"
              [class.shadow-xs]="ideaService.currentRole() === 'customer'"
              [class.text-stone-500]="ideaService.currentRole() !== 'customer'"
              title="Customer: Submit ideas, upvote, browse board"
            >
              <span>👤</span>
              <span class="hidden sm:inline">Customer</span>
            </button>
            <button
              type="button"
              (click)="ideaService.setRole('team')"
              class="px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5"
              [class.bg-white]="ideaService.currentRole() === 'team'"
              [class.dark:bg-stone-700]="ideaService.currentRole() === 'team'"
              [class.text-stone-900]="ideaService.currentRole() === 'team'"
              [class.dark:text-white]="ideaService.currentRole() === 'team'"
              [class.shadow-xs]="ideaService.currentRole() === 'team'"
              [class.text-stone-500]="ideaService.currentRole() !== 'team'"
              title="Team Member: Internal notes, status transitions"
            >
              <span>🛡️</span>
              <span class="hidden sm:inline">Team</span>
            </button>
            <button
              type="button"
              (click)="ideaService.setRole('admin')"
              class="px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5"
              [class.bg-white]="ideaService.currentRole() === 'admin'"
              [class.dark:bg-stone-700]="ideaService.currentRole() === 'admin'"
              [class.text-stone-900]="ideaService.currentRole() === 'admin'"
              [class.dark:text-white]="ideaService.currentRole() === 'admin'"
              [class.shadow-xs]="ideaService.currentRole() === 'admin'"
              [class.text-stone-500]="ideaService.currentRole() !== 'admin'"
              title="Admin: Full control, deduplication/merge, delete"
            >
              <span>⚡</span>
              <span class="hidden sm:inline">Admin</span>
            </button>
          </div>

          <!-- Internal Dashboard: CSV Export Button (Section 8 of SPEC.MD) -->
          @if (ideaService.isTeamMember()) {
            <button
              type="button"
              (click)="ideaService.exportToCsv()"
              class="px-2.5 py-1.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white/70 dark:bg-stone-900/70 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs font-medium flex items-center gap-1 transition-all shadow-xs"
              title="Export all feedback to CSV"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span class="hidden sm:inline">Export CSV</span>
            </button>
          }

          <!-- Customer Notifications Bell & Email Template Drawer -->
          <button
            type="button"
            (click)="showNotifications.set(!showNotifications())"
            class="relative w-8 h-8 rounded-full border border-stone-200 dark:border-stone-800 bg-white/70 dark:bg-stone-900/70 hover:bg-white dark:hover:bg-stone-800 text-stone-500 dark:text-stone-400 flex items-center justify-center transition-all shadow-xs"
            aria-label="View Customer Notifications"
            title="Customer Progress Notifications (Email Templates)"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            @if (ideaService.unreadNotificationsCount() > 0) {
              <span class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center">
                {{ ideaService.unreadNotificationsCount() }}
              </span>
            }
          </button>

          <!-- Minimal Theme Toggle -->
          <button
            type="button"
            (click)="themeService.toggleTheme()"
            class="w-8 h-8 rounded-full border border-stone-200 dark:border-stone-800 bg-white/70 dark:bg-stone-900/70 hover:bg-white dark:hover:bg-stone-800 text-stone-500 dark:text-stone-400 flex items-center justify-center transition-all shadow-xs"
            [attr.aria-label]="themeService.isDark() ? 'Switch to Light Theme' : 'Switch to Dark Theme'"
          >
            @if (themeService.isDark()) {
              <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            } @else {
              <svg class="w-4 h-4 text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            }
          </button>

        </div>

      </div>

      <!-- Notifications & Email Template Drawer -->
      @if (showNotifications()) {
        <div class="mt-4 p-4 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xl max-w-lg ml-auto animate-fade-in">
          
          <div class="flex items-center justify-between pb-2 mb-2 border-b border-stone-100 dark:border-stone-800">
            <div>
              <h3 class="text-xs font-bold text-stone-800 dark:text-stone-200 uppercase tracking-wider">
                Customer Email Notifications
              </h3>
              <p class="text-[10px] text-stone-400">Rendered using Section 6 Notification Template</p>
            </div>
            <button
              type="button"
              (click)="ideaService.markAllNotificationsRead()"
              class="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
            >
              Mark all read
            </button>
          </div>

          <!-- Opt-in / Opt-out Controls Section -->
          <div class="mb-3 p-2.5 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200/60 dark:border-stone-750 text-xs space-y-1.5">
            <span class="text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
              Customer Notification Preferences (Opt-in / Opt-out)
            </span>
            <div class="flex items-center justify-between">
              <span class="text-stone-600 dark:text-stone-300">In-App Progress Alerts</span>
              <input
                type="checkbox"
                [checked]="ideaService.notificationPreferences().inAppAlerts"
                (change)="ideaService.togglePreference('inAppAlerts')"
                class="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
              />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-stone-600 dark:text-stone-300">Email Digest Notifications</span>
              <input
                type="checkbox"
                [checked]="ideaService.notificationPreferences().emailUpdates"
                (change)="ideaService.togglePreference('emailUpdates')"
                class="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
              />
            </div>
          </div>

          <!-- Notification Items Formatted as SPEC Email Template -->
          @if (ideaService.notifications().length === 0) {
            <p class="text-xs text-stone-400 text-center py-4">No notifications yet.</p>
          } @else {
            <div class="space-y-3 max-h-72 overflow-y-auto pr-1">
              @for (notif of ideaService.notifications(); track notif.id) {
                <div
                  class="p-3 rounded-xl border text-xs transition-all font-mono text-[11px]"
                  [class.bg-blue-50/40]="!notif.read"
                  [class.border-blue-200]="!notif.read"
                  [class.dark:bg-blue-950/20]="!notif.read"
                  [class.dark:border-blue-900/50]="!notif.read"
                  [class.bg-stone-50]="notif.read"
                  [class.border-stone-200/60]="notif.read"
                  [class.dark:bg-stone-850]="notif.read"
                  [class.dark:border-stone-800]="notif.read"
                >
                  <div class="text-[10px] text-stone-400 pb-1 mb-1 border-b border-stone-200/50 dark:border-stone-750 flex justify-between">
                    <span>To: {{ notif.recipientEmail }}</span>
                    <span>{{ notif.createdAt | date:'shortTime' }}</span>
                  </div>
                  <div class="font-bold text-stone-800 dark:text-stone-100 mb-1">
                    Subject: Update on your feedback: {{ notif.ideaTitle }}
                  </div>
                  <div class="text-stone-600 dark:text-stone-300 font-sans text-xs leading-relaxed space-y-1">
                    <p>Hi Sarah Customer,</p>
                    <p>{{ notif.message }}</p>
                    <div class="pt-1.5 flex items-center justify-between text-[11px] font-mono">
                      <button
                        type="button"
                        (click)="openIdea(notif.ideaId); notif.read || ideaService.markNotificationRead(notif.id)"
                        class="text-blue-600 dark:text-blue-400 underline font-sans"
                      >
                        View feedback on board →
                      </button>
                      <span class="text-stone-400 text-[10px]">One-click Unsubscribe</span>
                    </div>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }
    </header>
  `,
  styles: `
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in {
      animation: fadeIn 0.15s ease-out;
    }
  `
})
export class HeaderComponent {
  readonly themeService = inject(ThemeService);
  readonly ideaService = inject(IdeaService);

  readonly showNotifications = signal(false);
  readonly todayFormatted: string;

  constructor() {
    const now = new Date();
    const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
    const day = now.getDate();
    const month = now.toLocaleDateString('en-US', { month: 'long' });
    this.todayFormatted = `${weekday} ${day} ${month}`;
  }

  roleLabel(): string {
    const role = this.ideaService.currentRole();
    if (role === 'admin') return 'Admin';
    if (role === 'team') return 'Team Member';
    return 'Customer';
  }

  openIdea(ideaId: string): void {
    this.ideaService.selectedIdeaId.set(ideaId);
    this.showNotifications.set(false);
  }
}
