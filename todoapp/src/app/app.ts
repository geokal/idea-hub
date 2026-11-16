import { Component, inject } from '@angular/core';
import { ThemeService } from './services/theme.service';
import { TodoService } from './services/todo.service';
import { HeaderComponent } from './components/header/header.component';
import { TodoInputComponent } from './components/todo-input/todo-input.component';
import { TodoToolbarComponent } from './components/todo-toolbar/todo-toolbar.component';
import { TodoListComponent } from './components/todo-list/todo-list.component';

@Component({
  selector: 'app-root',
  imports: [
    HeaderComponent,
    TodoInputComponent,
    TodoToolbarComponent,
    TodoListComponent,
  ],
  templateUrl: './app.html',
})
export class App {
  readonly themeService = inject(ThemeService);
  readonly todoService = inject(TodoService);
}
