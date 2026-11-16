import { Injectable, signal, computed } from '@angular/core';
import { Todo, SortOption, FilterOption } from '../models/todo.model';

const STORAGE_KEY = 'ng-todoapp-todos';

@Injectable({ providedIn: 'root' })
export class TodoService {
  private readonly _todos = signal<Todo[]>(this._load());

  readonly sortOption = signal<SortOption>('custom');
  readonly filterOption = signal<FilterOption>('all');

  // Encapsulated readonly signals
  readonly todos = this._todos.asReadonly();
  readonly totalCount = computed(() => this._todos().length);
  readonly activeCount = computed(() => this._todos().filter(t => !t.completed).length);
  readonly completedCount = computed(() => this._todos().filter(t => t.completed).length);

  readonly filteredAndSortedTodos = computed(() => {
    const filter = this.filterOption();
    let items = this._todos();

    if (filter === 'active') {
      items = items.filter(t => !t.completed);
    } else if (filter === 'completed') {
      items = items.filter(t => t.completed);
    }

    const sort = this.sortOption();
    if (sort === 'custom') {
      return items;
    }

    return [...items].sort((a, b) => {
      switch (sort) {
        case 'date-asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'date-desc':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'name-asc':
          return a.title.localeCompare(b.title);
        case 'name-desc':
          return b.title.localeCompare(a.title);
        case 'completed-last':
          return Number(a.completed) - Number(b.completed);
        case 'completed-first':
          return Number(b.completed) - Number(a.completed);
        default:
          return 0;
      }
    });
  });

  addTodo(title: string, note: string = ''): void {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    const todo: Todo = {
      id: crypto.randomUUID(),
      title: trimmedTitle,
      note: note.trim(),
      completed: false,
      createdAt: new Date().toISOString(),
    };

    this._todos.update(items => [todo, ...items]);
    this._save();
  }

  updateTodo(id: string, partial: Partial<Omit<Todo, 'id' | 'createdAt'>>): void {
    this._todos.update(items =>
      items.map(t => (t.id === id ? { ...t, ...partial } : t))
    );
    this._save();
  }

  deleteTodo(id: string): void {
    this._todos.update(items => items.filter(t => t.id !== id));
    this._save();
  }

  toggleComplete(id: string): void {
    this._todos.update(items =>
      items.map(t => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
    this._save();
  }

  reorderTodos(previousIndex: number, currentIndex: number): void {
    if (previousIndex === currentIndex) return;

    this.sortOption.set('custom');
    this._todos.update(items => {
      const currentList = this.filteredAndSortedTodos();
      const movedItem = currentList[previousIndex];
      const targetItem = currentList[currentIndex];
      if (!movedItem || !targetItem) return items;

      const fromIndex = items.findIndex(t => t.id === movedItem.id);
      const toIndex = items.findIndex(t => t.id === targetItem.id);
      if (fromIndex === -1 || toIndex === -1) return items;

      const updated = [...items];
      const [removed] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, removed);
      return updated;
    });
    this._save();
  }

  clearCompleted(): void {
    this._todos.update(items => items.filter(t => !t.completed));
    this._save();
  }

  private _save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._todos()));
    } catch {
      // Ignore if localStorage unavailable
    }
  }

  private _load(): Todo[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
}
