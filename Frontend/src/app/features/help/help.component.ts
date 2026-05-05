import { Component } from '@angular/core';

@Component({
  selector: 'app-help',
  imports: [],
  templateUrl: './help.component.html',
  styleUrl: './help.component.scss',
})
export class HelpComponent {
  protected readonly shortcuts = [
    { keys: 'G then D', action: 'Go to Dashboard' },
    { keys: 'G then L', action: 'Go to Leads' },
    { keys: 'G then T', action: 'Go to Tasks' },
    { keys: '/', action: 'Focus search (when available)' },
    { keys: '?', action: 'Open this help center' },
  ];

  protected readonly articles = [
    {
      title: 'Importing leads from a spreadsheet',
      blurb: 'Column mapping, deduplication rules, and how to review errors before commit.',
    },
    {
      title: 'Pipeline stages and probability',
      blurb: 'Customize stages, default amounts, and forecast rollups for your team.',
    },
    {
      title: 'Sharing records with your team',
      blurb: 'Roles, teams, and visibility so the right people see deals and notes.',
    },
  ];
}
