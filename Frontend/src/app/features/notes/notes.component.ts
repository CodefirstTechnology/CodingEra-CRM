import { Component } from '@angular/core';

export interface NoteRow {
  id: string;
  title: string;
  record: string;
  author: string;
  when: string;
}

@Component({
  selector: 'app-notes',
  imports: [],
  templateUrl: './notes.component.html',
  styleUrl: './notes.component.scss',
})
export class NotesComponent {
  protected readonly rows: NoteRow[] = [
    {
      id: '1',
      title: 'Follow up after demo — interested in enterprise tier',
      record: 'Lead · Northwind Traders',
      author: 'Jordan Doe',
      when: 'Today, 8:42 AM',
    },
    {
      id: '2',
      title: 'Legal requested MSA redlines before signature',
      record: 'Deal · Acme Corp',
      author: 'Sam Lee',
      when: 'Yesterday, 4:18 PM',
    },
    {
      id: '3',
      title: 'Budget confirmed for Q1; waiting on procurement',
      record: 'Organization · Contoso Ltd',
      author: 'Maria Chen',
      when: 'Mon, Jan 27',
    },
    {
      id: '4',
      title: 'Call summary: renewal discussion, no blockers',
      record: 'Contact · Alex Morgan',
      author: 'Jordan Doe',
      when: 'Mon, Jan 27',
    },
    {
      id: '5',
      title: 'Competitor mentioned — position on integrations',
      record: 'Deal · Fabrikam Inc',
      author: 'Alex Rivera',
      when: 'Fri, Jan 24',
    },
  ];
}
