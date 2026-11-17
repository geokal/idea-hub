import { Component, signal, inject, computed, effect, viewChild, ElementRef, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IdeaService } from '../../services/idea.service';
import { IdeaCategory, ProductIdea } from '../../models/idea.model';
import { validateIdeaSubmission, countCharacters } from '../../utils/validation';

@Component({
  selector: 'app-idea-submit',
  imports: [FormsModule],
  template: `
    <!-- Share your idea Modal Dialog (Directly matching Instructor Mockup Image 2) -->
    @if (ideaService.isSubmitModalOpen()) {
      <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs transition-opacity animate-fade-in"
        (click)="close()"
      >
        <div
          #submitDialog
          role="dialog"
          aria-modal="true"
          aria-labelledby="submit-modal-title"
          tabindex="-1"
          class="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[#FAF9F5] dark:bg-[#1A1A18] rounded-2xl p-6 sm:p-7 shadow-2xl border border-stone-200/90 dark:border-stone-800 transition-all text-stone-800 dark:text-stone-100 animate-scale-up outline-none"
          (click)="$event.stopPropagation()"
          (keydown)="onKeydown($event)"
        >
          
          <!-- Modal Header -->
          <div class="flex items-center justify-between pb-4">
            <h2 id="submit-modal-title" class="text-2xl font-serif font-bold text-stone-900 dark:text-stone-100 tracking-tight">
              Share your idea
            </h2>
            <button
              type="button"
              (click)="close()"
              class="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors"
              title="Close"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Server / Validation Error Alert (Preserving draft) -->
          @if (errorMessage()) {
            <div class="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-xs text-red-900 dark:text-red-200 flex items-start gap-2">
              <span class="text-sm">⚠️</span>
              <div class="flex-1">
                <p class="font-semibold">{{ errorMessage() }}</p>
                <p class="text-[11px] text-red-700 dark:text-red-300 mt-0.5">Your draft is preserved. Please adjust the input and submit again.</p>
              </div>
              <button
                type="button"
                (click)="errorMessage.set(null)"
                class="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 font-bold text-sm"
              >
                ✕
              </button>
            </div>
          }

          <!-- Real-Time Duplicate Detection Alert -->
          @if (potentialDuplicates().length > 0) {
            <div class="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-900 dark:text-amber-200">
              <div class="flex items-center gap-1.5 font-semibold mb-1">
                <span>💡</span>
                <span>Similar feedback already exists:</span>
              </div>
              <div class="space-y-1 mt-1">
                @for (dup of potentialDuplicates().slice(0, 2); track dup.id) {
                  <div class="flex items-center justify-between gap-2">
                    <span class="truncate">"{{ dup.title }}" ({{ dup.upvotes }} votes)</span>
                    <button
                      type="button"
                      (click)="upvoteDuplicate(dup.id)"
                      class="text-[11px] font-semibold text-[#1B4D3E] dark:text-emerald-400 hover:underline flex-shrink-0"
                    >
                      Upvote this instead →
                    </button>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Form Fields -->
          <form (submit)="submit($event)" class="space-y-4">
            
            <!-- TITLE -->
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="block text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Title
                </label>
                <span class="text-[10px] text-stone-400 dark:text-stone-500">
                  {{ titleLength() }}/120
                </span>
              </div>
              <input
                type="text"
                placeholder="e.g. Dark mode support"
                maxlength="120"
                [ngModel]="title()"
                (ngModelChange)="onTitleChange($event)"
                name="title"
                required
                class="w-full bg-[#F3F2EC] dark:bg-stone-850 border border-stone-200 dark:border-stone-750 rounded-xl px-3.5 py-2.5 text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]/20 focus:border-[#1B4D3E] dark:focus:border-emerald-500 transition-all"
              />
            </div>

            <!-- DESCRIPTION -->
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="block text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Description
                </label>
                <span class="text-[10px] text-stone-400 dark:text-stone-500">
                  {{ descLength() }}/2000
                </span>
              </div>
              <textarea
                placeholder="Describe your idea and the problem it solves..."
                maxlength="2000"
                [ngModel]="description()"
                (ngModelChange)="onDescChange($event)"
                name="description"
                rows="4"
                required
                class="w-full bg-[#F3F2EC] dark:bg-stone-850 border border-stone-200 dark:border-stone-750 rounded-xl px-3.5 py-2.5 text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]/20 focus:border-[#1B4D3E] dark:focus:border-emerald-500 transition-all resize-none"
              ></textarea>
            </div>

            <!-- YOUR EMAIL -->
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
                Your Email
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                [ngModel]="authorEmail()"
                (ngModelChange)="onEmailChange($event)"
                name="authorEmail"
                required
                class="w-full bg-[#F3F2EC] dark:bg-stone-850 border border-stone-200 dark:border-stone-750 rounded-xl px-3.5 py-2.5 text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]/20 focus:border-[#1B4D3E] dark:focus:border-emerald-500 transition-all"
              />
              <p class="text-[11px] text-stone-500 dark:text-stone-400 mt-1.5 leading-relaxed">
                We'll send you a confirmation link and notify you of updates. Your email is never shown publicly.
              </p>
            </div>

            <!-- YOUR NAME — optional -->
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
                Your Name <span class="font-normal text-stone-400 dark:text-stone-500">— optional</span>
              </label>
              <input
                type="text"
                placeholder="Jane Smith"
                [ngModel]="authorName()"
                (ngModelChange)="authorName.set($event)"
                name="authorName"
                class="w-full bg-[#F3F2EC] dark:bg-stone-850 border border-stone-200 dark:border-stone-750 rounded-xl px-3.5 py-2.5 text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]/20 focus:border-[#1B4D3E] dark:focus:border-emerald-500 transition-all"
              />
            </div>

            <!-- Category (optional subtle tag selector) -->
            <div class="pt-1">
              <label class="block text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
                Category
              </label>
              <div class="flex flex-wrap gap-1.5">
                @for (cat of categories; track cat) {
                  <button
                    type="button"
                    (click)="selectedCategory.set(cat)"
                    class="px-2.5 py-1 rounded-lg text-xs font-medium border transition-all"
                    [class.bg-[#1B4D3E]]="selectedCategory() === cat"
                    [class.text-white]="selectedCategory() === cat"
                    [class.border-[#1B4D3E]]="selectedCategory() === cat"
                    [class.bg-white]="selectedCategory() !== cat"
                    [class.dark:bg-stone-800]="selectedCategory() !== cat"
                    [class.text-stone-600]="selectedCategory() !== cat"
                    [class.dark:text-stone-300]="selectedCategory() !== cat"
                    [class.border-stone-200]="selectedCategory() !== cat"
                    [class.dark:border-stone-750]="selectedCategory() !== cat"
                  >
                    {{ cat }}
                  </button>
                }
              </div>
            </div>

            <!-- Modal Action Buttons (Cancel / Submit idea in Forest Green) -->
            <div class="flex items-center justify-end gap-2.5 pt-4 border-t border-stone-200/80 dark:border-stone-800">
              <button
                type="button"
                (click)="close()"
                class="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-750 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                [disabled]="!canSubmit()"
                class="px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-[#1B4D3E] hover:bg-[#143d31] text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-all"
              >
                @if (isSubmitting()) {
                  <span>Submitting...</span>
                } @else {
                  <span>Submit idea</span>
                }
              </button>
            </div>

          </form>

        </div>
      </div>
    }
  `,
})
export class IdeaSubmitComponent {
  readonly ideaService = inject(IdeaService);
  readonly submitDialog = viewChild<ElementRef<HTMLElement>>('submitDialog');

  private previousFocusedElement: HTMLElement | null = null;

  readonly title = signal('');
  readonly description = signal('');
  readonly selectedCategory = signal<IdeaCategory>('Core Feature');
  readonly authorName = signal('');
  readonly authorEmail = signal('');
  readonly potentialDuplicates = signal<ProductIdea[]>([]);
  readonly errorMessage = signal<string | null>(null);
  readonly isSubmitting = signal<boolean>(false);

  readonly titleLength = computed(() => countCharacters(this.title()));
  readonly descLength = computed(() => countCharacters(this.description()));

  readonly categories: IdeaCategory[] = [
    'Core Feature',
    'UI / UX',
    'Performance',
    'Integrations',
    'Mobile',
  ];

  readonly canSubmit = computed(() => {
    if (this.isSubmitting()) return false;
    const res = validateIdeaSubmission(
      this.title(),
      this.description(),
      this.authorEmail()
    );
    return res.valid;
  });

  constructor() {
    effect(() => {
      const isOpen = this.ideaService.isSubmitModalOpen();
      if (isOpen) {
        if (typeof document !== 'undefined') {
          this.previousFocusedElement = document.activeElement as HTMLElement | null;
        }
        setTimeout(() => {
          const dialogEl = this.submitDialog()?.nativeElement;
          if (dialogEl) {
            const firstInput = dialogEl.querySelector<HTMLElement>('input, textarea, button');
            if (firstInput) {
              firstInput.focus();
            } else {
              dialogEl.focus();
            }
          }
        }, 0);
      } else {
        if (this.previousFocusedElement) {
          this.previousFocusedElement.focus();
          this.previousFocusedElement = null;
        }
      }
    });
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
      const dialogEl = this.submitDialog()?.nativeElement;
      if (!dialogEl) return;
      const focusableEls = dialogEl.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusableEls.length === 0) return;
      const first = focusableEls[0];
      const last = focusableEls[focusableEls.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.ideaService.isSubmitModalOpen()) {
      this.close();
    }
  }

  close(): void {
    this.errorMessage.set(null);
    this.isSubmitting.set(false);
    this.ideaService.isSubmitModalOpen.set(false);
  }

  onTitleChange(newTitle: string): void {
    this.title.set(newTitle);
    this.errorMessage.set(null);
    if (newTitle.trim().length >= 3) {
      const dups = this.ideaService.detectDuplicates(newTitle);
      this.potentialDuplicates.set(dups);
    } else {
      this.potentialDuplicates.set([]);
    }
  }

  onDescChange(newDesc: string): void {
    this.description.set(newDesc);
    this.errorMessage.set(null);
  }

  onEmailChange(newEmail: string): void {
    this.authorEmail.set(newEmail);
    this.errorMessage.set(null);
  }

  upvoteDuplicate(dupId: string): void {
    const dup = this.ideaService.ideas().find(i => i.id === dupId);
    if (dup && !dup.upvotedByUser) {
      this.ideaService.toggleUpvote(dupId);
    }
    this.close();
  }

  submit(event?: Event): void {
    if (event) event.preventDefault();
    this.errorMessage.set(null);

    const validation = validateIdeaSubmission(
      this.title(),
      this.description(),
      this.authorEmail()
    );
    if (!validation.valid) {
      this.errorMessage.set(validation.error || 'Please correct the form fields.');
      return;
    }

    this.isSubmitting.set(true);

    this.ideaService.submitIdea(
      {
        title: this.title().trim(),
        description: this.description().trim(),
        category: this.selectedCategory(),
        authorName: this.authorName().trim() || 'Anonymous Customer',
        authorEmail: this.authorEmail().trim(),
      },
      {
        onSuccess: () => {
          this.isSubmitting.set(false);
          this.title.set('');
          this.description.set('');
          this.authorName.set('');
          this.authorEmail.set('');
          this.potentialDuplicates.set([]);
          this.close();
        },
        onError: (err) => {
          this.isSubmitting.set(false);
          const serverMsg = err?.error?.error || err?.message || 'Submission rejected by server. Please check your inputs.';
          this.errorMessage.set(serverMsg);
        }
      }
    );
  }
}
