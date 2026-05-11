import { Component, ElementRef, input, output, viewChild } from '@angular/core';

@Component({
  selector: 'app-crm-selection-bar',
  standalone: true,
  templateUrl: './crm-selection-bar.component.html',
  styleUrl: './crm-selection-bar.component.scss',
})
export class CrmSelectionBarComponent {
  selectionCount = input(0);
  canEdit = input(false);
  showAssignActions = input(false);
  showConvertLead = input(false);
  /** When false, Assign / Clear assignment stay visible but disabled (e.g. IndiaMART-only selection). */
  assignActionsEnabled = input(true);
  /** When false, Convert to deal stays visible but disabled. */
  convertLeadEnabled = input(true);

  edit = output<void>();
  delete = output<void>();
  assignTo = output<void>();
  clearAssignment = output<void>();
  convertToDeal = output<void>();
  dismiss = output<void>();

  private readonly menuRef = viewChild<ElementRef<HTMLDetailsElement>>('menuRef');

  protected closeMenu(): void {
    const el = this.menuRef()?.nativeElement;
    if (el) el.open = false;
  }

  protected onEdit(): void {
    this.edit.emit();
    this.closeMenu();
  }

  protected onDelete(): void {
    this.delete.emit();
    this.closeMenu();
  }

  protected onAssignTo(): void {
    this.assignTo.emit();
    this.closeMenu();
  }

  protected onClearAssignment(): void {
    this.clearAssignment.emit();
    this.closeMenu();
  }

  protected onConvertToDeal(): void {
    this.convertToDeal.emit();
    this.closeMenu();
  }

  protected onDismiss(): void {
    this.closeMenu();
    this.dismiss.emit();
  }
}
