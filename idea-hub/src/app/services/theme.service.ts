import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly isDark = signal<boolean>(false);

  constructor() {
    let initialDark = false;
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('ideahub_theme');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        initialDark = saved ? saved === 'dark' : prefersDark;
      } catch {
        initialDark = false;
      }
      this.isDark.set(initialDark);
      this._apply(initialDark);
    }
  }

  toggleTheme(): void {
    const next = !this.isDark();
    this.isDark.set(next);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('ideahub_theme', next ? 'dark' : 'light');
      } catch {
        // Continue even if storage quota or cookies are disabled
      }
      this._apply(next);
    }
  }

  private _apply(dark: boolean): void {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', dark);
    }
  }
}
