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
    <header class="py-4 border-b border-stone-200/60 dark:border-stone-800">
      <div class="max-w-4xl mx-auto px-4 flex items-center justify-between gap-4">
        
        <!-- Brand: productideas (from Instructor Mockup Image 1) -->
        <div class="flex items-center gap-3">
          <a href="#" class="text-xl sm:text-2xl font-serif tracking-tight text-stone-900 dark:text-stone-100 flex items-center">
            <span>product</span><span class="italic text-[#1B4D3E] dark:text-emerald-400 font-semibold">ideas</span>
          </a>

          <!-- Active Role Indicator Badge -->
          <span
            class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border hidden sm:inline-block"
            [class.bg-blue-50]="ideaService.currentRole() === 'customer'"
            [class.text-blue-700]="ideaService.currentRole() === 'customer'"
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

        <!-- Right Controls: Role Switcher, Notifications, Theme Toggle, + Submit an idea -->
        <div class="flex items-center gap-2.5">
          
          <!-- Role Switcher (Customer / Team / Admin) -->
          <div class="flex bg-stone-200/60 dark:bg-stone-850 p-1 rounded-xl border border-stone-200 dark:border-stone-800 text-xs font-medium">
            <button
              type="button"
              (click)="ideaService.setRole('customer')"
              class="px-2.5 py-1 rounded-lg transition-all flex items-center gap-1"
              [class.bg-white]="ideaService.currentRole() === 'customer'"
              [class.dark:bg-stone-700]="ideaService.currentRole() === 'customer'"
              [class.text-stone-900]="ideaService.currentRole() === 'customer'"
              [class.dark:text-white]="ideaService.currentRole() === 'customer'"
              [class.shadow-xs]="ideaService.currentRole() === 'customer'"
              [class.text-stone-500]="ideaService.currentRole() !== 'customer'"
              title="Customer: Public view"
            >
              <span>Customer</span>
            </button>
            <button
              type="button"
              (click)="ideaService.setRole('team')"
              class="px-2.5 py-1 rounded-lg transition-all flex items-center gap-1"
              [class.bg-white]="ideaService.currentRole() === 'team'"
              [class.dark:bg-stone-700]="ideaService.currentRole() === 'team'"
              [class.text-stone-900]="ideaService.currentRole() === 'team'"
              [class.dark:text-white]="ideaService.currentRole() === 'team'"
              [class.shadow-xs]="ideaService.currentRole() === 'team'"
              [class.text-stone-500]="ideaService.currentRole() !== 'team'"
              title="Team: Triage & internal notes"
            >
              <span>Team</span>
            </button>
            <button
              type="button"
              (click)="ideaService.setRole('admin')"
              class="px-2.5 py-1 rounded-lg transition-all flex items-center gap-1"
              [class.bg-white]="ideaService.currentRole() === 'admin'"
              [class.dark:bg-stone-700]="ideaService.currentRole() === 'admin'"
              [class.text-stone-900]="ideaService.currentRole() === 'admin'"
              [class.dark:text-white]="ideaService.currentRole() === 'admin'"
              [class.shadow-xs]="ideaService.currentRole() === 'admin'"
              [class.text-stone-500]="ideaService.currentRole() !== 'admin'"
              title="Admin: Full settings"
            >
              <span>Admin</span>
            </button>
          </div>

          <!-- Notification Bell -->
          <div class="relative">
            <button
              type="button"
              (click)="showNotifs.update(v => !v)"
              class="relative p-2 rounded-xl text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 hover:bg-stone-200/50 dark:hover:bg-stone-800 transition-colors"
              title="Customer status notifications"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              @if (ideaService.unreadNotificationsCount() > 0) {
                <span class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-500"></span>
              }
            </button>

            <!-- Notifications Dropdown -->
            @if (showNotifs()) {
              <div
                class="absolute right-0 mt-2 w-80 bg-white dark:bg-stone-900 rounded-2xl shadow-xl border border-stone-200 dark:border-stone-800 p-3 z-50 text-xs animate-scale-up"
              >
                <div class="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800 mb-2">
                  <span class="font-semibold text-stone-800 dark:text-stone-200">Customer Notifications</span>
                  <button
                    type="button"
                    (click)="ideaService.markAllNotificationsRead()"
                    class="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Mark all read
                  </button>
                </div>

                <div class="space-y-2 max-h-64 overflow-y-auto">
                  @for (n of ideaService.notifications(); track n.id) {
                    <div
                      class="p-2 rounded-xl transition-colors"
                      [class.bg-blue-50/60]="!n.read"
                      [class.dark:bg-blue-950/30]="!n.read"
                      [class.bg-stone-50]="n.read"
                      [class.dark:bg-stone-850]="n.read"
                    >
                      <div class="flex items-center justify-between gap-1 mb-1">
                        <span class="font-medium text-stone-900 dark:text-stone-100 truncate">{{ n.ideaTitle }}</span>
                        <span class="text-[10px] text-stone-400">{{ n.createdAt | date:'shortTime' }}</span>
                      </div>
                      <p class="text-[11px] text-stone-600 dark:text-stone-400">{{ n.message }}</p>
                    </div>
                  } @empty {
                    <p class="text-center py-4 text-stone-400">No notifications yet.</p>
                  }
                </div>
              </div>
            }
          </div>

          <!-- Theme Toggle -->
          <button
            type="button"
            (click)="themeService.toggleTheme()"
            class="p-2 rounded-xl text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 hover:bg-stone-200/50 dark:hover:bg-stone-800 transition-colors"
            title="Toggle Dark / Light Theme"
          >
            @if (themeService.isDark()) {
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="5" stroke-width="2" />
                <path stroke-linecap="round" stroke-width="2" d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            } @else {
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            }
          </button>

          <!-- Top-Right "+ Submit an idea" button (from Instructor Mockup Image 1) -->
          <button
            type="button"
            (click)="ideaService.isSubmitModalOpen.set(true)"
            class="px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold bg-[#1B4D3E] hover:bg-[#143d31] text-white shadow-sm flex items-center gap-1.5 transition-all"
          >
            <span>+</span>
            <span>Submit an idea</span>
          </button>

        </div>

      </div>
    </header>
  `,
})
export class HeaderComponent {
  readonly themeService = inject(ThemeService);
  readonly ideaService = inject(IdeaService);

  readonly showNotifs = signal(false);

  roleLabel(): string {
    switch (this.ideaService.currentRole()) {
      case 'team': return 'Team Member';
      case 'admin': return 'Admin';
      default: return 'Customer';
    }
  }
}
