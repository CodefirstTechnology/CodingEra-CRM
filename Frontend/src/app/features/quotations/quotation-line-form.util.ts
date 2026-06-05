import { FormBuilder, FormGroup, Validators } from '@angular/forms';

export function createQuotationLineGroup(fb: FormBuilder): FormGroup {
  return fb.nonNullable.group({
    itemCode: [''],
    itemName: ['', Validators.required],
    description: [''],
    quantity: [1, [Validators.required, Validators.min(0.0001)]],
    uom: ['Nos'],
    weight: [0, [Validators.min(0)]],
    unitWeight: [0, [Validators.min(0)]],
    rate: [0, [Validators.required, Validators.min(0)]],
    discountPercent: [0, [Validators.min(0), Validators.max(100)]],
    gstPercent: [0, [Validators.min(0)]],
    amount: [{ value: 0, disabled: true }],
    taxAmount: [{ value: 0, disabled: true }],
    lineTotal: [{ value: 0, disabled: true }],
  });
}

export interface QuotationLineFormValue {
  itemCode: string;
  itemName: string;
  description: string;
  quantity: number;
  uom: string;
  weight: number;
  unitWeight: number;
  rate: number;
  discountPercent: number;
  gstPercent: number;
  amount: number;
  taxAmount: number;
  lineTotal: number;
}
