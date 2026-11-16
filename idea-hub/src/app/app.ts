import { Component, inject } from '@angular/core';
import { ThemeService } from './services/theme.service';
import { IdeaService } from './services/idea.service';
import { HeaderComponent } from './components/header/header.component';
import { IdeaSubmitComponent } from './components/idea-submit/idea-submit.component';
import { IdeaToolbarComponent } from './components/idea-toolbar/idea-toolbar.component';
import { IdeaCardComponent } from './components/idea-card/idea-card.component';
import { IdeaDetailComponent } from './components/idea-detail/idea-detail.component';

@Component({
  selector: 'app-root',
  imports: [
    HeaderComponent,
    IdeaSubmitComponent,
    IdeaToolbarComponent,
    IdeaCardComponent,
    IdeaDetailComponent,
  ],
  templateUrl: './app.html',
})
export class App {
  readonly themeService = inject(ThemeService);
  readonly ideaService = inject(IdeaService);
}
