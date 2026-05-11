import { Injectable } from '@angular/core';

export type LocalEntityKey =
  | 'leads'
  | 'deals'
  | 'contacts'
  | 'organizations'
  | 'tasks'
  | 'notes'
  | 'callLogs';

const STORAGE_PREFIX = 'crm.ld.v2.';

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
        mobile: '9876543210',
        email: 'john.doe@example.com',
        organization: 'Acme Inc',
        employees: '51-200',
        industry: 'Technology',
        status: 'New',
        source: 'Website',
        leadOwnerName: 'Sam Kumar',
        owner: 'SK',
        leadOwnerId: 'SK',
        updated: 'Today',
      },
      {
        id: 2,
        name: 'Jane Smith',
        firstName: 'Jane',
        lastName: 'Smith',
        mobile: '9876543211',
        email: 'jane.smith@example.com',
        organization: 'Globex Corp',
        industry: 'Finance',
        status: 'Contacted',
        source: 'Referral',
        leadOwnerName: 'Alex Morgan',
        owner: 'AM',
        leadOwnerId: 'AM',
        updated: 'Yesterday',
      },
      {
        id: 3,
        name: 'Mike Ross',
        firstName: 'Mike',
        lastName: 'Ross',
        mobile: '9876543212',
        email: 'mike.ross@example.com',
        organization: 'Pearson Hardman',
        industry: 'Technology',
        status: 'Qualified',
        source: 'Ads',
        leadOwnerName: 'Jordan Doe',
        owner: 'JD',
        leadOwnerId: 'JD',
        updated: '2d ago',
      },
      {
        id: 4,
        name: 'Rachel Zane',
        firstName: 'Rachel',
        lastName: 'Zane',
        mobile: '9876543213',
        email: 'rachel.zane@example.com',
        organization: 'Rand Securities',
        industry: 'Retail',
        status: 'Lost',
        source: 'Cold Call',
        leadOwnerName: 'Sam Kumar',
        owner: 'SK',
        leadOwnerId: 'SK',
        updated: '1w ago',
      },
    ],
    deals: [
      {
        id: 1,
        organizationName: 'Sterling Cooper',
        employees: '51-200',
        annualRevenue: 1500000,
        website: 'https://sterling.example',
        territory: 'Americas',
        industry: 'Technology',
        salutation: 'Mr.',
        firstName: 'Don',
        lastName: 'Draper',
        email: 'newbiz@sterling.example',
        mobile: '9000010001',
        gender: '',
        status: 'Qualification',
        dealOwnerId: 'SK',
        assignedTo: 'Sam Kumar',
        assignedInitials: 'SK',
        lastModified: 'Today',
      },
      {
        id: 2,
        organizationName: 'Wayne Enterprises',
        employees: '500+',
        annualRevenue: 4250000,
        website: 'https://wayne.example',
        territory: 'EMEA',
        industry: 'Finance',
        salutation: '',
        firstName: 'Lucius',
        lastName: 'Fox',
        email: 'procurement@wayne.example',
        mobile: '9000010002',
        gender: '',
        status: 'Proposal',
        dealOwnerId: 'AM',
        assignedTo: 'Alex Morgan',
        assignedInitials: 'AM',
        lastModified: 'Yesterday',
      },
      {
        id: 3,
        organizationName: 'Stark Industries',
        employees: '201-500',
        annualRevenue: 999999,
        website: 'https://stark.example',
        territory: 'Americas',
        industry: 'Manufacturing',
        salutation: '',
        firstName: 'Pepper',
        lastName: 'Potts',
        email: 'contracts@stark.example',
        mobile: '9000010003',
        gender: 'Female',
        status: 'Negotiation',
        dealOwnerId: 'JD',
        assignedTo: 'Jordan Doe',
        assignedInitials: 'JD',
        lastModified: '3d ago',
      },
      {
        id: 4,
        organizationName: 'Hooli',
        employees: '1-10',
        annualRevenue: 320000,
        website: '',
        territory: 'APAC',
        industry: 'Technology',
        salutation: '',
        firstName: 'Gavin',
        lastName: 'Belson',
        email: 'deals@hooli.example',
        mobile: '9000010004',
        gender: '',
        status: 'Closed Won',
        dealOwnerId: 'SK',
        assignedTo: 'Sam Kumar',
        assignedInitials: 'SK',
        lastModified: '1w ago',
      },
      {
        id: 5,
        organization: 'crm',
        annualRevenue: '₹ 0.00',
        status: 'Demo/Making',
        email: 'codefirst2022@gmail.com',
        mobile: '—',
        assignedTo: 'adsx',
        assignedInitials: 'A',
        lastModified: 'Just now',
        relatedContactId: '5',
      },
      {
        id: 6,
        organization: 'Contoso Ltd',
        annualRevenue: '₹ 8,00,000',
        status: 'Qualification',
        email: 'deals@contoso.example',
        mobile: '+91 98000 20001',
        assignedTo: 'Rohit Dhaygude',
        assignedInitials: 'R',
        lastModified: 'Today',
        relatedOrganizationId: '1',
      },
    ],
    contacts: [
      {
        id: 1,
        salutation: 'Ms.',
        firstName: 'Ava',
        lastName: 'Patel',
        email: 'ava.patel@contoso.example',
        phone: '9810010001',
        gender: 'Female',
        organization: 'Contoso Ltd',
        designation: 'VP Sales',
        address: 'Mumbai, Maharashtra',
        lastModified: 'Today',
      },
      {
        id: 2,
        salutation: 'Mr.',
        firstName: 'Li',
        lastName: 'Wei',
        email: 'li.wei@fabrikam.example',
        phone: '9810010002',
        gender: 'Male',
        organization: 'Fabrikam Inc',
        designation: 'Director',
        address: 'Bengaluru, Karnataka',
        lastModified: 'Yesterday',
      },
      {
        id: 3,
        salutation: 'Ms.',
        firstName: 'Nina',
        lastName: 'K',
        email: 'nina.k@northwind.example',
        phone: '9810010003',
        gender: 'Female',
        organization: 'Northwind Traders',
        designation: 'Manager',
        address: 'Hyderabad, Telangana',
        lastModified: '3d ago',
      },
      {
        id: 4,
        salutation: 'Mr.',
        firstName: 'Omkar',
        lastName: 'S',
        email: 'omkar.s@initech.example',
        phone: '9810010004',
        gender: 'Male',
        organization: 'Initech',
        designation: 'Engineer',
        address: 'Pune, Maharashtra',
        lastModified: '1w ago',
      },
      {
        id: 5,
        email: 'codefirst2022@gmail.com',
        phone: '—',
        organization: '',
        salutation: '',
        firstName: 'Codefirst2022',
        lastName: '',
        gender: '',
        designation: '',
        address: '',
        lastModified: 'Just now',
      },
    ],
    organizations: [
      {
        id: 1,
        name: 'Contoso Ltd',
        website: 'https://contoso.example',
        industry: 'Technology',
        annualRevenue: 1875000,
        employees: '201-500',
        territory: 'India',
        lastModified: 'Today',
        address: 'Mumbai, Maharashtra',
      },
      {
        id: 2,
        name: 'Fabrikam Inc',
        website: 'https://fabrikam.example',
        industry: 'Manufacturing',
        annualRevenue: 5520000,
        employees: '500+',
        territory: 'EMEA',
        lastModified: 'Yesterday',
      },
      {
        id: 3,
        name: 'Adventure Works',
        website: '',
        industry: 'Retail',
        annualRevenue: 640500,
        employees: '51-200',
        territory: 'Americas',
        lastModified: '3d ago',
      },
      {
        id: 4,
        name: 'Litware',
        website: 'https://litware.example',
        industry: 'Education',
        annualRevenue: 205000,
        employees: '11-50',
        territory: 'India',
        lastModified: '1w ago',
      },
    ],
    tasks: [
      {
        id: 1,
        title: 'Discovery call — Contoso',
        description: 'Prepare discovery questions and deck.',
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
        description: 'Include updated pricing tier.',
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
        description: '',
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
        description: 'Align on QBR agenda with CS.',
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
        relatedType: 'lead',
        relatedName: 'Northwind Traders',
        visibility: 'team',
        body: 'Follow up after demo — interested in enterprise tier. Schedule technical deep-dive.',
        author: 'Jordan Doe',
        when: 'Today, 8:42 AM',
        bodyPreview: 'Follow up after demo — interested in enterprise tier. Schedule technical deep-dive.',
      },
      {
        id: 2,
        title: 'Legal requested MSA redlines before signature',
        relatedType: 'deal',
        relatedName: 'Acme Corp',
        visibility: 'team',
        body: 'Legal requested MSA redlines before signature.',
        author: 'Sam Lee',
        when: 'Yesterday, 4:18 PM',
        bodyPreview: 'Legal requested MSA redlines before signature.',
      },
      {
        id: 3,
        title: 'Budget confirmed for Q1; waiting on procurement',
        relatedType: 'organization',
        relatedName: 'Contoso Ltd',
        visibility: 'team',
        body: 'Budget confirmed for Q1; waiting on procurement.',
        author: 'Maria Chen',
        when: 'Mon, May 5',
        bodyPreview: 'Budget confirmed for Q1; waiting on procurement.',
      },
      {
        id: 4,
        title: 'Call summary: renewal discussion, no blockers',
        relatedType: 'contact',
        relatedName: 'Alex Morgan',
        visibility: 'private',
        body: 'Call summary: renewal discussion, no blockers.',
        author: 'Jordan Doe',
        when: 'Mon, May 5',
        bodyPreview: 'Call summary: renewal discussion, no blockers.',
      },
    ],
    callLogs: [
      {
        id: 1,
        direction: 'Outbound',
        phoneNumber: '+1 (415) 555-0192',
        contactName: 'Alex Morgan',
        startedAt: '2026-05-06T10:02',
        durationSeconds: 12 * 60 + 4,
        outcome: 'Connected',
        summary: 'Discussed renewal timeline.',
        lastModified: 'Today',
      },
      {
        id: 2,
        direction: 'Inbound',
        phoneNumber: '+1 (212) 555-0147',
        contactName: 'Acme Corp',
        startedAt: '2026-05-06T09:18',
        durationSeconds: 3 * 60 + 41,
        outcome: 'Connected',
        summary: 'Main line inquiry routed to sales.',
        lastModified: 'Today',
      },
      {
        id: 3,
        direction: 'Outbound',
        phoneNumber: '+1 (650) 555-0163',
        contactName: 'Maria Chen',
        startedAt: '2026-05-05T15:55',
        durationSeconds: 22 * 60 + 17,
        outcome: 'Voicemail',
        summary: '',
        lastModified: 'Yesterday',
      },
      {
        id: 4,
        direction: 'Inbound',
        phoneNumber: '+1 (503) 555-0188',
        contactName: 'Unknown caller',
        startedAt: '2026-05-05T11:06',
        durationSeconds: 48,
        outcome: 'No answer',
        summary: '',
        lastModified: 'Yesterday',
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
