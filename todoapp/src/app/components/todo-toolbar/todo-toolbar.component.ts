import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TodoService } from '../../services/todo.service';
import { SortOption, FilterOption } from '../../models/todo.model';

@Component({
  selector: 'app-todo-toolbar',
  imports: [FormsModule],
  template: `
    <div class="flex items-center justify-between px-1 pt-4 pb-1">
      
      <!-- Section Label (ACTIVE) -->
      <div class="flex items-center gap-2">
        <span class="text-[11px] font-bold tracking-widest text-stone-300 dark:text-stone-600 uppercase">
          {{ todoService.filterOption() === 'completed' ? 'COMPLETED' : 'ACTIVE' }}
        </span>
        @if (todoService.totalCount() > 0) {
          <span class="text-[11px] text-stone-400 dark:text-stone-600 font-medium">
            @if (todoService.filterOption() === 'completed') {
              {{ todoService.completedCount() }}
            } @else if (todoService.filterOption() === 'active') {
              {{ todoService.activeCount() }}
            } @else {
              {{ todoService.totalCount() }}
            }
          </span>
        }
      </div>

      <!-- Controls appear when tasks exist -->
      @if (todoService.totalCount() > 0) {
        <div class="flex items-center gap-3">
          
          <!-- Filter Text Pills -->
          <div class="flex items-center gap-1 text-xs">
            @for (opt of filterOptions; track opt.value) {
              <button
                type="button"
                (click)="todoService.filterOption.set(opt.value)"
                class="px-2 py-0.5 rounded-md font-medium transition-colors"
                [class.text-stone-900]="todoService.filterOption() === opt.value"
                [class.dark:text-stone-100]="todoService.filterOption() === opt.value"
                [class.bg-stone-200/60]="todoService.filterOption() === opt.value"
                [class.dark:bg-stone-800]="todoService.filterOption() === opt.value"
                [class.text-stone-400]="todoService.filterOption() !== opt.value"
                [class.dark:text-stone-500]="todoService.filterOption() !== opt.value"
                [class.hover:text-stone-600]="todoService.filterOption() !== opt.value"
              >
                {{ opt.label }}
              </button>
            }
          </div>

          <!-- Minimal Sort Dropdown -->
          <div class="relative">
            <select
              [ngModel]="todoService.sortOption()"
              (ngModelChange)="todoService.sortOption.set($event)"
              class="bg-transparent text-xs text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 focus:outline-none cursor-pointer pr-1"
            >
              @for (opt of sortOptions; track opt.value) {
                <option [value]="opt.value" class="bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200">
                  {{ opt.label }}
                </option>
              }
            </select>
          </div>

        </div>
      }

    </div>
  `,
})
export class TodoToolbarComponent {
  readonly todoService = inject(TodoService);

  readonly sortOptions: { value: SortOption; label: string }[] = [
    { value: 'date-desc', label: '↕ Newest' },
    { value: 'date-asc', label: '↕ Oldest' },
    { value: 'name-asc', label: '↕ A → Z' },
    { value: 'name-desc', label: '↕ Z → A' },
    { value: 'completed-last', label: '↕ Active first' },
    { value: 'completed-first', label: '↕ Done first' },
  ];

  readonly filterOptions: { value: FilterOption; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Done' },
  ];
}
