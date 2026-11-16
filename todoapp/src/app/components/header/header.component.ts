import { Component, inject } from '@angular/core';
import { ThemeService } from '../../services/theme.service';
import { TodoService } from '../../services/todo.service';

@Component({
  selector: 'app-header',
  template: `
    <header class="pt-10 pb-6">
      <div class="flex items-start justify-between">
        
        <!-- Title & Dynamic Date -->
        <div>
          <h1 class="text-4xl font-serif font-bold text-stone-900 dark:text-stone-100 tracking-tight">
            My Tasks
          </h1>
          <p class="text-xs font-medium text-stone-400 dark:text-stone-500 mt-1">
            {{ todayFormatted }}
          </p>
        </div>

        <!-- Controls: Minimal Theme Toggle & Clear Done -->
        <div class="flex items-center gap-2 pt-1">
          @if (todoService.completedCount() > 0) {
            <button
              type="button"
              (click)="todoService.clearCompleted()"
              class="text-xs text-stone-400 hover:text-rose-500 dark:text-stone-500 dark:hover:text-rose-400 transition-colors px-2 py-1"
            >
              Clear completed ({{ todoService.completedCount() }})
            </button>
          }

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
    </header>
  `,
})
export class HeaderComponent {
  readonly themeService = inject(ThemeService);
  readonly todoService = inject(TodoService);

  readonly todayFormatted: string;

  constructor() {
    const now = new Date();
    const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
    const day = now.getDate();
    const month = now.toLocaleDateString('en-US', { month: 'long' });
    this.todayFormatted = `${weekday} ${day} ${month}`;
  }
}
