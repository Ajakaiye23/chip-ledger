import { describe, expect, it } from 'vitest';
import { cleanFirstName, cleanInitial, formatPlayerName, splitPlayerName, validateName } from './name';

describe('player names', () => {
  it('formats as first name and last initial', () => {
    expect(formatPlayerName('Ayo', 'A')).toBe('Ayo A.');
    expect(formatPlayerName('sam', 'brooks')).toBe('Sam B.');
  });

  it('capitalises the first letter without wrecking the rest', () => {
    expect(cleanFirstName('mcallister')).toBe('Mcallister');
    expect(cleanFirstName('MacKay')).toBe('MacKay');
    expect(cleanFirstName('de Luca')).toBe('De Luca');
  });

  it('takes only a letter for the initial', () => {
    expect(cleanInitial('  b. ')).toBe('B');
    expect(cleanInitial('7')).toBe('');
    expect(cleanInitial('Ó')).toBe('Ó');
  });

  it('trims runaway input', () => {
    expect(cleanFirstName('  lots   of   space  ')).toBe('Lots of space');
    expect(cleanFirstName('x'.repeat(50))).toHaveLength(20);
  });

  it('says what is missing', () => {
    expect(validateName('', 'A')).toBe('no-first-name');
    expect(validateName('Ayo', '')).toBe('no-initial');
    expect(validateName('Ayo', 'A')).toBeNull();
  });

  it('reads a stored name back into its parts', () => {
    expect(splitPlayerName('Ayo A.')).toEqual({ firstName: 'Ayo', lastInitial: 'A' });
    expect(splitPlayerName('Ayo')).toEqual({ firstName: 'Ayo', lastInitial: '' });
    expect(splitPlayerName(null)).toEqual({ firstName: '', lastInitial: '' });
  });

  it('round-trips', () => {
    const { firstName, lastInitial } = splitPlayerName(formatPlayerName('Jordan', 'M'));
    expect(formatPlayerName(firstName, lastInitial)).toBe('Jordan M.');
  });
});
