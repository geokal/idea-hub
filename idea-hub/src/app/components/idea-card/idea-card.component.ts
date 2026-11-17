import { Component, input, inject } from '@angular/core';
import { ProductIdea } from '../../models/idea.model';
import { IdeaService } from '../../services/idea.service';

@Component({
  selector: 'app-idea-card',
  template: `
    <article
      (click)="ideaService.selectedIdeaId.set(idea().id)"
      class="group bg-white dark:bg-stone-900 rounded-2xl p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-stone-200/80 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 hover:shadow-md transition-all cursor-pointer relative"
      [class.opacity-75]="idea().status === 'merged'"
    >
      <div class="flex items-center gap-4">
        
        <!-- Left: Upvote Box (Chevron ^ on top, vote count below as in Mockup Image 1) -->
        <button
          type="button"
          (click)="$event.stopPropagation(); ideaService.toggleUpvote(idea().id)"
          class="flex flex-col items-center justify-center w-12 h-14 sm:w-13 sm:h-14 rounded-xl border transition-all flex-shrink-0 select-none"
          [class.bg-[#1B4D3E]/10]="idea().upvotedByUser"
          [class.border-[#1B4D3E]]="idea().upvotedByUser"
          [class.text-[#1B4D3E]]="idea().upvotedByUser"
          [class.dark:bg-emerald-950/40]="idea().upvotedByUser"
          [class.dark:border-emerald-600]="idea().upvotedByUser"
          [class.dark:text-emerald-400]="idea().upvotedByUser"
          [class.bg-[#F7F6F2]]="!idea().upvotedByUser"
          [class.border-stone-200/90]="!idea().upvotedByUser"
          [class.text-stone-700]="!idea().upvotedByUser"
          [class.dark:bg-stone-850]="!idea().upvotedByUser"
          [class.dark:border-stone-750]="!idea().upvotedByUser"
          [class.dark:text-stone-300]="!idea().upvotedByUser"
          [class.hover:border-stone-400]="!idea().upvotedByUser"
          [title]="idea().upvotedByUser ? 'Remove upvote' : 'Upvote idea'"
        >
          <svg class="w-3.5 h-3.5 stroke-[2.5] mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
          </svg>
          <span class="text-sm font-bold leading-none">{{ idea().upvotes }}</span>
        </button>

        <!-- Center: Title & Description -->
        <div class="flex-1 min-w-0 pr-2">
          <h2 class="text-sm sm:text-base font-semibold truncate">
            <button
              type="button"
              (click)="selectIdea($event)"
              class="text-left font-semibold text-stone-900 dark:text-stone-100 group-hover:text-[#1B4D3E] dark:group-hover:text-emerald-400 transition-colors truncate max-w-full focus:outline-none focus-visible:underline"
            >
              {{ idea().title }}
            </button>
          </h2>
          <p class="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-0.5 line-clamp-1 leading-relaxed">
            {{ idea().description }}
          </p>

          <!-- Metadata & details -->
          <div class="flex items-center gap-2.5 mt-1.5 text-[11px] text-stone-400 dark:text-stone-500">
            <span>by {{ idea().authorName }}</span>
            <span>·</span>
            <span>{{ commentCount }} comment{{ commentCount === 1 ? '' : 's' }}</span>
            
            @if (ideaService.isTeamMember() && (idea().internalNotes?.length || 0) > 0) {
              <span class="text-amber-600 dark:text-amber-400 font-medium">
                · 🔒 {{ idea().internalNotes.length }} note{{ idea().internalNotes.length > 1 ? 's' : '' }}
              </span>
            }

            @if (ideaService.isSubscribed(idea())) {
              <span class="text-emerald-600 dark:text-emerald-400 hidden sm:inline">· 🔔 Subscribed</span>
            }

            @if (idea().status === 'merged') {
              <span class="text-purple-600 dark:text-purple-400 font-medium">· 🔗 Merged duplicate</span>
            }
          </div>
        </div>

        <!-- Right: Status Badge Pill (Direct styling from Mockup Image 1) -->
        <div class="flex-shrink-0">
          <span
            class="inline-block text-xs font-medium px-3 py-1 rounded-full border whitespace-nowrap"
            [class.bg-[#EEF7F2]]="idea().status === 'planned'"
            [class.text-[#2B7254]]="idea().status === 'planned'"
            [class.border-[#D1EADB]]="idea().status === 'planned'"
            [class.dark:bg-emerald-950/40]="idea().status === 'planned'"
            [class.dark:text-emerald-400]="idea().status === 'planned'"
            [class.dark:border-emerald-900]="idea().status === 'planned'"

            [class.bg-[#EEF4FF]]="idea().status === 'in-progress'"
            [class.text-[#335C9D]]="idea().status === 'in-progress'"
            [class.border-[#D1E0FC]]="idea().status === 'in-progress'"
            [class.dark:bg-blue-950/40]="idea().status === 'in-progress'"
            [class.dark:text-blue-400]="idea().status === 'in-progress'"
            [class.dark:border-blue-900]="idea().status === 'in-progress'"

            [class.bg-[#FEF4EA]]="idea().status === 'under-review'"
            [class.text-[#B56926]]="idea().status === 'under-review'"
            [class.border-[#F9DECB]]="idea().status === 'under-review'"
            [class.dark:bg-amber-950/40]="idea().status === 'under-review'"
            [class.dark:text-amber-400]="idea().status === 'under-review'"
            [class.dark:border-amber-900]="idea().status === 'under-review'"

            [class.bg-emerald-50]="idea().status === 'completed'"
            [class.text-emerald-800]="idea().status === 'completed'"
            [class.border-emerald-200]="idea().status === 'completed'"
            [class.dark:bg-emerald-950/50]="idea().status === 'completed'"
            [class.dark:text-emerald-300]="idea().status === 'completed'"
            [class.dark:border-emerald-800]="idea().status === 'completed'"

            [class.bg-stone-100]="idea().status === 'declined' || idea().status === 'merged'"
            [class.text-stone-600]="idea().status === 'declined' || idea().status === 'merged'"
            [class.border-stone-200]="idea().status === 'declined' || idea().status === 'merged'"
            [class.dark:bg-stone-800]="idea().status === 'declined' || idea().status === 'merged'"
            [class.dark:text-stone-400]="idea().status === 'declined' || idea().status === 'merged'"
            [class.dark:border-stone-700]="idea().status === 'declined' || idea().status === 'merged'"
          >
            {{ statusLabel(idea().status) }}
          </span>
        </div>

      </div>
    </article>
  `,
})
export class IdeaCardComponent {
  readonly idea = input.required<ProductIdea>();
  readonly ideaService = inject(IdeaService);

  get commentCount(): number {
    return this.idea().commentsCount ?? this.idea().comments?.length ?? 0;
  }

  selectIdea(event?: Event): void {
    if (event) event.stopPropagation();
    this.ideaService.selectedIdeaId.set(this.idea().id);
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'under-review': return 'Under Review';
      case 'planned': return 'Planned';
      case 'in-progress': return 'In Progress';
      case 'completed': return 'Completed';
      case 'declined': return 'Declined';
      case 'merged': return 'Merged';
      default: return status;
    }
  }
}
