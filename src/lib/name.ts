/**
 * Everyone at the table is "Ayo A." — full first name, last initial.
 *
 * Enough for a room of friends to tell two Sams apart, and no more of anyone's
 * name on a shared screen than that needs.
 */

export function formatPlayerName(firstName: string, lastInitial: string): string {
  const first = cleanFirstName(firstName);
  const initial = cleanInitial(lastInitial);
  if (!first) return '';
  return initial ? `${first} ${initial}.` : first;
}

export function cleanFirstName(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, ' ').slice(0, 20);
  if (!trimmed) return '';
  // Keep the capitalisation people type — "de Luca", "MacKay" — but fix "ayo".
  return trimmed[0].toUpperCase() + trimmed.slice(1);
}

export function cleanInitial(input: string): string {
  const letter = input.trim().replace(/[^\p{L}]/gu, '').slice(0, 1);
  return letter ? letter.toUpperCase() : '';
}

export type NameProblem = 'no-first-name' | 'no-initial' | null;

export function validateName(firstName: string, lastInitial: string): NameProblem {
  if (!cleanFirstName(firstName)) return 'no-first-name';
  if (!cleanInitial(lastInitial)) return 'no-initial';
  return null;
}

/** Pull first name and initial back out of a stored "Ayo A." */
export function splitPlayerName(displayName: string | null | undefined): {
  firstName: string;
  lastInitial: string;
} {
  const value = (displayName ?? '').trim();
  if (!value) return { firstName: '', lastInitial: '' };
  const parts = value.split(/\s+/);
  return {
    firstName: cleanFirstName(parts[0] ?? ''),
    lastInitial: cleanInitial(parts[1] ?? ''),
  };
}
