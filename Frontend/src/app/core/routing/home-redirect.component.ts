import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { defaultHomeUrl } from '../auth/auth-role.util';
import { AuthService } from '../auth/auth.service';

/** Navigates to `/dashboard` or `/user-dashboard` based on session role. */
@Component({ standalone: true, template: '' })
export class HomeRedirectComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  ngOnInit(): void {
    void this.router.navigateByUrl(defaultHomeUrl(this.auth.user()), { replaceUrl: true });
  }
}
