import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IdeaService } from '../../services/idea.service';
import { IdeaStatus } from '../../models/idea.model';

@Component({
  selector: 'app-idea-toolbar',
  imports: [FormsModule],
  template: `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-6 pb-2">
      
      <!-- Left: Search Box (as in Mockup Image 1) -->
      <div class="relative flex-1 max-w-md">
        <input
          type="text"
          placeholder="Search ideas..."
          [ngModel]="ideaService.searchQuery()"
          (ngModelChange)="ideaService.searchQuery.set($event)"
          class="w-full bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800 rounded-xl px-4 py-2.5 pl-10 text-xs sm:text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]/20 focus:border-[#1B4D3E] dark:focus:border-emerald-500 shadow-2xs transition-all"
        />
        <svg class="w-4 h-4 text-stone-400 absolute left-3.5 top-3.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      <!-- Right: Dropdown Filters (All statuses ↕ and Most votes ↕) -->
      <div class="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
        
        <!-- Status Filter Dropdown -->
        <div class="relative">
          <select
            [ngModel]="ideaService.statusFilter()"
            (ngModelChange)="ideaService.statusFilter.set($event)"
            class="appearance-none bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800 rounded-xl px-3.5 py-2.5 pr-8 text-xs sm:text-sm text-stone-700 dark:text-stone-300 hover:border-stone-300 dark:hover:border-stone-700 focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]/20 focus:border-[#1B4D3E] shadow-2xs cursor-pointer transition-all"
          >
            <option value="all">All statuses</option>
            <option value="under-review">Under Review ({{ ideaService.underReviewCount() }})</option>
            <option value="planned">Planned ({{ ideaService.plannedCount() }})</option>
            <option value="in-progress">In Progress ({{ ideaService.inProgressCount() }})</option>
            <option value="completed">Completed ({{ ideaService.completedCount() }})</option>
            <option value="declined">Declined ({{ ideaService.declinedCount() }})</option>
          </select>
          <div class="pointer-events-none absolute right-2.5 top-3.5 text-stone-400">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
            </svg>
          </div>
        </div>

        <!-- Sort Option Dropdown -->
        <div class="relative">
          <select
            [ngModel]="ideaService.sortOption()"
            (ngModelChange)="ideaService.sortOption.set($event)"
            class="appearance-none bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800 rounded-xl px-3.5 py-2.5 pr-8 text-xs sm:text-sm text-stone-700 dark:text-stone-300 hover:border-stone-300 dark:hover:border-stone-700 focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]/20 focus:border-[#1B4D3E] shadow-2xs cursor-pointer transition-all"
          >
            <option value="upvotes-desc">Most votes</option>
            <option value="date-desc">Newest first</option>
            <option value="comments-desc">Most discussed</option>
          </select>
          <div class="pointer-events-none absolute right-2.5 top-3.5 text-stone-400">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
            </svg>
          </div>
        </div>

        <!-- Team Member Extra: Show Merged Duplicates Toggle -->
        @if (ideaService.isTeamMember()) {
          <button
            type="button"
            (click)="ideaService.showMerged.update(v => !v)"
            class="text-xs px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800 transition-colors"
            [class.bg-purple-50]="ideaService.showMerged()"
            [class.border-purple-300]="ideaService.showMerged()"
            [class.text-purple-700]="ideaService.showMerged()"
            [class.dark:bg-purple-950/40]="ideaService.showMerged()"
            [class.dark:text-purple-300]="ideaService.showMerged()"
            [class.text-stone-500]="!ideaService.showMerged()"
            title="Toggle visibility of merged duplicate ideas"
          >
            {{ ideaService.showMerged() ? 'Hide Merged' : 'Show Merged' }} ({{ ideaService.mergedCount() }})
          </button>
        }

      </div>

    </div>
  `,
})
export class IdeaToolbarComponent {
  readonly ideaService = inject(IdeaService);
}
