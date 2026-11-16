import { Component, inject } from '@angular/core';
import { CdkDropList, CdkDrag, CdkDragDrop, CdkDragPlaceholder } from '@angular/cdk/drag-drop';
import { TodoService } from '../../services/todo.service';
import { TodoItemComponent } from '../todo-item/todo-item.component';
import { Todo } from '../../models/todo.model';

@Component({
  selector: 'app-todo-list',
  imports: [CdkDropList, CdkDrag, CdkDragPlaceholder, TodoItemComponent],
  template: `
    @if (todoService.filteredAndSortedTodos().length === 0) {
      <div class="text-center py-16 px-4 select-none">
        <!-- 3 Horizontal Lines Icon (≡) -->
        <div class="text-stone-300 dark:text-stone-600 mb-3 flex justify-center">
          <svg class="w-5 h-5 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </div>
        
        <!-- Italic Empty State Caption -->
        <p class="text-xs text-stone-400 dark:text-stone-500 italic font-normal tracking-wide">
          Nothing to do — add a task above
        </p>
      </div>
    } @else {
      <div
        cdkDropList
        (cdkDropListDropped)="onDrop($event)"
        class="space-y-2.5"
      >
        @for (todo of todoService.filteredAndSortedTodos(); track todo.id) {
          <div
            cdkDrag
            [cdkDragData]="todo"
            class="transition-transform"
          >
            <!-- Custom Drag Placeholder -->
            <div *cdkDragPlaceholder class="rounded-2xl border-2 border-dashed border-stone-200 dark:border-stone-800 bg-stone-100/40 dark:bg-stone-900/40 min-h-[56px] transition-all"></div>
            
            <app-todo-item [todo]="todo" />
          </div>
        }
      </div>
    }
  `,
})
export class TodoListComponent {
  readonly todoService = inject(TodoService);

  onDrop(event: CdkDragDrop<Todo[]>): void {
    this.todoService.reorderTodos(event.previousIndex, event.currentIndex);
  }
}
