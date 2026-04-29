import { Component } from '@angular/core';

export interface CallLogRow {
  id: string;
  direction: 'Inbound' | 'Outbound';
  contact: string;
  number: string;
  duration: string;
  when: string;
}

@Component({
  selector: 'app-call-logs',
  imports: [],
  templateUrl: './call-logs.component.html',
  styleUrl: './call-logs.component.scss',
})
export class CallLogsComponent {
  protected readonly rows: CallLogRow[] = [
    {
      id: '1',
      direction: 'Outbound',
      contact: 'Alex Morgan',
      number: '+1 (415) 555-0192',
      duration: '12:04',
      when: 'Today, 10:02 AM',
    },
    {
      id: '2',
      direction: 'Inbound',
      contact: 'Acme Corp — main line',
      number: '+1 (212) 555-0147',
      duration: '03:41',
      when: 'Today, 9:18 AM',
    },
    {
      id: '3',
      direction: 'Outbound',
      contact: 'Maria Chen',
      number: '+1 (650) 555-0163',
      duration: '22:17',
      when: 'Yesterday, 3:55 PM',
    },
    {
      id: '4',
      direction: 'Inbound',
      contact: 'Unknown caller',
      number: '+1 (503) 555-0188',
      duration: '00:48',
      when: 'Yesterday, 11:06 AM',
    },
    {
      id: '5',
      direction: 'Outbound',
      contact: 'Northwind — procurement',
      number: '+44 20 7946 0958',
      duration: '07:29',
      when: 'Mon, Jan 27',
    },
  ];
}
