import { Component, inject, signal, computed, HostListener } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IdeaService } from '../../services/idea.service';
import { IdeaStatus } from '../../models/idea.model';

@Component({
  selector: 'app-idea-detail',
  imports: [DatePipe, FormsModule],
  template: `
    @if (ideaService.selectedIdea(); as idea) {
      <div
        class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-stone-900/60 backdrop-blur-sm animate-fade-in"
        (click)="close()"
      >
        <div
          class="relative w-full max-w-2xl max-h-[92vh] bg-white dark:bg-[#1C1C1A] rounded-3xl shadow-2xl border border-stone-200/80 dark:border-stone-800 flex flex-col overflow-hidden"
          (click)="$event.stopPropagation()"
        >
          <!-- Modal Top Header -->
          <div class="flex items-start justify-between p-5 sm:p-6 border-b border-stone-100 dark:border-stone-800/80">
            <div class="flex-1 pr-4">
              <div class="flex items-center gap-2 mb-2 flex-wrap">
                <span class="text-[10px] font-semibold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                  {{ idea.category }}
                </span>
                
                <span
                  class="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border"
                  [class.bg-amber-50]="idea.status === 'under-review'"
                  [class.border-amber-200]="idea.status === 'under-review'"
                  [class.text-amber-700]="idea.status === 'under-review'"
                  [class.dark:bg-amber-950/40]="idea.status === 'under-review'"
                  [class.dark:border-amber-900]="idea.status === 'under-review'"
                  [class.dark:text-amber-400]="idea.status === 'under-review'"

                  [class.bg-indigo-50]="idea.status === 'planned'"
                  [class.border-indigo-200]="idea.status === 'planned'"
                  [class.text-indigo-700]="idea.status === 'planned'"
                  [class.dark:bg-indigo-950/40]="idea.status === 'planned'"
                  [class.dark:border-indigo-900]="idea.status === 'planned'"
                  [class.dark:text-indigo-400]="idea.status === 'planned'"

                  [class.bg-blue-50]="idea.status === 'in-progress'"
                  [class.border-blue-200]="idea.status === 'in-progress'"
                  [class.text-blue-700]="idea.status === 'in-progress'"
                  [class.dark:bg-blue-950/40]="idea.status === 'in-progress'"
                  [class.dark:border-blue-900]="idea.status === 'in-progress'"
                  [class.dark:text-blue-400]="idea.status === 'in-progress'"

                  [class.bg-emerald-50]="idea.status === 'completed'"
                  [class.border-emerald-200]="idea.status === 'completed'"
                  [class.text-emerald-700]="idea.status === 'completed'"
                  [class.dark:bg-emerald-950/40]="idea.status === 'completed'"
                  [class.dark:border-emerald-900]="idea.status === 'completed'"
                  [class.dark:text-emerald-400]="idea.status === 'completed'"

                  [class.bg-stone-100]="idea.status === 'declined'"
                  [class.border-stone-200]="idea.status === 'declined'"
                  [class.text-stone-600]="idea.status === 'declined'"
                  [class.dark:bg-stone-800]="idea.status === 'declined'"
                  [class.dark:border-stone-700]="idea.status === 'declined'"
                  [class.dark:text-stone-400]="idea.status === 'declined'"

                  [class.bg-purple-50]="idea.status === 'merged'"
                  [class.border-purple-200]="idea.status === 'merged'"
                  [class.text-purple-700]="idea.status === 'merged'"
                  [class.dark:bg-purple-950/40]="idea.status === 'merged'"
                  [class.dark:border-purple-900]="idea.status === 'merged'"
                  [class.dark:text-purple-400]="idea.status === 'merged'"
                >
                  {{ ideaService.formatStatusLabel(idea.status) }}
                </span>

                <span class="text-xs text-stone-400 dark:text-stone-500">
                  by {{ idea.authorName }}
                  @if (ideaService.isTeamMember()) {
                    <span class="text-stone-400 font-mono text-[10px]"> ({{ idea.authorEmail }} · private to team)</span>
                  }
                </span>
              </div>

              <h1 class="text-xl sm:text-2xl font-serif text-stone-900 dark:text-stone-100 font-normal leading-snug">
                {{ idea.title }}
              </h1>
            </div>

            <!-- Close Button -->
            <button
              (click)="close()"
              type="button"
              class="w-8 h-8 flex items-center justify-center rounded-full text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors flex-shrink-0"
              aria-label="Close dialog"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Modal Scrollable Body -->
          <div class="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
            
            <!-- MERGED DUPLICATE BANNER (Design Decision #5) -->
            @if (idea.status === 'merged') {
              <div class="bg-purple-50 dark:bg-purple-950/30 rounded-2xl p-4 border border-purple-200 dark:border-purple-900/50 flex items-start justify-between gap-3">
                <div class="flex items-start gap-2.5">
                  <span class="text-lg">🔗</span>
                  <div>
                    <h2 class="text-xs font-bold uppercase tracking-wider text-purple-900 dark:text-purple-200">
                      Duplicate Idea Merged
                    </h2>
                    <p class="text-xs text-purple-700 dark:text-purple-300 mt-0.5">
                      This idea was merged into <strong>"{{ idea.mergedIntoTitle }}"</strong>. All {{ idea.upvotes }} upvotes and subscribers have been consolidated into the canonical idea.
                    </p>
                  </div>
                </div>
                @if (idea.mergedIntoId) {
                  <button
                    type="button"
                    (click)="ideaService.selectedIdeaId.set(idea.mergedIntoId)"
                    class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-colors whitespace-nowrap"
                  >
                    View Canonical Idea →
                  </button>
                }
              </div>
            }

            <!-- Full Description Card -->
            <div class="bg-stone-50 dark:bg-stone-900/60 rounded-2xl p-4 sm:p-5 border border-stone-200/60 dark:border-stone-800">
              <h2 class="text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-2">Description</h2>
              <p class="text-stone-800 dark:text-stone-200 text-sm sm:text-base leading-relaxed whitespace-pre-line">
                {{ idea.description }}
              </p>
              
              <div class="mt-4 pt-3 border-t border-stone-200/50 dark:border-stone-800 flex items-center justify-between text-xs text-stone-400 dark:text-stone-500 flex-wrap gap-2">
                <span>Submitted {{ idea.createdAt | date:'medium' }}</span>

                <div class="flex items-center gap-2">
                  <!-- Opt-in / Subscribe Toggle (Design Decision #4) -->
                  <button
                    type="button"
                    (click)="ideaService.toggleSubscription(idea.id)"
                    class="flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all text-xs font-medium"
                    [class.bg-blue-50]="ideaService.isSubscribed(idea)"
                    [class.border-blue-200]="ideaService.isSubscribed(idea)"
                    [class.text-blue-600]="ideaService.isSubscribed(idea)"
                    [class.dark:bg-blue-950/40]="ideaService.isSubscribed(idea)"
                    [class.dark:border-blue-900]="ideaService.isSubscribed(idea)"
                    [class.dark:text-blue-400]="ideaService.isSubscribed(idea)"
                    [class.bg-white]="!ideaService.isSubscribed(idea)"
                    [class.border-stone-200]="!ideaService.isSubscribed(idea)"
                    [class.text-stone-600]="!ideaService.isSubscribed(idea)"
                    [class.dark:bg-stone-850]="!ideaService.isSubscribed(idea)"
                    [class.dark:border-stone-700]="!ideaService.isSubscribed(idea)"
                    [class.dark:text-stone-300]="!ideaService.isSubscribed(idea)"
                  >
                    <svg class="w-3.5 h-3.5" [attr.fill]="ideaService.isSubscribed(idea) ? 'currentColor' : 'none'" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <span>{{ ideaService.isSubscribed(idea) ? 'Subscribed' : 'Get Progress Updates' }}</span>
                  </button>

                  <!-- Upvote Button -->
                  <button
                    type="button"
                    (click)="ideaService.toggleUpvote(idea.id)"
                    class="flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all text-xs font-semibold"
                    [class.bg-blue-50]="idea.upvotedByUser"
                    [class.border-blue-300]="idea.upvotedByUser"
                    [class.text-blue-600]="idea.upvotedByUser"
                    [class.dark:bg-blue-950/40]="idea.upvotedByUser"
                    [class.dark:border-blue-800]="idea.upvotedByUser"
                    [class.dark:text-blue-400]="idea.upvotedByUser"
                    [class.bg-white]="!idea.upvotedByUser"
                    [class.border-stone-200]="!idea.upvotedByUser"
                    [class.text-stone-600]="!idea.upvotedByUser"
                    [class.dark:bg-stone-850]="!idea.upvotedByUser"
                    [class.dark:border-stone-700]="!idea.upvotedByUser"
                    [class.dark:text-stone-300]="!idea.upvotedByUser"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
                    </svg>
                    <span>{{ idea.upvotes }} upvotes</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- TEAM CONTROL PANEL: Status Transition & Public Transition Notes (Design Decision #3) -->
            @if (ideaService.isTeamMember() && idea.status !== 'merged') {
              <div class="bg-gradient-to-br from-indigo-50/50 to-purple-50/40 dark:from-indigo-950/20 dark:to-stone-900 rounded-2xl p-4 sm:p-5 border border-indigo-100 dark:border-indigo-900/50">
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-2">
                    <span class="text-sm">🛡️</span>
                    <h2 class="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300">
                      Team Action: Status Transition & Public Note
                    </h2>
                  </div>
                  <span class="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                    Feeds customer notifications
                  </span>
                </div>

                <div class="space-y-3">
                  <div>
                    <label class="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1.5">Change Status</label>
                    <div class="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                      @for (s of availableStatuses; track s.id) {
                        <button
                          type="button"
                          (click)="targetStatus.set(s.id)"
                          class="px-2.5 py-1.5 rounded-xl text-xs font-medium border text-center transition-all"
                          [class.bg-indigo-600]="targetStatus() === s.id"
                          [class.border-indigo-600]="targetStatus() === s.id"
                          [class.text-white]="targetStatus() === s.id"
                          [class.bg-white]="targetStatus() !== s.id"
                          [class.border-stone-200]="targetStatus() !== s.id"
                          [class.text-stone-700]="targetStatus() !== s.id"
                          [class.dark:bg-stone-850]="targetStatus() !== s.id"
                          [class.dark:border-stone-700]="targetStatus() !== s.id"
                          [class.dark:text-stone-300]="targetStatus() !== s.id"
                        >
                          {{ s.label }}
                        </button>
                      }
                    </div>
                  </div>

                  <div>
                    <label class="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                      Public Transition Note (Sent to {{ idea.subscribedUserEmails.length }} subscribers)
                    </label>
                    <input
                      type="text"
                      [(ngModel)]="statusUpdateNote"
                      placeholder="e.g. Starting development for Sprint 24, scheduled for next release."
                      class="w-full px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-stone-850 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div class="flex justify-end">
                    <button
                      type="button"
                      (click)="applyStatusChange(idea.id)"
                      class="px-4 py-2 rounded-xl text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-sm flex items-center gap-1.5"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Update Status & Broadcast Notifications</span>
                    </button>
                  </div>
                </div>
              </div>
            }

            <!-- ADMIN CONTROL PANEL: Merge Duplicate & Purge (Design Decision #1 & #5) -->
            @if (ideaService.isAdmin() && idea.status !== 'merged') {
              <div class="bg-gradient-to-br from-purple-50/60 to-pink-50/30 dark:from-purple-950/20 dark:to-stone-900 rounded-2xl p-4 sm:p-5 border border-purple-100 dark:border-purple-900/50">
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-2">
                    <span class="text-sm">⚡</span>
                    <h2 class="text-xs font-bold uppercase tracking-wider text-purple-900 dark:text-purple-300">
                      Admin Action: Merge Duplicate & Clean Board
                    </h2>
                  </div>
                  <span class="text-[10px] text-purple-600 dark:text-purple-400">
                    Design Decision #5
                  </span>
                </div>

                <div class="space-y-3">
                  <div>
                    <label class="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                      Target Canonical Idea (to merge this idea into)
                    </label>
                    <select
                      [(ngModel)]="mergeTargetIdeaId"
                      class="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-stone-850 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 focus:outline-none"
                    >
                      <option value="">Select canonical target idea...</option>
                      @for (other of availableMergeTargets(); track other.id) {
                        <option [value]="other.id">#{{ other.title }} ({{ other.upvotes }} upvotes)</option>
                      }
                    </select>
                  </div>

                  <div>
                    <label class="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                      Merge Audit Note (Optional)
                    </label>
                    <input
                      type="text"
                      [(ngModel)]="mergeReasonNote"
                      placeholder="e.g. Duplicate suggestion for dark mode, transferring 14 upvotes."
                      class="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-stone-850 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 focus:outline-none"
                    />
                  </div>

                  <div class="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      (click)="confirmDelete(idea.id)"
                      class="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 underline"
                    >
                      Delete Idea
                    </button>

                    <button
                      type="button"
                      (click)="executeMerge(idea.id)"
                      [disabled]="!mergeTargetIdeaId"
                      class="px-4 py-2 rounded-xl text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Merge Duplicate & Consolidate Upvotes
                    </button>
                  </div>
                </div>
              </div>
            }

            <!-- STATUS HISTORY TIMELINE -->
            @if (idea.statusHistory && idea.statusHistory.length > 0) {
              <div>
                <h2 class="text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-3">
                  Status History & Public Notes ({{ idea.statusHistory.length }})
                </h2>
                <div class="relative pl-5 border-l-2 border-stone-200 dark:border-stone-800 space-y-4">
                  @for (item of idea.statusHistory; track item.id) {
                    <div class="relative">
                      <div class="absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-stone-900 bg-blue-500"></div>
                      <div>
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-xs font-semibold text-stone-800 dark:text-stone-200">
                            {{ ideaService.formatStatusLabel(item.newStatus) }}
                          </span>
                          <span class="text-[11px] text-stone-400 dark:text-stone-500">
                            {{ item.timestamp | date:'medium' }} by {{ item.changedBy }}
                          </span>
                        </div>
                        <p class="text-xs text-stone-600 dark:text-stone-400 mt-0.5">
                          {{ item.note }}
                        </p>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- STRUCTURAL SEPARATION: Public Discussion vs. 🔒 Internal Team Notes (Design Decision #2) -->
            <div class="pt-4 border-t border-stone-100 dark:border-stone-800">
              
              <!-- Tab Switcher -->
              <div class="flex items-center gap-2 mb-4 border-b border-stone-200/60 dark:border-stone-800 pb-2">
                <button
                  type="button"
                  (click)="activeDiscussionTab.set('public')"
                  class="pb-1 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5"
                  [class.text-stone-900]="activeDiscussionTab() === 'public'"
                  [class.dark:text-white]="activeDiscussionTab() === 'public'"
                  [class.border-b-2]="activeDiscussionTab() === 'public'"
                  [class.border-stone-900]="activeDiscussionTab() === 'public'"
                  [class.dark:border-white]="activeDiscussionTab() === 'public'"
                  [class.text-stone-400]="activeDiscussionTab() !== 'public'"
                >
                  <span>💬 Public Discussion</span>
                  <span class="text-[10px] font-normal opacity-80">({{ idea.comments.length }})</span>
                </button>

                <!-- Internal Notes Tab is STRUCTURALLY HIDDEN from Customers (Design Decision #2) -->
                @if (ideaService.isTeamMember()) {
                  <button
                    type="button"
                    (click)="activeDiscussionTab.set('internal')"
                    class="pb-1 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5"
                    [class.text-amber-700]="activeDiscussionTab() === 'internal'"
                    [class.dark:text-amber-400]="activeDiscussionTab() === 'internal'"
                    [class.border-b-2]="activeDiscussionTab() === 'internal'"
                    [class.border-amber-600]="activeDiscussionTab() === 'internal'"
                    [class.text-stone-400]="activeDiscussionTab() !== 'internal'"
                  >
                    <span>🔒 Internal Team Notes</span>
                    <span class="text-[10px] font-normal opacity-80">({{ idea.internalNotes?.length || 0 }})</span>
                  </button>
                }
              </div>

              <!-- VIEW 1: Public Comments -->
              @if (activeDiscussionTab() === 'public') {
                <div class="space-y-3 mb-4">
                  @for (c of idea.comments; track c.id) {
                    <div class="p-3.5 rounded-2xl text-xs border bg-stone-50 border-stone-200/60 dark:bg-stone-900/60 dark:border-stone-800">
                      <div class="flex items-center justify-between gap-2 mb-1">
                        <div class="flex items-center gap-1.5">
                          <span class="font-semibold text-stone-800 dark:text-stone-200">{{ c.authorName }}</span>
                          @if (c.isTeamMember) {
                            <span class="text-[10px] font-medium px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                              Official Team
                            </span>
                          }
                        </div>
                        <span class="text-[10px] text-stone-400">{{ c.createdAt | date:'short' }}</span>
                      </div>
                      <p class="text-stone-700 dark:text-stone-300 leading-relaxed whitespace-pre-line">{{ c.content }}</p>
                    </div>
                  } @empty {
                    <p class="text-xs text-stone-400 italic py-2 text-center">
                      No public comments yet. Share your thoughts or feedback!
                    </p>
                  }
                </div>

                <!-- Add Public Comment Form -->
                <div class="bg-stone-50 dark:bg-stone-900/80 rounded-2xl p-3 border border-stone-200/70 dark:border-stone-800">
                  <textarea
                    [(ngModel)]="newPublicCommentText"
                    rows="2"
                    placeholder="Ask a question or share customer feedback..."
                    class="w-full text-xs bg-transparent border-0 resize-none text-stone-800 dark:text-stone-200 focus:outline-none placeholder:text-stone-400"
                  ></textarea>
                  <div class="flex items-center justify-between pt-2 border-t border-stone-200/50 dark:border-stone-800">
                    <span class="text-[11px] text-stone-400">
                      Posting publicly as {{ ideaService.isTeamMember() ? 'Official Team' : 'Alex Customer' }}
                    </span>
                    <button
                      type="button"
                      (click)="submitPublicComment(idea.id)"
                      [disabled]="!newPublicCommentText.trim()"
                      class="px-4 py-1.5 rounded-xl text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 transition-all shadow-sm disabled:opacity-40"
                    >
                      Post Public Comment
                    </button>
                  </div>
                </div>
              }

              <!-- VIEW 2: Internal Team Notes (Strictly for Team & Admin) -->
              @if (activeDiscussionTab() === 'internal' && ideaService.isTeamMember()) {
                <div class="mb-3 p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
                  <span class="text-base">🔒</span>
                  <div>
                    <strong>Zero-Leak Security Boundary:</strong> Internal notes are accessible only to authenticated Team Members and Admins. They are strictly segregated and never delivered to public customer APIs or interfaces.
                  </div>
                </div>

                <div class="space-y-3 mb-4">
                  @for (note of (idea.internalNotes || []); track note.id) {
                    <div class="p-3.5 rounded-2xl text-xs border bg-amber-50/40 border-amber-200/60 dark:bg-amber-950/15 dark:border-amber-900/30">
                      <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="font-semibold text-amber-900 dark:text-amber-200">{{ note.authorName }}</span>
                        <span class="text-[10px] text-stone-400">{{ note.createdAt | date:'short' }}</span>
                      </div>
                      <p class="text-stone-800 dark:text-stone-200 leading-relaxed whitespace-pre-line">{{ note.content }}</p>
                    </div>
                  } @empty {
                    <p class="text-xs text-stone-400 italic py-2 text-center">
                      No internal notes yet. Document engineering feasibility, estimates, or sprint links.
                    </p>
                  }
                </div>

                <!-- Add Internal Note Form -->
                <div class="bg-amber-50/50 dark:bg-stone-900/80 rounded-2xl p-3 border border-amber-200/70 dark:border-stone-800">
                  <textarea
                    [(ngModel)]="newInternalNoteText"
                    rows="2"
                    placeholder="Document engineering estimates, sprint dependencies, or internal feasibility..."
                    class="w-full text-xs bg-transparent border-0 resize-none text-stone-800 dark:text-stone-200 focus:outline-none placeholder:text-stone-400"
                  ></textarea>
                  <div class="flex items-center justify-between pt-2 border-t border-amber-200/40 dark:border-stone-800">
                    <span class="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                      🔒 Confined to Internal Team
                    </span>
                    <button
                      type="button"
                      (click)="submitInternalNote(idea.id)"
                      [disabled]="!newInternalNoteText.trim()"
                      class="px-4 py-1.5 rounded-xl text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 transition-all shadow-sm disabled:opacity-40"
                    >
                      Save Internal Note
                    </button>
                  </div>
                </div>
              }

            </div>

          </div>
        </div>
      </div>
    }
  `,
  styles: `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .animate-fade-in {
      animation: fadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1);
    }
  `
})
export class IdeaDetailComponent {
  readonly ideaService = inject(IdeaService);

  readonly availableStatuses: { id: IdeaStatus; label: string }[] = [
    { id: 'under-review', label: 'Under Review' },
    { id: 'planned', label: 'Planned' },
    { id: 'in-progress', label: 'In Progress' },
    { id: 'completed', label: 'Completed' },
    { id: 'declined', label: 'Declined' },
  ];

  readonly targetStatus = signal<IdeaStatus>('planned');
  statusUpdateNote = '';

  readonly activeDiscussionTab = signal<'public' | 'internal'>('public');
  newPublicCommentText = '';
  newInternalNoteText = '';

  mergeTargetIdeaId = '';
  mergeReasonNote = '';

  readonly availableMergeTargets = computed(() => {
    const current = this.ideaService.selectedIdea();
    if (!current) return [];
    return this.ideaService.ideas().filter(i => i.id !== current.id && i.status !== 'merged');
  });

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  close(): void {
    this.ideaService.selectedIdeaId.set(null);
  }

  applyStatusChange(ideaId: string): void {
    this.ideaService.updateStatus(ideaId, this.targetStatus(), this.statusUpdateNote);
    this.statusUpdateNote = '';
  }

  executeMerge(sourceIdeaId: string): void {
    if (!this.mergeTargetIdeaId) return;
    this.ideaService.mergeIdeas(sourceIdeaId, this.mergeTargetIdeaId, this.mergeReasonNote);
    this.mergeReasonNote = '';
    this.mergeTargetIdeaId = '';
  }

  confirmDelete(ideaId: string): void {
    if (confirm('Are you sure you want to permanently delete this idea?')) {
      this.ideaService.deleteIdea(ideaId);
    }
  }

  submitPublicComment(ideaId: string): void {
    if (!this.newPublicCommentText.trim()) return;
    this.ideaService.addPublicComment(ideaId, this.newPublicCommentText);
    this.newPublicCommentText = '';
  }

  submitInternalNote(ideaId: string): void {
    if (!this.newInternalNoteText.trim()) return;
    this.ideaService.addInternalNote(ideaId, this.newInternalNoteText);
    this.newInternalNoteText = '';
  }
}
