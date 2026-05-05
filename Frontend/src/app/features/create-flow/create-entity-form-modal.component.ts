import { Component, effect, inject, untracked } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import type { CreateEntityKind } from '../../core/create-flow/create-entity-kind';
import { CreateFlowService } from '../../core/create-flow/create-flow.service';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
import { CrmModalComponent } from '../../core/modal/crm-modal.component';
import type { CallLogRow } from '../call-logs/call-logs.component';
import type { ContactRow } from '../contacts/contacts.component';
import type { DealOwnerOption, DealPipelineStatus, DealRow } from '../deals/deals.component';
import type { LeadOwnerOption, LeadRow, LeadStatus } from '../leads/leads.component';
import type { OrganizationRow } from '../organizations/organizations.component';
import type { AssigneeOption, TaskPriority, TaskRow, TaskStatus } from '../tasks/tasks.component';

@Component({
  selector: 'app-create-entity-form-modal',
  standalone: true,
  imports: [ReactiveFormsModule, CrmModalComponent],
  templateUrl: './create-entity-form-modal.component.html',
  styleUrl: './create-entity-form-modal.component.scss',
})
export class CreateEntityFormModalComponent {
  private readonly fb = inject(FormBuilder);
  protected readonly flow = inject(CreateFlowService);
  private readonly bus = inject(CreateRowBusService);

  protected readonly salutationOptions = ['', 'Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.'] as const;
  protected readonly genderOptions = ['', 'Male', 'Female', 'Other', 'Prefer not to say'] as const;
  protected readonly employeeOptions = ['1-10', '11-50', '51-200', '201-500', '500+'] as const;
  protected readonly territoryOptions = ['', 'India', 'APAC', 'EMEA', 'Americas', 'Other'] as const;
  protected readonly industryOptions = [
    'Technology',
    'Finance',
    'Healthcare',
    'Manufacturing',
    'Retail',
    'Education',
    'Other',
  ] as const;
  protected readonly addressOptions = [
    '',
    'Mumbai, Maharashtra',
    'Bengaluru, Karnataka',
    'Hyderabad, Telangana',
    'Pune, Maharashtra',
    'Chennai, Tamil Nadu',
    'New Delhi, Delhi',
    'Other',
  ] as const;

  protected readonly leadOwnerOptions: LeadOwnerOption[] = [
    { id: 'SK', label: 'Sam Kumar', initials: 'SK' },
    { id: 'AM', label: 'Alex Morgan', initials: 'AM' },
    { id: 'JD', label: 'Jordan Doe', initials: 'JD' },
  ];

  protected readonly dealOwnerOptions: DealOwnerOption[] = [
    { id: 'SK', label: 'Sam Kumar', initials: 'SK' },
    { id: 'AM', label: 'Alex Morgan', initials: 'AM' },
    { id: 'JD', label: 'Jordan Doe', initials: 'JD' },
  ];

  protected readonly dealStatuses: DealPipelineStatus[] = [
    'Qualification',
    'Proposal',
    'Negotiation',
    'Closed Won',
    'Closed Lost',
  ];

  protected readonly leadStatusOptions: LeadStatus[] = ['New', 'Contacted', 'Qualified', 'Lost'];

  protected readonly taskStatusOptions: { value: TaskStatus; label: string }[] = [
    { value: 'Backlog', label: 'Backlog' },
    { value: 'Todo', label: 'Todo' },
    { value: 'In Progress', label: 'In Progress' },
    { value: 'Done', label: 'Done' },
    { value: 'Canceled', label: 'Canceled' },
  ];

  protected readonly priorityOptions: { value: TaskPriority; label: string }[] = [
    { value: 'Low', label: 'Low' },
    { value: 'Medium', label: 'Medium' },
    { value: 'High', label: 'High' },
  ];

  protected readonly assigneeOptions: AssigneeOption[] = [
    { id: 'RD', label: 'Rohit Dhaygude', initials: 'R' },
    { id: 'SK', label: 'Sam Kumar', initials: 'SK' },
    { id: 'AM', label: 'Alex Morgan', initials: 'AM' },
    { id: 'JD', label: 'Jordan Doe', initials: 'JD' },
  ];

  protected readonly leadForm = this.fb.nonNullable.group({
    salutation: [''],
    lastName: ['', Validators.maxLength(120)],
    mobile: ['', Validators.maxLength(40)],
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    email: ['', [Validators.email, Validators.maxLength(160)]],
    gender: [''],
    organization: ['', [Validators.required, Validators.maxLength(160)]],
    employees: ['1-10'],
    annualRevenue: ['', Validators.maxLength(32)],
    website: ['', Validators.maxLength(200)],
    territory: [''],
    industry: ['Technology', Validators.required],
    status: this.fb.nonNullable.control<LeadStatus>('New', Validators.required),
    leadOwner: ['SK', Validators.required],
    requestType: [''],
    customField: ['', Validators.maxLength(240)],
  });

  protected readonly dealForm = this.fb.nonNullable.group({
    organizationName: ['', [Validators.required, Validators.maxLength(200)]],
    employees: ['1-10'],
    annualRevenue: ['', Validators.maxLength(40)],
    website: ['', Validators.maxLength(200)],
    territory: [''],
    industry: ['Technology', Validators.required],
    salutation: [''],
    lastName: ['', Validators.maxLength(120)],
    primaryMobile: ['', Validators.maxLength(40)],
    firstName: ['', Validators.maxLength(80)],
    primaryEmail: ['', [Validators.email, Validators.maxLength(160)]],
    gender: [''],
    status: this.fb.nonNullable.control<DealPipelineStatus>('Qualification', Validators.required),
    dealOwner: ['SK', Validators.required],
  });

  protected readonly contactForm = this.fb.nonNullable.group({
    salutation: [''],
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    lastName: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(160)]],
    mobile: ['', Validators.maxLength(40)],
    gender: [''],
    companyName: ['', [Validators.required, Validators.maxLength(200)]],
    designation: ['', Validators.maxLength(120)],
    address: [''],
  });

  protected readonly orgForm = this.fb.nonNullable.group({
    organizationName: ['', [Validators.required, Validators.maxLength(200)]],
    website: ['', Validators.maxLength(200)],
    industry: ['Technology', Validators.required],
    annualRevenue: ['', Validators.maxLength(40)],
    employees: ['1-10'],
    territory: [''],
  });

  protected readonly taskForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', Validators.maxLength(2000)],
    status: this.fb.nonNullable.control<TaskStatus>('Backlog', Validators.required),
    assignee: ['RD', Validators.required],
    dueDate: [''],
    priority: this.fb.nonNullable.control<TaskPriority>('Low', Validators.required),
  });

  protected readonly callForm = this.fb.nonNullable.group({
    direction: ['outbound', Validators.required],
    phoneNumber: ['', [Validators.required, Validators.maxLength(40)]],
    contactName: ['', [Validators.required, Validators.maxLength(200)]],
    startedAt: ['', Validators.required],
    durationMin: [0, [Validators.required, Validators.min(0), Validators.max(99)]],
    durationSec: [0, [Validators.required, Validators.min(0), Validators.max(59)]],
    outcome: ['connected', Validators.required],
    summary: ['', Validators.maxLength(2000)],
  });

  constructor() {
    effect(() => {
      const k = this.flow.formKind();
      if (!k) return;
      untracked(() => this.resetFor(k));
    });
  }

  protected close(): void {
    this.flow.closeFormModal();
  }

  private resetFor(kind: CreateEntityKind): void {
    switch (kind) {
      case 'lead':
        this.leadForm.reset({
          salutation: '',
          lastName: '',
          mobile: '',
          firstName: '',
          email: '',
          gender: '',
          organization: '',
          employees: '1-10',
          annualRevenue: '',
          website: '',
          territory: '',
          industry: 'Technology',
          status: 'New',
          leadOwner: 'SK',
          requestType: '',
          customField: '',
        });
        this.leadForm.markAsUntouched();
        break;
      case 'deal':
        this.dealForm.reset({
          organizationName: '',
          employees: '1-10',
          annualRevenue: '',
          website: '',
          territory: '',
          industry: 'Technology',
          salutation: '',
          lastName: '',
          primaryMobile: '',
          firstName: '',
          primaryEmail: '',
          gender: '',
          status: 'Qualification',
          dealOwner: 'SK',
        });
        this.dealForm.markAsUntouched();
        break;
      case 'contact':
        this.contactForm.reset({
          salutation: '',
          firstName: '',
          lastName: '',
          email: '',
          mobile: '',
          gender: '',
          companyName: '',
          designation: '',
          address: '',
        });
        this.contactForm.markAsUntouched();
        break;
      case 'organization':
        this.orgForm.reset({
          organizationName: '',
          website: '',
          industry: 'Technology',
          annualRevenue: '',
          employees: '1-10',
          territory: '',
        });
        this.orgForm.markAsUntouched();
        break;
      case 'task':
        this.taskForm.reset({
          title: '',
          description: '',
          status: 'Backlog',
          assignee: 'RD',
          dueDate: this.localDatetimeInputValue(),
          priority: 'Low',
        });
        this.taskForm.markAsUntouched();
        break;
      case 'callLog': {
        const p = (n: number) => String(n).padStart(2, '0');
        const d = new Date();
        const local = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
        this.callForm.reset({
          startedAt: local,
          direction: 'outbound',
          phoneNumber: '',
          contactName: '',
          durationMin: 0,
          durationSec: 0,
          outcome: 'connected',
          summary: '',
        });
        this.callForm.markAsUntouched();
        break;
      }
    }
  }

  private localDatetimeInputValue(d = new Date()): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  private buildDisplayName(salutation: string, first: string, last: string): string {
    const parts = [salutation.trim(), first.trim(), last.trim()].filter(Boolean);
    return parts.join(' ').trim() || first.trim() || last.trim() || 'Lead';
  }

  private formGroupFor(
    group: 'lead' | 'deal' | 'contact' | 'org' | 'task' | 'call',
  ): FormGroup {
    switch (group) {
      case 'lead':
        return this.leadForm;
      case 'deal':
        return this.dealForm;
      case 'contact':
        return this.contactForm;
      case 'org':
        return this.orgForm;
      case 'task':
        return this.taskForm;
      default:
        return this.callForm;
    }
  }

  protected fieldInvalid(group: 'lead' | 'deal' | 'contact' | 'org' | 'task' | 'call', name: string): boolean {
    const c = this.formGroupFor(group).get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  protected clearLeadEmailDuplicate(): void {
    const c = this.leadForm.get('email');
    const errs = c?.errors;
    if (!c || !errs?.['duplicate']) return;
    const next = { ...errs };
    delete next['duplicate'];
    c.setErrors(Object.keys(next).length ? next : null);
  }

  protected clearDealEmailDuplicate(): void {
    const c = this.dealForm.get('primaryEmail');
    const errs = c?.errors;
    if (!c || !errs?.['duplicate']) return;
    const next = { ...errs };
    delete next['duplicate'];
    c.setErrors(Object.keys(next).length ? next : null);
  }

  protected clearContactEmailDuplicate(): void {
    const c = this.contactForm.get('email');
    const errs = c?.errors;
    if (!c || !errs?.['duplicate']) return;
    const next = { ...errs };
    delete next['duplicate'];
    c.setErrors(Object.keys(next).length ? next : null);
  }

  protected clearOrgNameDuplicate(): void {
    const c = this.orgForm.get('organizationName');
    const errs = c?.errors;
    if (!c || !errs?.['duplicate']) return;
    const next = { ...errs };
    delete next['duplicate'];
    c.setErrors(Object.keys(next).length ? next : null);
  }

  protected submitLead(): void {
    this.leadForm.markAllAsTouched();
    if (this.leadForm.invalid) return;

    const raw = this.leadForm.getRawValue();
    const emailTrim = raw.email.trim();

    const ownerOpt = this.leadOwnerOptions.find((o) => o.id === raw.leadOwner);
    const initials = ownerOpt?.initials ?? raw.leadOwner;
    const leadOwnerName = ownerOpt?.label ?? raw.leadOwner;

    const row: LeadRow = {
      id: crypto.randomUUID(),
      salutation: raw.salutation || undefined,
      firstName: raw.firstName.trim(),
      lastName: raw.lastName.trim(),
      name: this.buildDisplayName(raw.salutation, raw.firstName, raw.lastName),
      mobile: raw.mobile.trim() || undefined,
      gender: raw.gender || undefined,
      email: emailTrim,
      organization: raw.organization.trim(),
      employees: raw.employees,
      annualRevenue: raw.annualRevenue.trim() || undefined,
      website: raw.website.trim() || undefined,
      territory: raw.territory || undefined,
      industry: raw.industry,
      status: raw.status,
      requestType: raw.requestType || undefined,
      notes: raw.customField.trim() || undefined,
      leadOwnerName,
      owner: initials,
      updated: 'Just now',
    };

    this.bus.publish('lead', row);
    this.flow.closeFormModal();
  }

  protected submitDeal(): void {
    this.dealForm.markAllAsTouched();
    if (this.dealForm.invalid) return;

    const raw = this.dealForm.getRawValue();
    const emailTrim = raw.primaryEmail.trim();
    const owner = this.dealOwnerOptions.find((o) => o.id === raw.dealOwner);
    const displayRev = raw.annualRevenue.trim() ? `₹ ${raw.annualRevenue.trim()}` : '₹ 0.00';

    const row: DealRow = {
      id: crypto.randomUUID(),
      organization: raw.organizationName.trim(),
      annualRevenue: displayRev,
      status: raw.status,
      email: emailTrim || '—',
      mobile: raw.primaryMobile.trim() || '—',
      assignedTo: owner?.label ?? raw.dealOwner,
      assignedInitials: owner?.initials ?? '—',
      lastModified: 'Just now',
    };

    this.bus.publish('deal', row);
    this.flow.closeFormModal();
  }

  protected submitContact(): void {
    this.contactForm.markAllAsTouched();
    if (this.contactForm.invalid) return;

    const raw = this.contactForm.getRawValue();
    const row: ContactRow = {
      id: crypto.randomUUID(),
      email: raw.email.trim(),
      phone: raw.mobile.trim() || '—',
      organization: raw.companyName.trim(),
      lastModified: 'Just now',
    };

    this.bus.publish('contact', row);
    this.flow.closeFormModal();
  }

  protected submitOrganization(): void {
    this.orgForm.markAllAsTouched();
    if (this.orgForm.invalid) return;

    const raw = this.orgForm.getRawValue();
    const nameTrim = raw.organizationName.trim();
    let web = raw.website.trim();
    if (web && !/^https?:\/\//i.test(web)) {
      web = `https://${web}`;
    }
    const displayRev = raw.annualRevenue.trim() ? `₹ ${raw.annualRevenue.trim()}` : '₹ 0.00';

    const row: OrganizationRow = {
      id: crypto.randomUUID(),
      name: nameTrim,
      website: web || '—',
      industry: raw.industry,
      annualRevenue: displayRev,
      lastModified: 'Just now',
    };

    this.bus.publish('organization', row);
    this.flow.closeFormModal();
  }

  protected formatDueDisplay(iso: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  protected submitTask(): void {
    this.taskForm.markAllAsTouched();
    if (this.taskForm.invalid) return;

    const raw = this.taskForm.getRawValue();
    const person = this.assigneeOptions.find((a) => a.id === raw.assignee);
    const dueRaw = raw.dueDate.trim();
    const dueDisplay = dueRaw ? this.formatDueDisplay(dueRaw) : '—';

    const row: TaskRow = {
      id: crypto.randomUUID(),
      title: raw.title.trim(),
      status: raw.status,
      priority: raw.priority,
      dueDate: dueDisplay,
      dueDateRaw: dueRaw,
      assignedTo: person?.label ?? raw.assignee,
      assignedInitials: person?.initials ?? '?',
      lastModified: 'Just now',
    };

    this.bus.publish('task', row);
    this.flow.closeFormModal();
  }

  private pad2(n: number): string {
    return String(Math.max(0, Math.min(99, n))).padStart(2, '0');
  }

  private outcomeLabel(code: string): string {
    const map: Record<string, string> = {
      connected: 'Connected',
      voicemail: 'Voicemail',
      no_answer: 'No answer',
      busy: 'Busy',
      wrong_number: 'Wrong number',
    };
    return map[code] ?? code;
  }

  protected submitCall(): void {
    this.callForm.markAllAsTouched();
    if (this.callForm.invalid) return;

    const v = this.callForm.getRawValue();
    const direction: 'Inbound' | 'Outbound' = v.direction === 'inbound' ? 'Inbound' : 'Outbound';
    const mm = Math.max(0, Math.min(99, Number(v.durationMin)));
    const ss = Math.max(0, Math.min(59, Number(v.durationSec)));
    const duration = `${this.pad2(mm)}:${this.pad2(ss)}`;
    const outcome = this.outcomeLabel(v.outcome);
    const contact =
      v.summary.trim().length > 0
        ? `${v.contactName.trim()} · ${v.summary.trim().slice(0, 48)}${v.summary.trim().length > 48 ? '…' : ''}`
        : v.contactName.trim();

    const when = this.formatWhen(v.startedAt);

    const row: CallLogRow = {
      id: crypto.randomUUID(),
      direction,
      contact,
      number: v.phoneNumber.trim(),
      duration,
      when,
      outcome,
    };

    this.bus.publish('callLog', row);
    this.flow.closeFormModal();
  }

  private formatWhen(isoLocal: string): string {
    const d = new Date(isoLocal);
    if (Number.isNaN(d.getTime())) return 'Just now';
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}
