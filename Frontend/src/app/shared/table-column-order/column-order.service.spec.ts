import { TestBed } from '@angular/core/testing';
import { ColumnOrderService } from './column-order.service';
import { ColumnOrderStorageService } from './column-order-storage.service';
import type { ColumnOrderConfig } from './column-order.types';

describe('ColumnOrderService', () => {
  let service: ColumnOrderService;
  let storage: ColumnOrderStorageService;
  const prefix = 'crm.testColumnOrder';

  const config: ColumnOrderConfig = {
    storageKeyPrefix: prefix,
    preferredOrder: ['name', 'source', 'requirement', 'status'],
    getUserId: () => '7',
  };

  beforeEach(() => {
    localStorage.removeItem(`${prefix}.7`);
    TestBed.configureTestingModule({});
    service = TestBed.inject(ColumnOrderService);
    storage = TestBed.inject(ColumnOrderStorageService);
  });

  afterEach(() => {
    localStorage.removeItem(`${prefix}.7`);
  });

  it('resolveOrder returns preferred merge when nothing saved', () => {
    expect(service.resolveOrder(config, ['name', 'source', 'requirement', 'status', 'email'])).toEqual([
      'name',
      'source',
      'requirement',
      'status',
      'email',
    ]);
  });

  it('applyReorder persists and returns new order', () => {
    const next = service.applyReorder(config, ['name', 'source', 'requirement'], 0, 2);
    expect(next).toEqual(['source', 'requirement', 'name']);
    expect(storage.load(prefix, '7')).toEqual(['source', 'requirement', 'name']);
  });

  it('resetOrder clears storage and restores preferred merge', () => {
    storage.save(prefix, '7', ['status', 'name', 'source', 'requirement']);
    const reset = service.resetOrder(config, ['name', 'source', 'requirement', 'status', 'email']);
    expect(reset).toEqual(['name', 'source', 'requirement', 'status', 'email']);
    expect(storage.load(prefix, '7')).toBeNull();
  });

  it('reconcileOrder loads from storage when current is empty', () => {
    storage.save(prefix, '7', ['status', 'name', 'source', 'requirement']);
    const next = service.reconcileOrder(config, ['name', 'source', 'requirement', 'status'], []);
    expect(next).toEqual(['status', 'name', 'source', 'requirement']);
  });

  it('reconcileOrder returns same reference when unchanged', () => {
    const current = ['name', 'source', 'requirement', 'status'];
    const next = service.reconcileOrder(config, current, current);
    expect(next).toBe(current);
  });

  it('resolveOrder keeps saved order after hide/show simulation', () => {
    storage.save(prefix, '7', ['email', 'name', 'source', 'requirement', 'status']);
    const available = ['name', 'source', 'requirement', 'status', 'email'];
    expect(service.resolveOrder(config, available)).toEqual([
      'email',
      'name',
      'source',
      'requirement',
      'status',
    ]);
  });
});
