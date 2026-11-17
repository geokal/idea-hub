import { Component, inject, signal } from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../services/theme.service';
import { IdeaService } from '../../services/idea.service';
import { UserRole } from '../../models/idea.model';

@Component({
  selector: 'app-header',
  imports: [DatePipe, TitleCasePipe, FormsModule],
  template: `
    <!-- Auth Error Alert Banner -->
    @if (ideaService.authError()) {
      <div class="bg-red-50 dark:bg-red-950/60 border-b border-red-200 dark:border-red-900/60 px-4 py-2 text-xs text-red-800 dark:text-red-200 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span>🔒</span>
          <span>{{ ideaService.authError() }}</span>
        </div>
        <div class="flex items-center gap-3">
          <button
            type="button"
            (click)="openKeyModal()"
            class="font-semibold text-red-900 dark:text-red-100 underline hover:no-underline cursor-pointer"
          >
            Enter Key
          </button>
          <button
            type="button"
            (click)="ideaService.authError.set(null)"
            class="text-red-500 hover:text-red-800 dark:hover:text-red-200 font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      </div>
    }

    <header class="py-4 border-b border-stone-200/60 dark:border-stone-800">
      <div class="max-w-4xl mx-auto px-4 flex items-center justify-between gap-4">
        
        <!-- Brand: productideas (from Instructor Mockup Image 1) -->
        <div class="flex items-center gap-3">
          <a href="#" class="text-xl sm:text-2xl font-serif tracking-tight text-stone-900 dark:text-stone-100 flex items-center">
            <span>product</span><span class="italic text-[#1B4D3E] dark:text-emerald-400 font-semibold">ideas</span>
          </a>

          <!-- Active Role Indicator Badge -->
          <span
            class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border hidden sm:inline-block cursor-pointer"
            (click)="onRoleBadgeClick()"
            [title]="ideaService.currentRole() !== 'customer' ? 'Click to change API Key' : ''"
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
            @if (ideaService.currentRole() !== 'customer' && ideaService.adminApiKey()) {
              <span class="ml-1 text-[9px] opacity-75">🔑</span>
            }
          </span>
        </div>

        <!-- Right Controls: Role Switcher, Notifications, Theme Toggle, + Submit an idea -->
        <div class="flex items-center gap-2.5">
          
          <!-- Role Switcher (Customer / Team / Admin) -->
          <div class="flex bg-stone-200/60 dark:bg-stone-850 p-1 rounded-xl border border-stone-200 dark:border-stone-800 text-xs font-medium">
            <button
              type="button"
              (click)="selectRole('customer')"
              class="px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
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
              (click)="selectRole('team')"
              class="px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
              [class.bg-white]="ideaService.currentRole() === 'team'"
              [class.dark:bg-stone-700]="ideaService.currentRole() === 'team'"
              [class.text-stone-900]="ideaService.currentRole() === 'team'"
              [class.dark:text-white]="ideaService.currentRole() === 'team'"
              [class.shadow-xs]="ideaService.currentRole() === 'team'"
              [class.text-stone-500]="ideaService.currentRole() !== 'team'"
              title="Team: Triage & internal notes (Requires key)"
            >
              <span>Team</span>
            </button>
            <button
              type="button"
              (click)="selectRole('admin')"
              class="px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
              [class.bg-white]="ideaService.currentRole() === 'admin'"
              [class.dark:bg-stone-700]="ideaService.currentRole() === 'admin'"
              [class.text-stone-900]="ideaService.currentRole() === 'admin'"
              [class.dark:text-white]="ideaService.currentRole() === 'admin'"
              [class.shadow-xs]="ideaService.currentRole() === 'admin'"
              [class.text-stone-500]="ideaService.currentRole() !== 'admin'"
              title="Admin: Full settings & export (Requires key)"
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

    <!-- Team / Admin API Key Authentication Modal -->
    @if (showKeyModal()) {
      <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs transition-opacity animate-fade-in"
        (click)="cancelKeyModal()"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="key-modal-title"
          class="relative w-full max-w-md bg-[#FAF9F5] dark:bg-[#1A1A18] rounded-2xl p-6 shadow-2xl border border-stone-200/90 dark:border-stone-800 text-stone-800 dark:text-stone-100 animate-scale-up"
          (click)="$event.stopPropagation()"
        >
          <div class="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-stone-800 mb-4">
            <h3 id="key-modal-title" class="text-lg font-serif font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <span>🔐</span>
              <span>Authentication Required</span>
            </h3>
            <button
              type="button"
              (click)="cancelKeyModal()"
              class="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 font-bold"
            >
              ✕
            </button>
          </div>

          <p class="text-xs text-stone-600 dark:text-stone-400 mb-4 leading-relaxed">
            Accessing the <strong>{{ pendingRole() | titlecase }}</strong> perspective requires a valid API key configured on the server (<code>ADMIN_API_KEY</code>).
          </p>

          @if (keyInputError()) {
            <div class="mb-3 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-800 dark:text-red-300">
              {{ keyInputError() }}
            </div>
          }

          <div class="mb-4">
            <label class="block text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
              Admin / Team API Key
            </label>
            <input
              type="password"
              placeholder="Enter key (configured in server environment)"
              [ngModel]="enteredKey()"
              (ngModelChange)="enteredKey.set($event)"
              (keydown.enter)="confirmKey()"
              class="w-full bg-[#F3F2EC] dark:bg-stone-850 border border-stone-200 dark:border-stone-750 rounded-xl px-3.5 py-2.5 text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]/20 focus:border-[#1B4D3E] transition-all"
            />
          </div>

          <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-200 dark:border-stone-800">
            <button
              type="button"
              (click)="cancelKeyModal()"
              class="px-4 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-750 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              (click)="confirmKey()"
              class="px-5 py-2 rounded-xl text-xs font-semibold bg-[#1B4D3E] hover:bg-[#143d31] text-white shadow-sm transition-all"
            >
              Authenticate & Switch
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class HeaderComponent {
  readonly themeService = inject(ThemeService);
  readonly ideaService = inject(IdeaService);

  readonly showNotifs = signal(false);
  readonly showKeyModal = signal(false);
  readonly pendingRole = signal<UserRole>('team');
  readonly enteredKey = signal('');
  readonly keyInputError = signal<string | null>(null);

  roleLabel(): string {
    switch (this.ideaService.currentRole()) {
      case 'team': return 'Team Member';
      case 'admin': return 'Admin';
      default: return 'Customer';
    }
  }

  selectRole(targetRole: UserRole): void {
    if (targetRole === 'customer') {
      this.ideaService.setRole('customer');
      return;
    }

    if (!this.ideaService.adminApiKey()) {
      this.pendingRole.set(targetRole);
      this.enteredKey.set('');
      this.keyInputError.set(null);
      this.showKeyModal.set(true);
      return;
    }

    this.ideaService.setRole(targetRole);
  }

  onRoleBadgeClick(): void {
    if (this.ideaService.currentRole() !== 'customer') {
      this.openKeyModal();
    }
  }

  openKeyModal(): void {
    const role = this.ideaService.currentRole();
    this.pendingRole.set(role === 'customer' ? 'team' : role);
    this.enteredKey.set(this.ideaService.adminApiKey());
    this.keyInputError.set(null);
    this.showKeyModal.set(true);
  }

  confirmKey(): void {
    const key = this.enteredKey().trim();
    if (!key) {
      this.keyInputError.set('API key cannot be empty.');
      return;
    }
    this.ideaService.setAdminApiKey(key);
    this.ideaService.setRole(this.pendingRole());
    this.showKeyModal.set(false);
  }

  cancelKeyModal(): void {
    this.showKeyModal.set(false);
    this.enteredKey.set('');
    this.keyInputError.set(null);
  }
}
