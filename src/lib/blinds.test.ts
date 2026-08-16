import { describe, expect, it } from 'vitest';
import { blindsFor, blindsLabel, seatedPlayers } from './blinds';
import type { GamePlayer } from './types';

const seat = (id: string, minute: number, status: GamePlayer['status'] = 'active'): GamePlayer => ({
  id,
  game_id: 'g1',
  user_id: null,
  display_name: id,
  status,
  joined_at: `2026-01-01T00:${String(minute).padStart(2, '0')}:00Z`,
  left_at: null,
  final_stack_cents: null,
  final_chips: null,
});

describe('seating', () => {
  it('seats people in the order they sat down', () => {
    const players = [seat('c', 3), seat('a', 1), seat('b', 2)];
    expect(seatedPlayers(players).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('leaves empty seats out of the rotation', () => {
    const players = [seat('a', 1), seat('b', 2, 'left'), seat('c', 3)];
    expect(seatedPlayers(players).map((p) => p.id)).toEqual(['a', 'c']);
  });
});

describe('blinds', () => {
  it('puts the blinds left of the button', () => {
    const players = [seat('a', 1), seat('b', 2), seat('c', 3), seat('d', 4)];
    const { dealer, smallBlind, bigBlind } = blindsFor(players, 'a');
    expect([dealer?.id, smallBlind?.id, bigBlind?.id]).toEqual(['a', 'b', 'c']);
  });

  it('wraps around the table', () => {
    const players = [seat('a', 1), seat('b', 2), seat('c', 3)];
    const { smallBlind, bigBlind } = blindsFor(players, 'c');
    expect([smallBlind?.id, bigBlind?.id]).toEqual(['a', 'b']);
  });

  it('makes the dealer post the small blind heads-up', () => {
    const players = [seat('a', 1), seat('b', 2)];
    const { dealer, smallBlind, bigBlind } = blindsFor(players, 'a');
    expect(dealer?.id).toBe('a');
    expect(smallBlind?.id).toBe('a');
    expect(bigBlind?.id).toBe('b');
  });

  it('has nobody to post against a single player', () => {
    const { smallBlind, bigBlind } = blindsFor([seat('a', 1)], 'a');
    expect(smallBlind).toBeNull();
    expect(bigBlind).toBeNull();
  });
});

describe('blind labels', () => {
  it('reads the way people say it', () => {
    expect(blindsLabel(10, 25)).toBe('10¢ / 25¢');
    expect(blindsLabel(100, 200)).toBe('$1 / $2');
    expect(blindsLabel(25, 50)).toBe('25¢ / 50¢');
    expect(blindsLabel(50, 125)).toBe('50¢ / $1.25');
  });
});
