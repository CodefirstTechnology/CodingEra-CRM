import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/theme/theme.service';
import { ToastComponent } from './core/toast/toast.component';
import { CrmIntlTelDropdownService } from './shared/services/crm-intl-tel-dropdown.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly themeService = inject(ThemeService);

  constructor() {
    this.themeService.initFromStorage();
    inject(CrmIntlTelDropdownService).init();
  }
}
