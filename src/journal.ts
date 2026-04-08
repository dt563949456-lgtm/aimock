import { generateId } from "./helpers.js";
import type { Fixture, FixtureMatch, JournalEntry } from "./types.js";

/** Sentinel testId used when no explicit test scope is provided. */
export const DEFAULT_TEST_ID = "__default__";

/**
 * Compare two field values, handling RegExp by source+flags rather than reference.
 */
function fieldEqual(a: unknown, b: unknown): boolean {
  if (a instanceof RegExp && b instanceof RegExp)
    return a.source === b.source && a.flags === b.flags;
  return a === b;
}

/**
 * Check whether two fixture match objects have the same criteria
 * (ignoring sequenceIndex). Used to group sequenced fixtures.
 */
function matchCriteriaEqual(a: FixtureMatch, b: FixtureMatch): boolean {
  return (
    fieldEqual(a.userMessage, b.userMessage) &&
    fieldEqual(a.inputText, b.inputText) &&
    fieldEqual(a.toolCallId, b.toolCallId) &&
    fieldEqual(a.toolName, b.toolName) &&
    fieldEqual(a.model, b.model) &&
    fieldEqual(a.responseFormat, b.responseFormat) &&
    fieldEqual(a.predicate, b.predicate)
  );
}

export class Journal {
  private entries: JournalEntry[] = [];
  private readonly fixtureMatchCountsByTestId: Map<string, Map<Fixture, number>> = new Map();

  /** Backwards-compatible accessor — returns the default (no testId) count map. */
  get fixtureMatchCounts(): Map<Fixture, number> {
    return this.getFixtureMatchCountsForTest(DEFAULT_TEST_ID);
  }

  add(entry: Omit<JournalEntry, "id" | "timestamp">): JournalEntry {
    const full: JournalEntry = {
      id: generateId("req"),
      timestamp: Date.now(),
      ...entry,
    };
    this.entries.push(full);
    return full;
  }

  getAll(opts?: { limit?: number }): JournalEntry[] {
    if (opts?.limit !== undefined) {
      return this.entries.slice(-opts.limit);
    }
    return this.entries.slice();
  }

  getLast(): JournalEntry | null {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1] : null;
  }

  findByFixture(fixture: Fixture): JournalEntry[] {
    return this.entries.filter((e) => e.response.fixture === fixture);
  }

  getFixtureMatchCountsForTest(testId: string): Map<Fixture, number> {
    let counts = this.fixtureMatchCountsByTestId.get(testId);
    if (!counts) {
      counts = new Map();
      this.fixtureMatchCountsByTestId.set(testId, counts);
    }
    return counts;
  }

  getFixtureMatchCount(fixture: Fixture, testId = DEFAULT_TEST_ID): number {
    return this.getFixtureMatchCountsForTest(testId).get(fixture) ?? 0;
  }

  incrementFixtureMatchCount(
    fixture: Fixture,
    allFixtures?: readonly Fixture[],
    testId = DEFAULT_TEST_ID,
  ): void {
    const counts = this.getFixtureMatchCountsForTest(testId);
    counts.set(fixture, (counts.get(fixture) ?? 0) + 1);
    // When a sequenced fixture matches, also increment all siblings with matching criteria
    if (fixture.match.sequenceIndex !== undefined && allFixtures) {
      for (const sibling of allFixtures) {
        if (sibling === fixture) continue;
        if (sibling.match.sequenceIndex === undefined) continue;
        if (matchCriteriaEqual(fixture.match, sibling.match)) {
          counts.set(sibling, (counts.get(sibling) ?? 0) + 1);
        }
      }
    }
  }

  clearMatchCounts(testId?: string): void {
    if (testId !== undefined) {
      this.fixtureMatchCountsByTestId.delete(testId);
    } else {
      this.fixtureMatchCountsByTestId.clear();
    }
  }

  clear(): void {
    this.entries = [];
    this.fixtureMatchCountsByTestId.clear();
  }

  get size(): number {
    return this.entries.length;
  }
}
