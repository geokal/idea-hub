import { Component, signal, inject, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IdeaService } from '../../services/idea.service';
import { IdeaCategory, ProductIdea } from '../../models/idea.model';

@Component({
  selector: 'app-idea-submit',
  imports: [FormsModule],
  template: `
    <div class="bg-white dark:bg-stone-900 rounded-2xl p-3.5 sm:p-4 shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-stone-200/90 dark:border-stone-800 transition-all focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:border-blue-500 dark:focus-within:ring-blue-950">
      
      <!-- Top Title Input Bar -->
      <div class="flex items-center gap-2.5">
        
        <!-- Plus Circle Icon -->
        <div class="pl-1 text-stone-400 dark:text-stone-500 flex-shrink-0">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" stroke-width="1.8" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 8v8m-4-4h8" />
          </svg>
        </div>

        <!-- Input Field (Max 120 chars) -->
        <input
          type="text"
          placeholder="Submit feedback or request a feature..."
          maxlength="120"
          [ngModel]="title()"
          (ngModelChange)="onTitleChange($event)"
          (focus)="isExpanded.set(true)"
          (keydown.enter)="!isExpanded() ? isExpanded.set(true) : null"
          class="flex-1 bg-transparent text-sm text-stone-800 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none"
        />

        <!-- Expand / Collapse Toggle -->
        <button
          type="button"
          (click)="isExpanded.update(v => !v)"
          class="p-1.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 rounded-lg transition-colors text-xs"
          [title]="isExpanded() ? 'Collapse form' : 'Add details'"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" [attr.d]="isExpanded() ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'" />
          </svg>
        </button>

        <!-- Submit Button -->
        <button
          type="button"
          (click)="submit()"
          [disabled]="!canSubmit()"
          class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          Submit
        </button>
      </div>

      <!-- Real-Time Duplicate Detection Prompt (Section 1 of SPEC.MD) -->
      @if (potentialDuplicates().length > 0) {
        <div class="mt-2.5 p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-xs">
          <div class="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 font-semibold mb-1">
            <span>💡</span>
            <span>Similar existing feedback found:</span>
          </div>
          <div class="space-y-1">
            @for (dup of potentialDuplicates().slice(0, 2); track dup.id) {
              <div class="flex items-center justify-between gap-2 text-stone-700 dark:text-stone-300">
                <span class="truncate">"{{ dup.title }}" ({{ dup.upvotes }} votes)</span>
                <button
                  type="button"
                  (click)="upvoteDuplicate(dup.id)"
                  class="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
                >
                  Upvote this instead →
                </button>
              </div>
            }
          </div>
        </div>
      }

      <!-- Expandable Details Section -->
      @if (isExpanded()) {
        <div class="mt-3 pt-3 border-t border-stone-100 dark:border-stone-800 space-y-3">
          
          <!-- Description (Required, Max 2000 chars) -->
          <div>
            <textarea
              placeholder="Describe your feedback, feature request, or problem in detail..."
              maxlength="2000"
              [ngModel]="description()"
              (ngModelChange)="description.set($event)"
              rows="3"
              class="w-full bg-stone-50/70 dark:bg-stone-850 border border-stone-200/60 dark:border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-700 dark:text-stone-200 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:border-stone-300 dark:focus:border-stone-700 transition-all resize-none"
            ></textarea>
            <div class="flex justify-between text-[10px] text-stone-400 mt-0.5">
              <span>Plain text description</span>
              <span>{{ description().length }}/2000</span>
            </div>
          </div>

          <!-- Customer Identity Fields (Section 1: Name public, Email private) -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label class="block text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-1">
                Name or Display Name <span class="text-stone-500 font-normal">(shown publicly)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Sarah J."
                [ngModel]="authorName()"
                (ngModelChange)="authorName.set($event)"
                class="w-full bg-stone-50/70 dark:bg-stone-850 border border-stone-200/60 dark:border-stone-800 rounded-xl px-3 py-1.5 text-xs text-stone-700 dark:text-stone-200 placeholder-stone-400 focus:outline-none"
              />
            </div>
            
            <div>
              <label class="block text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-1">
                Email Address <span class="text-amber-600 dark:text-amber-400 font-normal">(private, not shown publicly)</span>
              </label>
              <input
                type="email"
                placeholder="your.email@company.com"
                [ngModel]="authorEmail()"
                (ngModelChange)="authorEmail.set($event)"
                class="w-full bg-stone-50/70 dark:bg-stone-850 border border-stone-200/60 dark:border-stone-800 rounded-xl px-3 py-1.5 text-xs text-stone-700 dark:text-stone-200 placeholder-stone-400 focus:outline-none"
              />
            </div>
          </div>

          <!-- Category Selector -->
          <div>
            <label class="block text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-1.5">
              Category
            </label>
            <div class="flex flex-wrap gap-1.5">
              @for (cat of categories; track cat) {
                <button
                  type="button"
                  (click)="selectedCategory.set(cat)"
                  class="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                  [class.bg-stone-900]="selectedCategory() === cat"
                  [class.text-white]="selectedCategory() === cat"
                  [class.dark:bg-stone-100]="selectedCategory() === cat"
                  [class.dark:text-stone-900]="selectedCategory() === cat"
                  [class.bg-stone-100]="selectedCategory() !== cat"
                  [class.dark:bg-stone-800]="selectedCategory() !== cat"
                  [class.text-stone-600]="selectedCategory() !== cat"
                  [class.dark:text-stone-400]="selectedCategory() !== cat"
                >
                  {{ cat }}
                </button>
              }
            </div>
          </div>

          <!-- Low Friction Notice -->
          <div class="text-[11px] text-stone-400 flex items-center justify-between pt-1">
            <span>✨ No password required — verified by email link</span>
            <span class="text-[10px] text-stone-400">Max 120 chars</span>
          </div>

        </div>
      }

    </div>
  `,
})
export class IdeaSubmitComponent {
  private readonly ideaService = inject(IdeaService);

  readonly isExpanded = signal(false);
  readonly title = signal('');
  readonly description = signal('');
  readonly selectedCategory = signal<IdeaCategory>('Core Feature');
  readonly authorName = signal('Sarah Customer');
  readonly authorEmail = signal('sarah.c@external.com');
  readonly potentialDuplicates = signal<ProductIdea[]>([]);

  readonly categories: IdeaCategory[] = [
    'Core Feature',
    'UI / UX',
    'Performance',
    'Integrations',
    'Mobile',
  ];

  onTitleChange(newTitle: string): void {
    this.title.set(newTitle);
    this.potentialDuplicates.set(this.ideaService.findDuplicates(newTitle));
  }

  canSubmit(): boolean {
    return this.title().trim().length > 0 && this.description().trim().length > 0;
  }

  upvoteDuplicate(ideaId: string): void {
    this.ideaService.toggleUpvote(ideaId);
    this.title.set('');
    this.description.set('');
    this.potentialDuplicates.set([]);
    this.isExpanded.set(false);
    this.ideaService.selectedIdeaId.set(ideaId);
  }

  submit(): void {
    const t = this.title().trim();
    if (!t) return;

    this.ideaService.submitIdea({
      title: t,
      description: this.description().trim() || 'No additional details provided.',
      category: this.selectedCategory(),
      authorName: this.authorName(),
      authorEmail: this.authorEmail(),
    });

    this.title.set('');
    this.description.set('');
    this.potentialDuplicates.set([]);
    this.isExpanded.set(false);
  }
}
