import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IdeaService } from '../../services/idea.service';
import { IdeaStatus } from '../../models/idea.model';

@Component({
  selector: 'app-idea-toolbar',
  imports: [FormsModule],
  template: `
    <div class="space-y-3 pt-3">
      
      <!-- Top Row: Section Title & Status Filters -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        
        <!-- Status Tabs -->
        <div class="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none text-xs">
          @for (tab of statusTabs; track tab.value) {
            <button
              type="button"
              (click)="ideaService.statusFilter.set(tab.value)"
              class="px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-all flex items-center gap-1.5"
              [class.bg-stone-900]="ideaService.statusFilter() === tab.value"
              [class.text-white]="ideaService.statusFilter() === tab.value"
              [class.dark:bg-stone-100]="ideaService.statusFilter() === tab.value"
              [class.dark:text-stone-900]="ideaService.statusFilter() === tab.value"
              [class.text-stone-500]="ideaService.statusFilter() !== tab.value"
              [class.dark:text-stone-400]="ideaService.statusFilter() !== tab.value"
              [class.hover:text-stone-800]="ideaService.statusFilter() !== tab.value"
            >
              <span>{{ tab.label }}</span>
              <span class="text-[10px] opacity-75">({{ getCount(tab.value) }})</span>
            </button>
          }
        </div>

        <!-- Sort Select & Board Cleanliness Toggle -->
        <div class="flex items-center gap-2 self-end sm:self-auto">
          @if (ideaService.isTeamMember() && ideaService.statusFilter() === 'all') {
            <button
              type="button"
              (click)="ideaService.showMerged.update(v => !v)"
              class="text-[11px] px-2 py-0.5 rounded-md border text-stone-500 dark:text-stone-400 hover:text-stone-800 transition-colors"
              [class.bg-purple-50]="ideaService.showMerged()"
              [class.border-purple-300]="ideaService.showMerged()"
              [class.text-purple-700]="ideaService.showMerged()"
              [class.dark:bg-purple-950/40]="ideaService.showMerged()"
              [class.dark:border-purple-800]="ideaService.showMerged()"
              [class.dark:text-purple-400]="ideaService.showMerged()"
              title="Toggle display of merged duplicates to keep board clean"
            >
              {{ ideaService.showMerged() ? 'Hide Merged' : 'Show Merged' }} ({{ ideaService.mergedCount() }})
            </button>
          }

          <select
            [ngModel]="ideaService.sortOption()"
            (ngModelChange)="ideaService.sortOption.set($event)"
            class="bg-transparent text-xs text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 focus:outline-none cursor-pointer"
          >
            <option value="upvotes-desc" class="bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200">↑ Most Upvoted</option>
            <option value="date-desc" class="bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200">↕ Newest First</option>
            <option value="comments-desc" class="bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200">💬 Most Discussed</option>
          </select>
        </div>

      </div>

      <!-- Second Row: Search & Category Filter -->
      <div class="flex items-center gap-2">
        
        <!-- Search Input -->
        <div class="relative flex-1">
          <input
            type="text"
            placeholder="Search ideas, keywords, authors..."
            [ngModel]="ideaService.searchQuery()"
            (ngModelChange)="ideaService.searchQuery.set($event)"
            class="w-full bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 rounded-xl px-3 py-1.5 pl-8 text-xs text-stone-800 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:border-stone-400"
          />
          <svg class="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <!-- Category Dropdown Filter -->
        <select
          [ngModel]="ideaService.categoryFilter()"
          (ngModelChange)="ideaService.categoryFilter.set($event)"
          class="bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 rounded-xl px-2.5 py-1.5 text-xs text-stone-600 dark:text-stone-300 focus:outline-none cursor-pointer"
        >
          <option value="all">All Categories</option>
          <option value="Core Feature">Core Feature</option>
          <option value="UI / UX">UI / UX</option>
          <option value="Performance">Performance</option>
          <option value="Integrations">Integrations</option>
          <option value="Mobile">Mobile</option>
        </select>

      </div>

    </div>
  `,
})
export class IdeaToolbarComponent {
  readonly ideaService = inject(IdeaService);

  readonly statusTabs: { value: IdeaStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'All Active' },
    { value: 'under-review', label: 'Under Review' },
    { value: 'planned', label: 'Planned' },
    { value: 'in-progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'declined', label: 'Declined' },
    { value: 'merged', label: 'Merged' },
  ];

  getCount(status: IdeaStatus | 'all'): number {
    if (status === 'all') return this.ideaService.totalCount();
    if (status === 'under-review') return this.ideaService.underReviewCount();
    if (status === 'planned') return this.ideaService.plannedCount();
    if (status === 'in-progress') return this.ideaService.inProgressCount();
    if (status === 'completed') return this.ideaService.completedCount();
    if (status === 'merged') return this.ideaService.mergedCount();
    return this.ideaService.ideas().filter(i => i.status === 'declined').length;
  }
}
