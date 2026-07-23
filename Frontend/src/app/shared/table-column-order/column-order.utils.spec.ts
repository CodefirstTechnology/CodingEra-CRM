import {
  columnOrderStorageKey,
  mergeColumnOrder,
  reorderColumnIds,
  sortByColumnOrder,
} from './column-order.utils';

describe('column-order.utils', () => {
  describe('columnOrderStorageKey', () => {
    it('appends userId when present', () => {
      expect(columnOrderStorageKey('crm.leadsColumnOrder', '42')).toBe('crm.leadsColumnOrder.42');
    });

    it('uses prefix alone when userId missing', () => {
      expect(columnOrderStorageKey('crm.leadsColumnOrder', null)).toBe('crm.leadsColumnOrder');
      expect(columnOrderStorageKey('crm.leadsColumnOrder', '  ')).toBe('crm.leadsColumnOrder');
    });
  });

  describe('mergeColumnOrder', () => {
    const preferred = ['name', 'source', 'requirement', 'status', 'owner'];
    const available = ['name', 'source', 'requirement', 'status', 'owner', 'email'];

    it('uses preferred when no saved order', () => {
      expect(mergeColumnOrder(preferred, available, null)).toEqual([
        'name',
        'source',
        'requirement',
        'status',
        'owner',
        'email',
      ]);
    });

    it('keeps saved relative order and appends new columns', () => {
      const saved = ['owner', 'name', 'status', 'source', 'requirement'];
      expect(mergeColumnOrder(preferred, available, saved)).toEqual([
        'owner',
        'name',
        'status',
        'source',
        'requirement',
        'email',
      ]);
    });

    it('drops ids that are no longer available', () => {
      const saved = ['name', 'gone', 'status'];
      expect(mergeColumnOrder(preferred, ['name', 'status', 'owner'], saved)).toEqual([
        'name',
        'status',
        'owner',
      ]);
    });

    it('dedupes and ignores empty saved by falling back to preferred', () => {
      expect(mergeColumnOrder(preferred, preferred, [])).toEqual([...preferred]);
    });
  });

  describe('reorderColumnIds', () => {
    it('moves an item forward', () => {
      expect(reorderColumnIds(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    });

    it('moves an item backward', () => {
      expect(reorderColumnIds(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    });

    it('returns a copy when indices are invalid or equal', () => {
      const order = ['a', 'b'];
      expect(reorderColumnIds(order, 1, 1)).toEqual(['a', 'b']);
      expect(reorderColumnIds(order, -1, 0)).toEqual(['a', 'b']);
      expect(reorderColumnIds(order, 0, 5)).toEqual(['a', 'b']);
    });
  });

  describe('sortByColumnOrder', () => {
    it('sorts items by order ids', () => {
      const items = [{ id: 'b' }, { id: 'a' }, { id: 'c' }];
      expect(sortByColumnOrder(items, ['a', 'c', 'b']).map((x) => x.id)).toEqual(['a', 'c', 'b']);
    });
  });
});
