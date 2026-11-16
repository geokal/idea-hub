import { Component, input, inject } from '@angular/core';
import { ProductIdea } from '../../models/idea.model';
import { IdeaService } from '../../services/idea.service';

@Component({
  selector: 'app-idea-card',
  template: `
    <article
      (click)="ideaService.selectedIdeaId.set(idea().id)"
      class="group bg-white dark:bg-stone-900 rounded-2xl p-3.5 sm:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-stone-200/80 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 hover:shadow-md transition-all cursor-pointer relative"
      [class.opacity-75]="idea().status === 'merged'"
    >
      <!-- Row layout directly implementing Sarah's Feedback Dashboard Sketch -->
      <div class="flex items-center gap-3 sm:gap-4">
        
        <!-- Left: Boxed Vote Count (as in Sarah's sketch) -->
        <button
          type="button"
          (click)="$event.stopPropagation(); ideaService.toggleUpvote(idea().id)"
          class="flex flex-col items-center justify-center min-w-[3rem] w-12 h-12 rounded-xl border-2 transition-all flex-shrink-0 select-none"
          [class.bg-blue-50]="idea().upvotedByUser"
          [class.border-blue-400]="idea().upvotedByUser"
          [class.text-blue-600]="idea().upvotedByUser"
          [class.dark:bg-blue-950/40]="idea().upvotedByUser"
          [class.dark:border-blue-700]="idea().upvotedByUser"
          [class.dark:text-blue-400]="idea().upvotedByUser"
          [class.bg-stone-50]="!idea().upvotedByUser"
          [class.border-stone-200]="!idea().upvotedByUser"
          [class.text-stone-700]="!idea().upvotedByUser"
          [class.dark:bg-stone-850]="!idea().upvotedByUser"
          [class.dark:border-stone-750]="!idea().upvotedByUser"
          [class.dark:text-stone-300]="!idea().upvotedByUser"
          [class.hover:border-stone-400]="!idea().upvotedByUser"
          [title]="idea().upvotedByUser ? 'Remove upvote' : 'Click to upvote'"
        >
          <span class="text-sm font-bold leading-none">{{ idea().upvotes }}</span>
          <span class="text-[9px] uppercase tracking-wider font-semibold opacity-70 mt-0.5 leading-none">votes</span>
        </button>

        <!-- Center: Feedback Title & Description (Sarah's sketch: "Title - Description of the feedback") -->
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-1.5 flex-wrap">
            <h2 class="text-sm sm:text-base font-semibold text-stone-900 dark:text-stone-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {{ idea().title }}
            </h2>
            <span class="text-xs text-stone-500 dark:text-stone-400 truncate hidden sm:inline">
              — {{ idea().description }}
            </span>
          </div>

          <!-- Description on mobile if truncated -->
          <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5 line-clamp-1 sm:hidden">
            {{ idea().description }}
          </p>

          <!-- Merged duplicate notice -->
          @if (idea().status === 'merged') {
            <div class="mt-1 text-[11px] text-purple-700 dark:text-purple-300 flex items-center gap-1 font-medium">
              <span>🔗 Merged duplicate → {{ idea().mergedIntoTitle }}</span>
            </div>
          }

          <!-- Metadata row -->
          <div class="flex items-center gap-3 mt-1 text-[11px] text-stone-400 dark:text-stone-500">
            <span>by {{ idea().authorName }}</span>
            <span>·</span>
            <span>{{ idea().comments.length }} comment{{ idea().comments.length === 1 ? '' : 's' }}</span>
            
            @if (ideaService.isTeamMember() && (idea().internalNotes?.length || 0) > 0) {
              <span class="text-amber-600 dark:text-amber-400 font-medium">
                · 🔒 {{ idea().internalNotes.length }} internal note{{ idea().internalNotes.length > 1 ? 's' : '' }}
              </span>
            }

            @if (ideaService.isSubscribed(idea())) {
              <span class="text-blue-600 dark:text-blue-400 hidden sm:inline">· 🔔 Subscribed</span>
            }
          </div>
        </div>

        <!-- Right: Status Badge (as in Sarah's sketch) -->
        <div class="flex items-center gap-2 flex-shrink-0">
          <span
            class="text-[10px] sm:text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border whitespace-nowrap"
            [class.bg-amber-50]="idea().status === 'under-review'"
            [class.border-amber-200]="idea().status === 'under-review'"
            [class.text-amber-700]="idea().status === 'under-review'"
            [class.dark:bg-amber-950/40]="idea().status === 'under-review'"
            [class.dark:border-amber-900]="idea().status === 'under-review'"
            [class.dark:text-amber-400]="idea().status === 'under-review'"
            
            [class.bg-indigo-50]="idea().status === 'planned'"
            [class.border-indigo-200]="idea().status === 'planned'"
            [class.text-indigo-700]="idea().status === 'planned'"
            [class.dark:bg-indigo-950/40]="idea().status === 'planned'"
            [class.dark:border-indigo-900]="idea().status === 'planned'"
            [class.dark:text-indigo-400]="idea().status === 'planned'"
            
            [class.bg-blue-50]="idea().status === 'in-progress'"
            [class.border-blue-200]="idea().status === 'in-progress'"
            [class.text-blue-700]="idea().status === 'in-progress'"
            [class.dark:bg-blue-950/40]="idea().status === 'in-progress'"
            [class.dark:border-blue-900]="idea().status === 'in-progress'"
            [class.dark:text-blue-400]="idea().status === 'in-progress'"
            
            [class.bg-emerald-50]="idea().status === 'completed'"
            [class.border-emerald-200]="idea().status === 'completed'"
            [class.text-emerald-700]="idea().status === 'completed'"
            [class.dark:bg-emerald-950/40]="idea().status === 'completed'"
            [class.dark:border-emerald-900]="idea().status === 'completed'"
            [class.dark:text-emerald-400]="idea().status === 'completed'"
            
            [class.bg-stone-100]="idea().status === 'declined'"
            [class.border-stone-200]="idea().status === 'declined'"
            [class.text-stone-600]="idea().status === 'declined'"
            [class.dark:bg-stone-800]="idea().status === 'declined'"
            [class.dark:border-stone-700]="idea().status === 'declined'"
            [class.dark:text-stone-400]="idea().status === 'declined'"

            [class.bg-purple-50]="idea().status === 'merged'"
            [class.border-purple-200]="idea().status === 'merged'"
            [class.text-purple-700]="idea().status === 'merged'"
            [class.dark:bg-purple-950/40]="idea().status === 'merged'"
            [class.dark:border-purple-900]="idea().status === 'merged'"
            [class.dark:text-purple-400]="idea().status === 'merged'"
          >
            {{ ideaService.formatStatusLabel(idea().status) }}
          </span>
        </div>

      </div>
    </article>
  `,
})
export class IdeaCardComponent {
  readonly idea = input.required<ProductIdea>();
  readonly ideaService = inject(IdeaService);
}
