import { Component, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TodoService } from '../../services/todo.service';

@Component({
  selector: 'app-todo-input',
  imports: [FormsModule],
  template: `
    <div class="bg-white dark:bg-stone-900 rounded-2xl p-2.5 sm:p-3 shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-stone-200/90 dark:border-stone-800 transition-all focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:border-blue-500 dark:focus-within:ring-blue-950">
      <div class="flex items-center gap-2.5">
        
        <!-- Plus Circle Icon -->
        <div class="pl-1.5 text-stone-400 dark:text-stone-500 flex-shrink-0">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" stroke-width="1.8" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 8v8m-4-4h8" />
          </svg>
        </div>

        <!-- Input Field -->
        <input
          type="text"
          placeholder="Add a new task..."
          [ngModel]="title()"
          (ngModelChange)="title.set($event)"
          (keydown.enter)="submit()"
          class="flex-1 bg-transparent text-sm text-stone-800 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none"
        />

        <!-- Optional Note Toggle -->
        <button
          type="button"
          (click)="showNote.update(v => !v)"
          class="p-1.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 rounded-lg transition-colors text-xs"
          [class.text-blue-600]="showNote()"
          [class.dark:text-blue-400]="showNote()"
          [attr.aria-label]="showNote() ? 'Hide note field' : 'Add note to task'"
          title="Add notes"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h10M4 18h7" />
          </svg>
        </button>

        <!-- Add Button (Soft blue pill) -->
        <button
          type="button"
          (click)="submit()"
          [disabled]="!title().trim()"
          class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          Add
        </button>
      </div>

      <!-- Expandable Note Area -->
      @if (showNote()) {
        <div class="mt-2.5 pt-2.5 border-t border-stone-100 dark:border-stone-800">
          <textarea
            placeholder="Add a note or description..."
            [ngModel]="note()"
            (ngModelChange)="note.set($event)"
            rows="2"
            class="w-full bg-stone-50/70 dark:bg-stone-850 border border-stone-200/60 dark:border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-700 dark:text-stone-200 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:border-stone-300 dark:focus:border-stone-700 transition-all resize-none"
          ></textarea>
        </div>
      }
    </div>
  `,
})
export class TodoInputComponent {
  private readonly todoService = inject(TodoService);

  readonly title = signal('');
  readonly note = signal('');
  readonly showNote = signal(false);

  submit(): void {
    const t = this.title().trim();
    if (!t) return;
    this.todoService.addTodo(t, this.note());
    this.title.set('');
    this.note.set('');
    this.showNote.set(false);
  }
}
