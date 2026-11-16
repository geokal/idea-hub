import { Component, input, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { Todo } from '../../models/todo.model';
import { TodoService } from '../../services/todo.service';

@Component({
  selector: 'app-todo-item',
  imports: [FormsModule, CdkDragHandle],
  template: `
    <div
      class="group bg-white dark:bg-stone-900 rounded-2xl p-3.5 sm:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-stone-200/80 dark:border-stone-800 transition-all duration-150"
      [class.opacity-60]="todo().completed"
    >
      @if (isEditing()) {
        <!-- Inline Edit Mode -->
        <div class="space-y-2.5">
          <input
            type="text"
            [ngModel]="editTitle()"
            (ngModelChange)="editTitle.set($event)"
            (keydown.enter)="saveEdit()"
            (keydown.escape)="cancelEdit()"
            class="w-full bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-xl px-3 py-1.5 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-400"
            autofocus
          />
          <textarea
            [ngModel]="editNote()"
            (ngModelChange)="editNote.set($event)"
            placeholder="Add note details..."
            rows="2"
            class="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-1.5 text-xs text-stone-700 dark:text-stone-300 placeholder-stone-400 focus:outline-none resize-none"
          ></textarea>
          <div class="flex items-center gap-2">
            <button
              type="button"
              (click)="saveEdit()"
              class="px-3 py-1 bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-white dark:text-stone-900 text-xs font-medium rounded-lg transition-all"
            >
              Save
            </button>
            <button
              type="button"
              (click)="cancelEdit()"
              class="px-3 py-1 text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      } @else {
        <!-- Card View -->
        <div class="flex items-center justify-between gap-3">
          
          <div class="flex items-center gap-3 flex-1 min-w-0">
            
            <!-- Six-Dot Drag Handle Icon (::: ) with CdkDragHandle -->
            <div
              cdkDragHandle
              class="text-stone-300 dark:text-stone-600 hover:text-stone-500 dark:hover:text-stone-400 cursor-grab active:cursor-grabbing flex-shrink-0 select-none p-1 -m-1 transition-colors"
              title="Drag to reorder"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="5" cy="3" r="1.5" />
                <circle cx="11" cy="3" r="1.5" />
                <circle cx="5" cy="8" r="1.5" />
                <circle cx="11" cy="8" r="1.5" />
                <circle cx="5" cy="13" r="1.5" />
                <circle cx="11" cy="13" r="1.5" />
              </svg>
            </div>

            <!-- Minimalist Circular Checkbox -->
            <button
              type="button"
              (click)="todoService.toggleComplete(todo().id)"
              class="w-5 h-5 rounded-full border flex items-center justify-center transition-all cursor-pointer flex-shrink-0"
              [class.border-stone-300]="!todo().completed"
              [class.dark:border-stone-600]="!todo().completed"
              [class.hover:border-stone-500]="!todo().completed"
              [class.bg-stone-900]="todo().completed"
              [class.dark:bg-stone-100]="todo().completed"
              [class.border-stone-900]="todo().completed"
              [class.dark:border-stone-100]="todo().completed"
              [attr.aria-label]="todo().completed ? 'Mark incomplete' : 'Mark complete'"
            >
              @if (todo().completed) {
                <svg class="w-3 h-3 text-white dark:text-stone-900 stroke-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              }
            </button>

            <!-- Title & Note Preview -->
            <div class="flex-1 min-w-0">
              <span
                class="text-sm text-stone-800 dark:text-stone-200 select-none transition-all block truncate"
                [class.line-through]="todo().completed"
                [class.text-stone-400]="todo().completed"
                [class.dark:text-stone-500]="todo().completed"
              >
                {{ todo().title }}
              </span>

              @if (todo().note && isNoteExpanded()) {
                <p class="text-xs text-stone-500 dark:text-stone-400 mt-1.5 p-2 rounded-lg bg-stone-50 dark:bg-stone-800/50 leading-relaxed whitespace-pre-wrap">
                  {{ todo().note }}
                </p>
              }
            </div>

          </div>

          <!-- Subtle Right Actions -->
          <div class="flex items-center gap-1.5 text-stone-300 dark:text-stone-600 group-hover:text-stone-400 dark:group-hover:text-stone-500 transition-colors">
            
            <!-- Note Toggle Icon (≡) -->
            @if (todo().note) {
              <button
                type="button"
                (click)="isNoteExpanded.update(v => !v)"
                class="p-1 hover:text-stone-700 dark:hover:text-stone-300 transition-colors"
                [attr.aria-label]="isNoteExpanded() ? 'Hide note' : 'Show note'"
                [title]="isNoteExpanded() ? 'Hide note' : 'Show note'"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h10M4 18h7" />
                </svg>
              </button>
            }

            <!-- Edit Icon -->
            <button
              type="button"
              (click)="startEdit()"
              class="p-1 hover:text-stone-700 dark:hover:text-stone-300 transition-colors"
              aria-label="Edit task"
              title="Edit task"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>

            <!-- Trash Icon (Delete) -->
            <button
              type="button"
              (click)="todoService.deleteTodo(todo().id)"
              class="p-1 hover:text-rose-500 transition-colors"
              aria-label="Delete task"
              title="Delete task"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>

          </div>

        </div>
      }
    </div>
  `,
})
export class TodoItemComponent {
  readonly todo = input.required<Todo>();
  readonly todoService = inject(TodoService);

  readonly isEditing = signal(false);
  readonly editTitle = signal('');
  readonly editNote = signal('');
  readonly isNoteExpanded = signal(false);

  startEdit(): void {
    this.editTitle.set(this.todo().title);
    this.editNote.set(this.todo().note);
    this.isEditing.set(true);
  }

  saveEdit(): void {
    const title = this.editTitle().trim();
    if (!title) return;
    this.todoService.updateTodo(this.todo().id, {
      title,
      note: this.editNote().trim(),
    });
    this.isEditing.set(false);
  }

  cancelEdit(): void {
    this.isEditing.set(false);
  }
}
