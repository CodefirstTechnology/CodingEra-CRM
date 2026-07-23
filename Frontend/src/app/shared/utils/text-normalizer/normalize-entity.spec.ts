import {
  formatEntityName,
  normalizeEntity,
  nameCategoryForEntity,
} from './normalize-entity';
import { resolveCrmEntityType } from './entity-types';
import { TextFormatter } from './index';

describe('entity-aware name routing', () => {
  describe('resolveCrmEntityType', () => {
    it('resolves aliases and master slugs', () => {
      expect(resolveCrmEntityType('Lead')).toBe('lead');
      expect(resolveCrmEntityType('lead-statuses')).toBe('leadStatus');
      expect(resolveCrmEntityType('industries')).toBe('industry');
      expect(resolveCrmEntityType('Organization')).toBe('organization');
      expect(resolveCrmEntityType('something-else')).toBe('unknown');
    });
  });

  describe('nameCategoryForEntity', () => {
    it('classifies person / company / master', () => {
      expect(nameCategoryForEntity('lead')).toBe('person');
      expect(nameCategoryForEntity('contact')).toBe('person');
      expect(nameCategoryForEntity('user')).toBe('person');
      expect(nameCategoryForEntity('employee')).toBe('person');
      expect(nameCategoryForEntity('organization')).toBe('company');
      expect(nameCategoryForEntity('industry')).toBe('master');
      expect(nameCategoryForEntity('territory')).toBe('master');
      expect(nameCategoryForEntity('itemGroup')).toBe('master');
      expect(nameCategoryForEntity('status')).toBe('master');
      expect(nameCategoryForEntity('unknown')).toBe('unknown');
    });
  });

  describe('formatEntityName', () => {
    it('formats Lead.name as person', () => {
      expect(formatEntityName('lead', 'MR SAWANT')).toBe('Mr. Sawant');
      expect(formatEntityName('lead', 'A P SINGH')).toBe('A. P. Singh');
      expect(formatEntityName('lead', "O'CONNOR")).toBe("O'Connor");
    });

    it('formats Contact / User / Employee as person', () => {
      expect(formatEntityName('contact', 'MR SAWANT')).toBe('Mr. Sawant');
      expect(formatEntityName('user', 'jane DOE')).toBe('Jane Doe');
      expect(formatEntityName('employee', 'A P SINGH')).toBe('A. P. Singh');
    });

    it('formats Organization.name as company', () => {
      expect(formatEntityName('organization', 'codingera software pvt ltd')).toBe(
        'Codingera Software Pvt Ltd',
      );
      // Mixed-case brand preserved when present
      expect(formatEntityName('organization', 'CodingEra SOFTWARE pvt ltd')).toBe(
        'CodingEra Software Pvt Ltd',
      );
    });

    it('formats Industry / Territory / ItemGroup / Status as master', () => {
      expect(formatEntityName('industry', 'information TECHNOLOGY')).toBe(
        'Information Technology',
      );
      expect(formatEntityName('territory', 'west  zone')).toBe('West Zone');
      expect(formatEntityName('itemGroup', 'steel sections')).toBe('Steel Sections');
      expect(formatEntityName('status', 'closed won')).toBe('Closed Won');
      expect(formatEntityName('lead-statuses', 'open')).toBe('Open');
    });

    it('unknown entity → sanitize only (no title case)', () => {
      expect(formatEntityName('unknown', '  HELLO   WORLD  ')).toBe('HELLO WORLD');
      expect(formatEntityName('foobar', '  HELLO   WORLD  ')).toBe('HELLO WORLD');
    });
  });

  describe('normalizeEntity', () => {
    it('routes payload.name by entity and still formats other known fields', () => {
      const lead = normalizeEntity('lead', {
        name: 'MR SAWANT',
        email: ' A@B.COM ',
        password: '  secret  ',
      });
      expect(lead['name']).toBe('Mr. Sawant');
      expect(lead['email']).toBe('a@b.com');
      expect(lead['password']).toBe('  secret  ');

      const org = normalizeEntity('organization', {
        name: 'acme pvt ltd',
        website: 'HTTPS://Example.COM/',
      });
      expect(org['name']).toBe('Acme Pvt Ltd');
      expect(org['website']).toBe('https://example.com');

      const industry = normalizeEntity('industry', { name: 'steel  sections' });
      expect(industry['name']).toBe('Steel Sections');
    });
  });

  describe('TextFormatter.entity facade', () => {
    it('matches normalizeEntity', () => {
      expect(TextFormatter.entity('contact', { name: 'MR SAWANT' })['name']).toBe('Mr. Sawant');
      expect(TextFormatter.entityName('organization', 'foo llp')).toBe('Foo LLP');
    });
  });
});
