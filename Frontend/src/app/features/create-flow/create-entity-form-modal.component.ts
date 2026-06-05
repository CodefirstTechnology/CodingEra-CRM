import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { take } from 'rxjs';
import type { CreateEntityKind } from '../../core/create-flow/create-entity-kind';
import { CreateFlowService } from '../../core/create-flow/create-flow.service';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
import { CrmModalComponent } from '../../core/modal/crm-modal.component';
import { AuthService } from '../../core/auth/auth.service';
import { isAdmin } from '../../core/auth/auth-role.util';
import { ContactsService } from '../../core/services/contacts.service';
import { DealsService } from '../../core/services/deals.service';
import { composeLeadNotesForApi } from '../../core/services/leads/lead-notes-requirement.util';
import { LeadsService, leadsHttpErrorMessage } from '../../core/services/leads.service';
import { ToastService } from '../../core/toast/toast.service';
import { NotesService } from '../../core/services/notes.service';
import { OrganizationsService } from '../../core/services/organizations.service';
import { OrganizationMasterSelectService } from '../../core/services/organizations/organization-master-select.service';
import type { MasterDataOption } from '../../core/services/leads/lead-master-data.service';
import { LeadMasterDataService } from '../../core/services/leads/lead-master-data.service';
import {
  ensureConvertedInLeadStatusOptions,
  FALLBACK_LEAD_STATUS_OPTIONS,
  isConvertedLeadStatusName,
  isSelectableLeadStatusOption,
  resolveLeadStatusIdFromName,
} from '../../core/services/leads/lead-status.constants';
import { DealMasterSelectService } from '../../core/services/deals/deal-master-select.service';
import { DEFAULT_DEAL_PIPELINE_STATUS } from '../../core/services/deals/deal-pipeline.constants';
import { resolveDealStatusLabel } from '../../core/services/deals/deal-status.constants';
import {
  masterOptionFormValue,
  masterSelectControlValue,
  resolveOrgMasterPick,
  resolveSalutationLabel,
  salutationSelectOptions,
} from '../../core/services/organizations/organization-master-select.util';
import { TasksService } from '../../core/services/tasks.service';
import type { ContactRow } from '../contacts/contacts.component';
import type { DealOwnerOption, DealPipelineStatus, DealRow } from '../deals/deals.component';
import { LeadOwnerOptionsService } from '../../core/services/leads/lead-owner-options.service';
import { LeadRoundRobinService } from '../../core/services/leads/lead-round-robin.service';
import type { LeadRow, LeadStatus } from '../leads/lead-row.model';
import type { OrganizationRow } from '../organizations/organizations.component';
import type { NoteRelatedType, NoteRow, NoteVisibility } from '../notes/notes.component';
import { parseRevenueInputToNumber } from '../../shared/utils/revenue-parse';
import {
  optionalEmailValidator,
  optionalMobile10Validator,
  optionalPhoneValidator,
  optionalUrlValidator,
} from '../../shared/validators/crm-validators';
import type { AssigneeOption, TaskPriority, TaskRow, TaskStatus } from '../tasks/tasks.component';
import { resolveNumericRecordOwnerUserId } from '../../shared/utils/record-owner-user-id.util';
import { initialsFromDisplayName } from '../../core/services/leads/lead-owner-options.service';
import { splitFullName } from '../leads/lead-full-name.util';

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
  private readonly leadsService = inject(LeadsService);
  private readonly toast = inject(ToastService);
  private readonly dealsService = inject(DealsService);
  private readonly contactsService = inject(ContactsService);
  private readonly organizationsService = inject(OrganizationsService);
  protected readonly orgMaster = inject(OrganizationMasterSelectService);
  protected readonly dealMaster = inject(DealMasterSelectService);
  private readonly tasksService = inject(TasksService);
  private readonly notesService = inject(NotesService);
  protected readonly auth = inject(AuthService);
  private readonly leadOwnerOpts = inject(LeadOwnerOptionsService);
  private readonly leadRoundRobin = inject(LeadRoundRobinService);
  private readonly leadMasterData = inject(LeadMasterDataService);

  private readonly salutationsFromApi = signal<MasterDataOption[]>([]);
  private readonly leadStatusesFromApi = signal<MasterDataOption[]>([]);
  protected readonly salutationSelectOptions = computed(() =>
    salutationSelectOptions(this.salutationsFromApi()),
  );
  protected readonly leadStatusSelectOptions = computed(() => {
    const api = this.leadStatusesFromApi();
    const base = api.length > 0 ? api : [...FALLBACK_LEAD_STATUS_OPTIONS];
    return ensureConvertedInLeadStatusOptions(base);
  });

  protected isLeadStatusSelectable(opt: MasterDataOption): boolean {
    return isSelectableLeadStatusOption(opt);
  }
  protected readonly masterOptionFormValue = masterOptionFormValue;

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

  protected readonly leadOwnerOptions = this.leadOwnerOpts.options;
  protected readonly isAdminViewer = computed(() => isAdmin(this.auth.user()));

  protected readonly leadSubmitting = signal(false);

  protected readonly dealOwnerOptions = this.leadOwnerOpts.options;
  protected readonly dealStatuses = this.dealMaster.statusSelectOptions;

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

  protected readonly assigneeOptions = this.leadOwnerOpts.options;

  protected readonly noteRelatedTypeOptions = [
    { value: 'lead', label: 'Lead' },
    { value: 'deal', label: 'Deal' },
    { value: 'contact', label: 'Contact' },
    { value: 'organization', label: 'Organization' },
  ] as const;

  protected readonly leadForm = this.fb.nonNullable.group({
    salutation: [''],
    lastName: ['', [Validators.required, Validators.maxLength(120)]],
    mobile: ['', [optionalMobile10Validator()]],
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(160)]],
    gender: [''],
    organization: ['', [Validators.required, Validators.maxLength(160)]],
    employees: ['1-10'],
    annualRevenue: ['', Validators.maxLength(32)],
    territory: [''],
    industry: ['Technology', Validators.required],
    status: this.fb.nonNullable.control<LeadStatus>('New', Validators.required),
    leadOwner: ['', Validators.required],
    requestType: [''],
    requirement: ['', [Validators.required, Validators.maxLength(240)]],
    customField: ['', Validators.maxLength(240)],
    website: ['', [Validators.maxLength(200), optionalUrlValidator()]],
  });

  protected readonly dealForm = this.fb.nonNullable.group({
    organizationName: ['', [Validators.required, Validators.maxLength(200)]],
    employees: ['1-10'],
    annualRevenue: ['', Validators.maxLength(40)],
    website: ['', [Validators.maxLength(200), optionalUrlValidator()]],
    territory: [''],
    industry: ['Technology', Validators.required],
    salutation: [''],
    fullName: ['', [Validators.required, Validators.maxLength(200)]],
    primaryMobile: ['', [Validators.maxLength(40), optionalPhoneValidator()]],
    primaryEmail: ['', [Validators.maxLength(160), optionalEmailValidator()]],
    gender: [''],
    status: this.fb.nonNullable.control<string>(DEFAULT_DEAL_PIPELINE_STATUS, Validators.required),
    dealOwner: [this.leadOwnerOpts.defaultOwnerId(), Validators.required],
    requirement: ['', Validators.maxLength(240)],
  });

  protected readonly contactForm = this.fb.nonNullable.group({
    salutation: [''],
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    lastName: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(160)]],
    mobile: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
    gender: [''],
    companyName: ['', [Validators.required, Validators.maxLength(200)]],
    designation: ['', Validators.maxLength(120)],
    address: [''],
  });

  protected readonly orgForm = this.fb.nonNullable.group({
    organizationName: ['', [Validators.required, Validators.maxLength(200)]],
    website: ['', [Validators.maxLength(200), optionalUrlValidator()]],
    industry: ['', Validators.required],
    annualRevenue: ['', Validators.maxLength(40)],
    employees: [''],
    territory: [''],
  });

  protected readonly taskForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', Validators.maxLength(2000)],
    status: this.fb.nonNullable.control<TaskStatus>('Backlog', Validators.required),
    assignee: ['', Validators.required],
    dueDate: ['', Validators.required],
    priority: this.fb.nonNullable.control<TaskPriority>('Low', Validators.required),
  });

  protected readonly noteForm = this.fb.nonNullable.group({
    relatedType: ['deal', Validators.required],
    relatedName: ['', [Validators.required, Validators.maxLength(200)]],
    title: ['', [Validators.required, Validators.maxLength(200)]],
    body: ['', [Validators.required, Validators.maxLength(8000)]],
    visibility: ['team', Validators.required],
  });

  constructor() {
    effect(() => {
      const k = this.flow.formKind();
      if (!k) {
        return;
      }
      untracked(() => {
        this.resetFor(k);
        this.leadOwnerOpts.load();
        this.dealMaster.ensureStatusesLoaded().pipe(take(1)).subscribe();
        if (k === 'lead' || k === 'deal' || k === 'contact') {
          this.leadMasterData
            .loadSalutations()
            .pipe(take(1))
            .subscribe((rows) => this.salutationsFromApi.set(rows));
        }
        if (k === 'lead') {
          this.leadMasterData
            .loadLeadStatuses()
            .pipe(take(1))
            .subscribe((rows) => this.leadStatusesFromApi.set(rows));
        }
        if (k === 'organization') {
          this.orgMaster.ensureLoaded().pipe(take(1)).subscribe();
        }
      });
    });
  }

  protected close(): void {
    this.flow.closeFormModal();
  }

  protected orgMasterOptValue(opt: MasterDataOption): string {
    return masterOptionFormValue(opt);
  }

  private defaultOrgModalIndustry(): string {
    const o = this.orgMaster.industrySelectOptions()[0];
    return o ? masterOptionFormValue(o) : '';
  }

  private defaultOrgModalEmployees(): string {
    const o = this.orgMaster.employeeSelectOptions()[0];
    return o ? masterOptionFormValue(o) : '';
  }

  private taskFormRecordOwnerUserId(): string | undefined {
    return resolveNumericRecordOwnerUserId(
      this.flow.taskFromLeadFormContext()?.recordOwnerUserId,
    );
  }

  private noteFormRecordOwnerUserId(): string | undefined {
    return resolveNumericRecordOwnerUserId(
      this.flow.noteFromLeadFormContext()?.recordOwnerUserId,
    );
  }

  protected taskAssigneeLockedToRecordOwner(): boolean {
    return !!this.taskFormRecordOwnerUserId();
  }

  protected taskRecordOwnerLabel(): string {
    const id = this.taskFormRecordOwnerUserId();
    if (!id) return '';
    return this.leadOwnerOpts.findById(id)?.label ?? `User #${id}`;
  }

  protected noteAuthorLockedToRecordOwner(): boolean {
    return !!this.noteFormRecordOwnerUserId();
  }

  protected noteRecordOwnerLabel(): string {
    const id = this.noteFormRecordOwnerUserId();
    if (!id) return '';
    return this.leadOwnerOpts.findById(id)?.label ?? `User #${id}`;
  }

  private resolveAssigneeFromOwnerUserId(ownerUserId: string | undefined): {
    id: string;
    label: string;
    initials: string;
  } | null {
    const id = resolveNumericRecordOwnerUserId(ownerUserId);
    if (!id) return null;
    const opt = this.leadOwnerOpts.findById(id);
    if (opt) {
      return { id: opt.id, label: opt.label, initials: opt.initials };
    }
    return { id, label: `User #${id}`, initials: initialsFromDisplayName(`User #${id}`) };
  }

  private defaultTaskAssigneeId(): string {
    const recordOwner = this.taskFormRecordOwnerUserId();
    if (recordOwner) return recordOwner;
    const sessionId = this.auth.user()?.id?.trim();
    if (sessionId && this.leadOwnerOpts.findById(sessionId)) return sessionId;
    return this.leadOwnerOpts.options()[0]?.id ?? '';
  }

  private defaultLeadOwnerForForm(): string {
    if (this.isAdminViewer()) {
      return this.leadRoundRobin.nextOwnerIdForForm();
    }
    return this.leadOwnerOpts.defaultOwnerId();
  }

  protected leadOwnerDisplayLabel(): string {
    const id = this.leadForm.controls.leadOwner.value?.trim() ?? '';
    return this.leadOwnerOpts.findById(id)?.label ?? this.auth.user()?.name?.trim() ?? 'You';
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
          leadOwner: this.defaultLeadOwnerForForm(),
          requestType: '',
          requirement: '',
          customField: '',
        });
        this.leadForm.markAsUntouched();
        break;
      case 'deal':
        this.dealForm.reset({
          organizationName: '',
          employees: masterOptionFormValue(this.dealMaster.employeeSelectOptions()[0] ?? { id: 0, name: '1-10' }),
          annualRevenue: '',
          website: '',
          territory: '',
          industry: masterOptionFormValue(this.dealMaster.industrySelectOptions()[0] ?? { id: 0, name: 'Technology' }),
          salutation: '',
          fullName: '',
          primaryMobile: '',
          primaryEmail: '',
          gender: '',
          status: masterSelectControlValue(
            undefined,
            DEFAULT_DEAL_PIPELINE_STATUS,
            this.dealMaster.statusSelectOptions(),
          ),
          dealOwner: this.leadOwnerOpts.defaultOwnerId(),
          requirement: '',
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
          industry: this.defaultOrgModalIndustry(),
          annualRevenue: '',
          employees: this.defaultOrgModalEmployees(),
          territory: '',
        });
        this.orgForm.markAsUntouched();
        break;
      case 'task': {
        const assigneeCtl = this.taskForm.get('assignee');
        const ownerLocked = this.taskAssigneeLockedToRecordOwner();
        this.taskForm.reset({
          title: '',
          description: '',
          status: 'Backlog',
          assignee: this.defaultTaskAssigneeId(),
          dueDate: this.localDatetimeInputValue(),
          priority: 'Low',
        });
        if (ownerLocked) {
          assigneeCtl?.disable({ emitEvent: false });
        } else {
          assigneeCtl?.enable({ emitEvent: false });
        }
        this.taskForm.markAsUntouched();
        break;
      }
      case 'note': {
        const rtCtl = this.noteForm.get('relatedType');
        const rnCtl = this.noteForm.get('relatedName');
        rtCtl?.enable({ emitEvent: false });
        rnCtl?.enable({ emitEvent: false });
        const ctx = this.flow.noteFromLeadFormContext();
        if (ctx?.relatedLeadId) {
          this.noteForm.reset({
            relatedType: 'lead',
            relatedName: ctx.leadRelatedName ?? '',
            title: '',
            body: '',
            visibility: 'team',
          });
          rtCtl?.disable({ emitEvent: false });
          rnCtl?.disable({ emitEvent: false });
        } else if (ctx?.relatedDealId) {
          this.noteForm.reset({
            relatedType: 'deal',
            relatedName: ctx.dealRelatedName ?? '',
            title: '',
            body: '',
            visibility: 'team',
          });
          rtCtl?.disable({ emitEvent: false });
          rnCtl?.disable({ emitEvent: false });
        } else {
          this.noteForm.reset({
            relatedType: 'deal',
            relatedName: '',
            title: '',
            body: '',
            visibility: 'team',
          });
        }
        this.noteForm.markAsUntouched();
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
    group: 'lead' | 'deal' | 'contact' | 'org' | 'task' | 'note',
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
      case 'note':
        return this.noteForm;
    }
  }

  protected fieldInvalid(
    group: 'lead' | 'deal' | 'contact' | 'org' | 'task' | 'note',
    name: string,
  ): boolean {
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

  protected async submitLead(): Promise<void> {
    this.leadForm.markAllAsTouched();
    if (this.leadForm.invalid) return;

    const raw = this.leadForm.getRawValue();
    const emailTrim = raw.email.trim();

    if (isConvertedLeadStatusName(raw.status)) {
      this.toast.error(
        'Converted status is set automatically when you convert a lead to a deal.',
      );
      return;
    }

    const ownerId = this.isAdminViewer()
      ? raw.leadOwner
      : this.leadOwnerOpts.defaultOwnerId() || raw.leadOwner;
    const ownerOpt = this.leadOwnerOpts.findById(ownerId);
    const initials = ownerOpt?.initials ?? ownerId;
    const leadOwnerName = ownerOpt?.label ?? ownerId;

    const salPick = resolveOrgMasterPick(raw.salutation, this.salutationSelectOptions());

    const payload: Omit<LeadRow, 'id'> = {
      salutation: salPick.label || undefined,
      salutationId: salPick.masterId ?? null,
      firstName: raw.firstName.trim(),
      lastName: raw.lastName.trim(),
      name: this.buildDisplayName(salPick.label, raw.firstName, raw.lastName),
      mobile: raw.mobile.trim(),
      leadOwnerId: ownerId,
      gender: raw.gender || undefined,
      email: emailTrim,
      organization: raw.organization.trim(),
      employees: raw.employees,
      annualRevenue: raw.annualRevenue.trim() || undefined,
      website: raw.website.trim() || undefined,
      territory: raw.territory || undefined,
      industry: raw.industry,
      status: raw.status,
      leadStatusId: resolveLeadStatusIdFromName(raw.status) ?? undefined,
      requestType: raw.requestType || undefined,
      requirement: raw.requirement.trim(),
      notes: composeLeadNotesForApi(raw.requirement, raw.customField) || undefined,
      leadOwnerName,
      owner: initials,
      updated: 'Just now',
      leadSource: 'Manual',
    };

    this.leadSubmitting.set(true);
    try {
      const saved = await this.leadsService.createAsync(payload);
      this.bus.publish('lead', saved);
      this.flow.closeFormModal();
      this.toast.success('Lead created.');
    } catch (e) {
      this.toast.error(leadsHttpErrorMessage(e));
    } finally {
      this.leadSubmitting.set(false);
    }
  }

  protected submitDeal(): void {
    this.dealForm.markAllAsTouched();
    if (this.dealForm.invalid) return;

    const raw = this.dealForm.getRawValue();
    const emailTrim = raw.primaryEmail.trim();
    const owner = this.dealOwnerOptions().find((o) => o.id === raw.dealOwner);
    const salPick = resolveOrgMasterPick(raw.salutation, this.dealMaster.salutationSelectOptions());
    const empPick = resolveOrgMasterPick(raw.employees, this.dealMaster.employeeSelectOptions());
    const terrPick = resolveOrgMasterPick(raw.territory, this.dealMaster.territorySelectOptions());
    const indPick = resolveOrgMasterPick(raw.industry, this.dealMaster.industrySelectOptions());
    const statPick = resolveOrgMasterPick(raw.status, this.dealMaster.statusSelectOptions());
    const salLabel = resolveSalutationLabel(raw.salutation, this.dealMaster.salutationSelectOptions());
    const { firstName, lastName } = splitFullName(raw.fullName);

    const payload: Omit<DealRow, 'id'> = {
      organizationName: raw.organizationName.trim(),
      employees: empPick.label.trim() || '1-10',
      employeeCountId: empPick.masterId,
      annualRevenue: parseRevenueInputToNumber(raw.annualRevenue),
      website: raw.website.trim(),
      territory: terrPick.label.trim(),
      territoryId: terrPick.masterId,
      industry: indPick.label.trim() || 'Technology',
      industryId: indPick.masterId,
      salutation: salLabel,
      salutationId: salPick.masterId,
      firstName,
      lastName,
      email: emailTrim,
      mobile: raw.primaryMobile.trim(),
      gender: raw.gender,
      status: resolveDealStatusLabel(statPick.label || raw.status),
      dealStatusId: statPick.masterId,
      dealOwnerId: raw.dealOwner,
      assignedToUserId: raw.dealOwner,
      assignedTo: owner?.label ?? '',
      assignedInitials: owner?.initials ?? '',
      lastModified: 'Just now',
      probabilityPercent: 10,
      nextStep: '',
      requirement: raw.requirement.trim() || undefined,
    };

    this.dealsService
      .create(payload)
      .pipe(take(1))
      .subscribe({
        next: (saved) => {
          this.bus.publish('deal', saved);
          this.flow.closeFormModal();
          this.toast.success('Deal created.');
        },
        error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
      });
  }

  protected submitContact(): void {
    this.contactForm.markAllAsTouched();
    if (this.contactForm.invalid) return;

    const raw = this.contactForm.getRawValue();
    const payload: Omit<ContactRow, 'id'> = {
      salutation: resolveSalutationLabel(raw.salutation, this.salutationSelectOptions()),
      firstName: raw.firstName.trim(),
      lastName: raw.lastName.trim(),
      email: raw.email.trim(),
      phone: raw.mobile.trim(),
      gender: raw.gender,
      organization: raw.companyName.trim(),
      designation: raw.designation.trim(),
      address: raw.address,
      lastModified: 'Just now',
    };

    this.contactsService
      .create(payload)
      .pipe(take(1))
      .subscribe({
        next: (saved) => {
          this.bus.publish('contact', saved);
          this.flow.closeFormModal();
          this.toast.success('Contact created.');
        },
        error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
      });
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
    const industryPick = resolveOrgMasterPick(raw.industry, this.orgMaster.industrySelectOptions());
    const employeePick = resolveOrgMasterPick(raw.employees, this.orgMaster.employeeSelectOptions());
    const territoryPick = resolveOrgMasterPick(raw.territory, this.orgMaster.territorySelectOptions());

    const payload: Omit<OrganizationRow, 'id'> = {
      name: nameTrim,
      website: web || '',
      industry:
        industryPick.label ||
        this.orgMaster.industrySelectOptions()[0]?.name ||
        'Technology',
      annualRevenue: parseRevenueInputToNumber(raw.annualRevenue),
      employees:
        employeePick.label ||
        this.orgMaster.employeeSelectOptions()[0]?.name ||
        '1-10',
      territory: territoryPick.label.trim() || undefined,
      industryId: industryPick.masterId,
      employeeCountId: employeePick.masterId,
      territoryId: territoryPick.masterId,
      lastModified: 'Just now',
    };

    this.organizationsService
      .create(payload)
      .pipe(take(1))
      .subscribe({
        next: (saved) => {
          this.bus.publish('organization', saved);
          this.flow.closeFormModal();
          this.toast.success('Organization created.');
        },
        error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
      });
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
    const forcedOwner = this.resolveAssigneeFromOwnerUserId(
      this.flow.taskFromLeadFormContext()?.recordOwnerUserId,
    );
    const person =
      forcedOwner ??
      this.leadOwnerOpts.findById(raw.assignee) ??
      this.assigneeOptions().find((a) => a.id === raw.assignee);
    const dueRaw = raw.dueDate.trim();
    const dueDisplay = dueRaw ? this.formatDueDisplay(dueRaw) : '—';
    const assigneeUserId = person?.id?.trim();

    const payload: Omit<TaskRow, 'id'> = {
      title: raw.title.trim(),
      description: raw.description.trim(),
      status: raw.status,
      priority: raw.priority,
      dueDate: dueDisplay,
      dueDateRaw: dueRaw,
      assignedTo: person?.label ?? raw.assignee,
      assignedInitials: person?.initials ?? '?',
      assignedToUserId:
        assigneeUserId && /^\d+$/.test(assigneeUserId) ? assigneeUserId : undefined,
      lastModified: 'Just now',
    };
    const leadCtx = this.flow.taskFromLeadFormContext();
    if (leadCtx?.relatedLeadId) {
      payload.relatedLeadId = leadCtx.relatedLeadId;
    }
    if (leadCtx?.relatedDealId) {
      payload.relatedDealId = leadCtx.relatedDealId;
    }

    this.tasksService
      .create(payload)
      .pipe(take(1))
      .subscribe({
        next: (saved) => {
          this.bus.publish('task', saved);
          this.flow.closeFormModal();
          this.toast.success('Task created.');
        },
        error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
      });
  }

  protected submitModalNote(): void {
    this.noteForm.markAllAsTouched();
    if (this.noteForm.invalid) return;

    const raw = this.noteForm.getRawValue();
    const body = raw.body.trim();
    const bodyPreview = body.length > 140 ? `${body.slice(0, 140)}…` : body;

    const forcedOwner = this.resolveAssigneeFromOwnerUserId(
      this.flow.noteFromLeadFormContext()?.recordOwnerUserId,
    );
    const sessionUser = this.auth.user();
    const author = (forcedOwner?.label ?? sessionUser?.name?.trim()) || 'You';
    const authorUserId = forcedOwner?.id ?? sessionUser?.id?.trim();

    const payload: Omit<NoteRow, 'id'> = {
      title: raw.title.trim(),
      relatedType: raw.relatedType as NoteRelatedType,
      relatedName: raw.relatedName.trim(),
      visibility: raw.visibility as NoteVisibility,
      body,
      author,
      authorUserId: authorUserId && /^\d+$/.test(authorUserId) ? authorUserId : undefined,
      when: 'Just now',
      bodyPreview,
    };
    const leadCtx = this.flow.noteFromLeadFormContext();
    if (leadCtx?.relatedLeadId) {
      payload.relatedLeadId = leadCtx.relatedLeadId;
    }
    if (leadCtx?.relatedDealId) {
      payload.relatedDealId = leadCtx.relatedDealId;
    }

    this.notesService
      .create(payload)
      .pipe(take(1))
      .subscribe({
        next: (saved) => {
          this.bus.publish('note', saved);
          this.flow.closeFormModal();
          this.toast.success('Note created.');
        },
        error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
      });
  }

}
