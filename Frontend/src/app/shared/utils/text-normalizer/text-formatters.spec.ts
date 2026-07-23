import {
  formatAddress,
  formatCompanyName,
  formatCurrency,
  formatDate,
  formatDescription,
  formatEmail,
  formatGender,
  formatGstin,
  formatIndustry,
  formatItemGroup,
  formatMobile,
  formatPercentage,
  formatPersonName,
  formatRequirement,
  formatRole,
  formatSearch,
  formatStatus,
  formatTerritory,
  formatTitle,
  formatUrl,
  formatWebsite,
} from './text-formatters';
import {
  collapseSpaces,
  isProtectedKey,
  replaceSmartQuotes,
  sanitizeBase,
  stripInjectionVectors,
} from './text-sanitize';
import { normalizePayload } from './normalize-payload';
import { TextFormatter } from './index';

describe('formatPersonName', () => {
  const expectName = (input: string, expected: string) => {
    expect(formatPersonName(input).value).toBe(expected);
  };

  it('title-cases and expands initials with honorific + comma', () => {
    expectName('Mr. SAWANT, I I SHREE I I', 'Mr. Sawant, I. I. Shree I. I.');
  });

  it('normalizes honorifics', () => {
    expectName('MR SAWANT', 'Mr. Sawant');
    expectName('mr sawant', 'Mr. Sawant');
    expectName('Mr SAWANT', 'Mr. Sawant');
    expectName('MR. SAWANT', 'Mr. Sawant');
    expectName('DR smith', 'Dr. Smith');
    expectName('smt. patil', 'Smt. Patil');
    expectName('CA sharma', 'CA Sharma');
  });

  it('formats spaced initials', () => {
    expectName('A P SINGH', 'A. P. Singh');
    expectName('I I SHREE', 'I. I. Shree');
  });

  it('preserves compact initials', () => {
    expectName('A.P. SINGH', 'A.P. Singh');
  });

  it('handles commas, apostrophes, hyphens, Mc', () => {
    expectName('SAWANT, SHREE', 'Sawant, Shree');
    expectName("O'CONNOR", "O'Connor");
    expectName('ANNA-MARIA', 'Anna-Maria');
    expectName('McDONALD', 'McDonald');
  });

  it('collapses spaces and strips invisible chars', () => {
    expectName('  john\u200B   doe  ', 'John Doe');
  });

  it('replaces smart quotes in names', () => {
    expectName('O\u2019BRIEN', "O'Brien");
  });
});

describe('formatCompanyName', () => {
  it('title-cases while preserving brand camelCase and suffixes', () => {
    expect(formatCompanyName('CodingEra SOFTWARE pvt ltd').value).toBe(
      'CodingEra Software Pvt Ltd',
    );
  });

  it('preserves LLP LLC and ampersand', () => {
    expect(formatCompanyName('acme & sons llp').value).toBe('Acme & Sons LLP');
    expect(formatCompanyName('foo-bar LLC').value).toBe('Foo-Bar LLC');
  });
});

describe('formatEmail', () => {
  it('trims, lowercases, removes spaces', () => {
    expect(formatEmail('  Jane @Example.COM ').value).toBe('jane@example.com');
    expect(formatEmail('Jane @Example.COM ').valid).toBe(true);
  });

  it('rejects invalid', () => {
    expect(formatEmail('not-an-email').valid).toBe(false);
  });
});

describe('formatWebsite / formatUrl', () => {
  it('normalizes protocol, host, trailing slash', () => {
    expect(formatWebsite('HTTPS://Google.COM/').value).toBe('https://google.com');
  });

  it('preserves path case and collapses duplicate slashes', () => {
    expect(formatUrl('HTTPS://Example.COM//Path/Here').value).toBe(
      'https://example.com/Path/Here',
    );
  });

  it('removes duplicate protocols', () => {
    expect(formatUrl('https://https://example.com').value).toBe('https://example.com');
  });
});

describe('formatMobile', () => {
  it('normalizes spaced and dashed numbers', () => {
    expect(formatMobile('+91 98765 43210').value).toBe('+919876543210');
    expect(formatMobile('98765-43210').value).toBe('9876543210');
  });
});

describe('formatGstin', () => {
  it('uppercases and strips spaces', () => {
    const raw = '27aabcu9603r1zm';
    expect(formatGstin(raw).value).toBe('27AABCU9603R1ZM');
    expect(formatGstin(raw).valid).toBe(true);
  });

  it('rejects bad length', () => {
    expect(formatGstin('27AABCU9603R1').valid).toBe(false);
  });
});

describe('formatCurrency', () => {
  it('uppercases supported codes', () => {
    expect(formatCurrency('inr').value).toBe('INR');
    expect(formatCurrency('usd').valid).toBe(true);
  });

  it('rejects unsupported', () => {
    expect(formatCurrency('XXX').valid).toBe(false);
  });
});

describe('formatItemGroup / territory / industry', () => {
  it('title-cases', () => {
    expect(formatItemGroup('raw MATERIALS').value).toBe('Raw Materials');
    expect(formatTerritory('west  zone').value).toBe('West Zone');
    expect(formatIndustry('information TECHNOLOGY').value).toBe('Information Technology');
  });
});

describe('formatAddress / description / requirement / title', () => {
  it('preserves address line breaks', () => {
    expect(formatAddress('  Line1  \n\n  Line2  ').value).toBe('Line1\n\nLine2');
  });

  it('sentence-cases requirement first letter and collapses !!', () => {
    expect(formatRequirement('need CRM!!').value).toBe('Need CRM!');
  });

  it('cleans description whitespace', () => {
    expect(formatDescription('  hello   world  ').value).toBe('hello world');
  });

  it('sentence-cases titles', () => {
    expect(formatTitle('FOLLOW UP WITH CLIENT').value).toBe('Follow up with client');
  });
});

describe('formatStatus / role / gender', () => {
  it('canonicalizes', () => {
    expect(formatStatus('open').value).toBe('Open');
    expect(formatStatus('OPEN').value).toBe('Open');
    expect(formatStatus('closed won').value).toBe('Closed Won');
    expect(formatRole('admin').value).toBe('Admin');
    expect(formatRole('sales manager').value).toBe('Sales Manager');
    expect(formatGender('male').value).toBe('Male');
  });
});

describe('formatPercentage / formatDate / formatSearch', () => {
  it('parses percentages', () => {
    expect(formatPercentage('18 %').value).toBe(18);
    expect(formatPercentage('18%').value).toBe(18);
    expect(formatPercentage('150').valid).toBe(false);
  });

  it('normalizes dates to ISO', () => {
    expect(formatDate('21/07/2026').value).toBe('2026-07-21');
    expect(formatDate('2026-02-30').valid).toBe(false);
  });

  it('lowercases search', () => {
    expect(formatSearch('  Hello   WORLD ').value).toBe('hello world');
  });
});

describe('global sanitizer', () => {
  it('NFC, zero-width, smart quotes, injection', () => {
    expect(sanitizeBase('a\u200Bc').includes('\u200B')).toBe(false);
    expect(replaceSmartQuotes('\u201Cquote\u201D')).toBe('"quote"');
    expect(stripInjectionVectors('<script>x</script>hi').includes('<script>')).toBe(false);
    expect(collapseSpaces('a    b')).toBe('a b');
  });
});

describe('never normalize + payload', () => {
  it('protects secrets', () => {
    expect(isProtectedKey('password')).toBe(true);
    expect(isProtectedKey('refreshToken')).toBe(true);
    expect(isProtectedKey('jwt')).toBe(true);
    expect(isProtectedKey('fileName')).toBe(true);
  });

  it('normalizePayload skips protected keys', () => {
    const out = normalizePayload(
      { email: ' A@B.COM ', password: '  AbC  ', firstName: 'JOHN' },
      { onlyKnownFields: true },
    );
    expect(out['email']).toBe('a@b.com');
    expect(out['password']).toBe('  AbC  ');
    expect(out['firstName']).toBe('John');
  });

  it('TextFormatter facade matches', () => {
    expect(TextFormatter.personName('MR SAWANT')).toBe('Mr. Sawant');
    expect(TextFormatter.companyName('acme pvt ltd')).toBe('Acme Pvt Ltd');
  });
});
