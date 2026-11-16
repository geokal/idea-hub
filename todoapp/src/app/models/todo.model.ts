export interface Todo {
  id: string;
  title: string;
  note: string;
  completed: boolean;
  createdAt: string; // ISO string for localStorage serialization
}

export type SortOption =
  | 'custom'
  | 'date-asc'
  | 'date-desc'
  | 'name-asc'
  | 'name-desc'
  | 'completed-last'
  | 'completed-first';

export type FilterOption = 'all' | 'active' | 'completed';
