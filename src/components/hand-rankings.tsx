/**
 * What beats what, in order, with a hand that shows it.
 *
 * This is the argument that comes up at every table, usually late, usually
 * between two people who are both certain. The examples do most of the work —
 * "does a flush beat a straight" is answered faster by seeing five diamonds
 * sitting above five in a row than by reading either name.
 *
 * Deliberately plain: no state, no effects, no images. A <details> element opens
 * and closes without React rendering anything at all, which suits a reference
 * nobody looks at twice a night and keeps it off the phone's battery.
 */

type Ranking = {
  name: string;
  /** Short enough to read at a glance; the cards carry the rest. */
  note: string;
  /** Five cards, best hand first. Rank then suit, e.g. "10♠". */
  cards: string[];
};

const RANKINGS: Ranking[] = [
  { name: 'Royal flush', note: 'The top straight flush', cards: ['A♠', 'K♠', 'Q♠', 'J♠', '10♠'] },
  { name: 'Straight flush', note: 'Five in a row, one suit', cards: ['9♥', '8♥', '7♥', '6♥', '5♥'] },
  { name: 'Four of a kind', note: 'All four of a rank', cards: ['Q♠', 'Q♥', 'Q♦', 'Q♣', '3♠'] },
  { name: 'Full house', note: 'Three of one, two of another', cards: ['J♠', 'J♥', 'J♦', '4♠', '4♥'] },
  { name: 'Flush', note: 'Five of a suit, any order', cards: ['A♦', 'J♦', '8♦', '5♦', '2♦'] },
  { name: 'Straight', note: 'Five in a row, any suits', cards: ['10♠', '9♥', '8♦', '7♠', '6♣'] },
  { name: 'Three of a kind', note: 'Three of a rank', cards: ['7♠', '7♥', '7♦', 'K♠', '2♣'] },
  { name: 'Two pair', note: 'Two pairs, and a fifth card', cards: ['A♠', 'A♥', '9♦', '9♣', '4♠'] },
  { name: 'One pair', note: 'One pair, three others', cards: ['10♠', '10♥', 'K♦', '6♣', '3♠'] },
  { name: 'High card', note: 'None of the above', cards: ['A♠', 'Q♦', '9♥', '5♣', '3♠'] },
];

export function HandRankings() {
  return (
    <details className="group">
      <summary className="pressable flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <h2 className="plate">What beats what</h2>
        <span className="text-xs text-ink-500">
          <span className="group-open:hidden">Show</span>
          <span className="hidden group-open:inline">Hide</span>
        </span>
      </summary>

      <ol className="card mt-1.5">
        {RANKINGS.map((hand, i) => (
          <li key={hand.name} className="ledger-row px-4 py-2.5 last:border-b-0">
            <div className="flex items-baseline gap-3">
              <span className="figure w-4 shrink-0 text-right text-xs text-ink-500">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{hand.name}</span>
                <span className="text-[11px] text-ink-500">{hand.note}</span>
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1 pl-7">
              {hand.cards.map((card, j) => (
                <Card key={`${card}-${j}`} card={card} />
              ))}
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-1.5 text-xs text-ink-500">
        Same hand on both sides? The higher cards settle it — two pair of aces and nines beats
        aces and eights. If all five are equal, the pot is split.
      </p>
    </details>
  );
}

/**
 * Hearts and diamonds red, spades and clubs pale. The suit is the only part
 * that needs colour, so the rank stays legible against the felt either way.
 */
function Card({ card }: { card: string }) {
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  const red = suit === '♥' || suit === '♦';

  return (
    <span
      className="inline-flex min-w-8 items-baseline justify-center gap-px rounded-sm border border-white/12 bg-night-950/60 px-1.5 py-0.5 text-xs"
      // The pip is decoration once the rank and colour are read together, and
      // "10 heart heart" is not what anyone wants read out to them.
      aria-label={`${rank} of ${SUIT_NAMES[suit] ?? suit}`}
    >
      <span className="tabular text-ink-100">{rank}</span>
      <span aria-hidden className={red ? 'text-rouge-400' : 'text-ink-300'}>
        {suit}
      </span>
    </span>
  );
}

const SUIT_NAMES: Record<string, string> = {
  '♠': 'spades',
  '♥': 'hearts',
  '♦': 'diamonds',
  '♣': 'clubs',
};
