import { Injectable } from '@angular/core';

export type LocalEntityKey =
  | 'leads'
  | 'deals'
  | 'contacts'
  | 'organizations'
  | 'tasks'
  | 'notes'
  | 'callLogs';

const STORAGE_PREFIX = 'crm.ld.v1.';

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function defaultDataset(): Record<LocalEntityKey, Record<string, unknown>[]> {
  return {
    leads: [
      {
        id: 1,
        name: 'John Doe',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        organization: 'Acme Inc',
        industry: 'Technology',
        status: 'New',
        source: 'Website',
        leadOwnerName: 'Sam Kumar',
        owner: 'SK',
        updated: 'Today',
      },
      {
        id: 2,
        name: 'Jane Smith',
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
        organization: 'Globex Corp',
        industry: 'Finance',
        status: 'Contacted',
        source: 'Referral',
        leadOwnerName: 'Alex Morgan',
        owner: 'AM',
        updated: 'Yesterday',
      },
      {
        id: 3,
        name: 'Mike Ross',
        firstName: 'Mike',
        lastName: 'Ross',
        email: 'mike.ross@example.com',
        organization: 'Pearson Hardman',
        industry: 'Technology',
        status: 'Qualified',
        source: 'Ads',
        leadOwnerName: 'Jordan Doe',
        owner: 'JD',
        updated: '2d ago',
      },
      {
        id: 4,
        name: 'Rachel Zane',
        firstName: 'Rachel',
        lastName: 'Zane',
        email: 'rachel.zane@example.com',
        organization: 'Rand Securities',
        industry: 'Retail',
        status: 'Lost',
        source: 'Cold Call',
        leadOwnerName: 'Sam Kumar',
        owner: 'SK',
        updated: '1w ago',
      },
    ],
    deals: [
      {
        id: 1,
        organization: 'Sterling Cooper',
        annualRevenue: '₹ 15,00,000',
        status: 'Qualification',
        email: 'newbiz@sterling.example',
        mobile: '+91 90000 10001',
        assignedTo: 'Sam Kumar',
        assignedInitials: 'SK',
        lastModified: 'Today',
      },
      {
        id: 2,
        organization: 'Wayne Enterprises',
        annualRevenue: '₹ 42,50,000',
        status: 'Proposal',
        email: 'procurement@wayne.example',
        mobile: '+91 90000 10002',
        assignedTo: 'Alex Morgan',
        assignedInitials: 'AM',
        lastModified: 'Yesterday',
      },
      {
        id: 3,
        organization: 'Stark Industries',
        annualRevenue: '₹ 9,99,999',
        status: 'Negotiation',
        email: 'contracts@stark.example',
        mobile: '+91 90000 10003',
        assignedTo: 'Jordan Doe',
        assignedInitials: 'JD',
        lastModified: '3d ago',
      },
      {
        id: 4,
        organization: 'Hooli',
        annualRevenue: '₹ 3,20,000',
        status: 'Closed Won',
        email: 'deals@hooli.example',
        mobile: '+91 90000 10004',
        assignedTo: 'Sam Kumar',
        assignedInitials: 'SK',
        lastModified: '1w ago',
      },
    ],
    contacts: [
      {
        id: 1,
        email: 'ava.patel@contoso.example',
        phone: '+91 98100 10001',
        organization: 'Contoso Ltd',
        lastModified: 'Today',
      },
      {
        id: 2,
        email: 'li.wei@fabrikam.example',
        phone: '+91 98100 10002',
        organization: 'Fabrikam Inc',
        lastModified: 'Yesterday',
      },
      {
        id: 3,
        email: 'nina.k@northwind.example',
        phone: '+91 98100 10003',
        organization: 'Northwind Traders',
        lastModified: '3d ago',
      },
      {
        id: 4,
        email: 'omkar.s@initech.example',
        phone: '+91 98100 10004',
        organization: 'Initech',
        lastModified: '1w ago',
      },
    ],
    organizations: [
      {
        id: 1,
        name: 'Contoso Ltd',
        website: 'https://contoso.example',
        industry: 'Technology',
        annualRevenue: '₹ 18,75,000',
        lastModified: 'Today',
      },
      {
        id: 2,
        name: 'Fabrikam Inc',
        website: 'https://fabrikam.example',
        industry: 'Manufacturing',
        annualRevenue: '₹ 55,20,000',
        lastModified: 'Yesterday',
      },
      {
        id: 3,
        name: 'Adventure Works',
        website: '—',
        industry: 'Retail',
        annualRevenue: '₹ 6,40,500',
        lastModified: '3d ago',
      },
      {
        id: 4,
        name: 'Litware',
        website: 'https://litware.example',
        industry: 'Education',
        annualRevenue: '₹ 2,05,000',
        lastModified: '1w ago',
      },
    ],
    tasks: [
      {
        id: 1,
        title: 'Discovery call — Contoso',
        status: 'In Progress',
        priority: 'High',
        dueDate: '06/05/2026, 11:30 am',
        dueDateRaw: '2026-05-06T11:30',
        assignedTo: 'Rohit Dhaygude',
        assignedInitials: 'R',
        lastModified: 'Today',
      },
      {
        id: 2,
        title: 'Send revised proposal — Fabrikam',
        status: 'Todo',
        priority: 'Medium',
        dueDate: '08/05/2026, 09:00 am',
        dueDateRaw: '2026-05-08T09:00',
        assignedTo: 'Sam Kumar',
        assignedInitials: 'SK',
        lastModified: 'Yesterday',
      },
      {
        id: 3,
        title: 'Renewal risk review — Northwind',
        status: 'Backlog',
        priority: 'Low',
        dueDate: '15/05/2026, 03:00 pm',
        dueDateRaw: '2026-05-15T15:00',
        assignedTo: 'Alex Morgan',
        assignedInitials: 'AM',
        lastModified: '3d ago',
      },
      {
        id: 4,
        title: 'Schedule QBR — Initech',
        status: 'Done',
        priority: 'Low',
        dueDate: '—',
        dueDateRaw: '',
        assignedTo: 'Jordan Doe',
        assignedInitials: 'JD',
        lastModified: '1w ago',
      },
    ],
    notes: [
      {
        id: 1,
        title: 'Follow up after demo — interested in enterprise tier',
        record: 'Lead · Northwind Traders',
        author: 'Jordan Doe',
        when: 'Today, 8:42 AM',
      },
      {
        id: 2,
        title: 'Legal requested MSA redlines before signature',
        record: 'Deal · Acme Corp',
        author: 'Sam Lee',
        when: 'Yesterday, 4:18 PM',
      },
      {
        id: 3,
        title: 'Budget confirmed for Q1; waiting on procurement',
        record: 'Organization · Contoso Ltd',
        author: 'Maria Chen',
        when: 'Mon, May 5',
      },
      {
        id: 4,
        title: 'Call summary: renewal discussion, no blockers',
        record: 'Contact · Alex Morgan',
        author: 'Jordan Doe',
        when: 'Mon, May 5',
      },
    ],
    callLogs: [
      {
        id: 1,
        direction: 'Outbound',
        contact: 'Alex Morgan',
        number: '+1 (415) 555-0192',
        duration: '12:04',
        when: 'Today, 10:02 AM',
        outcome: 'Connected',
      },
      {
        id: 2,
        direction: 'Inbound',
        contact: 'Acme Corp — main line',
        number: '+1 (212) 555-0147',
        duration: '03:41',
        when: 'Today, 9:18 AM',
        outcome: 'Connected',
      },
      {
        id: 3,
        direction: 'Outbound',
        contact: 'Maria Chen',
        number: '+1 (650) 555-0163',
        duration: '22:17',
        when: 'Yesterday, 3:55 PM',
        outcome: 'Voicemail',
      },
      {
        id: 4,
        direction: 'Inbound',
        contact: 'Unknown caller',
        number: '+1 (503) 555-0188',
        duration: '00:48',
        when: 'Yesterday, 11:06 AM',
        outcome: 'No answer',
      },
    ],
  };
}

@Injectable({ providedIn: 'root' })
export class LocalDataService {
  private key(entity: LocalEntityKey): string {
    return `${STORAGE_PREFIX}${entity}`;
  }

  private readList(entity: LocalEntityKey): Record<string, unknown>[] {
    try {
      const raw = localStorage.getItem(this.key(entity));
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
    } catch {
      return [];
    }
  }

  private writeList(entity: LocalEntityKey, list: Record<string, unknown>[]): void {
    localStorage.setItem(this.key(entity), JSON.stringify(list));
  }

  private ensureSeeded(entity: LocalEntityKey): void {
    const list = this.readList(entity);
    if (list.length > 0) return;
    const defaults = defaultDataset()[entity];
    this.writeList(entity, clone(defaults));
  }

  private nextId(list: Record<string, unknown>[]): number {
    return list.reduce((max, row) => {
      const n = Number(row['id']);
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 0) + 1;
  }

  getAll(entity: LocalEntityKey): Record<string, unknown>[] {
    this.ensureSeeded(entity);
    return clone(this.readList(entity));
  }

  getById(entity: LocalEntityKey, id: number): Record<string, unknown> | null {
    this.ensureSeeded(entity);
    const row = this.readList(entity).find((r) => Number(r['id']) === id);
    return row ? clone(row) : null;
  }

  create(entity: LocalEntityKey, data: Record<string, unknown>): Record<string, unknown> {
    this.ensureSeeded(entity);
    const list = this.readList(entity);
    const { id: _ignored, ...rest } = data;
    const created: Record<string, unknown> = { ...rest, id: this.nextId(list) };
    list.unshift(created);
    this.writeList(entity, list);
    return clone(created);
  }

  update(
    entity: LocalEntityKey,
    id: number,
    data: Record<string, unknown>,
  ): Record<string, unknown> | null {
    this.ensureSeeded(entity);
    const list = this.readList(entity);
    const idx = list.findIndex((r) => Number(r['id']) === id);
    if (idx < 0) return null;
    const { id: _ignored, ...patch } = data;
    const merged = { ...list[idx], ...patch, id };
    list[idx] = merged;
    this.writeList(entity, list);
    return clone(merged);
  }

  delete(entity: LocalEntityKey, id: number): boolean {
    this.ensureSeeded(entity);
    const list = this.readList(entity);
    const next = list.filter((r) => Number(r['id']) !== id);
    if (next.length === list.length) return false;
    this.writeList(entity, next);
    return true;
  }
}
