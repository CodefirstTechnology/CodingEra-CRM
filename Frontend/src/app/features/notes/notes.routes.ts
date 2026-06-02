import { Routes } from '@angular/router';

export const NOTES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./notes.component').then((m) => m.NotesComponent),
  },
];
