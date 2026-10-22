import assert from 'node:assert';
import {
  clampLimit,
  clampOffset,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
  MAX_PROJECTS_PER_USER,
} from '../../src/shared/utils/pagination';

/**
 * Regression tests for the pagination bounds.
 *
 * A negative `limit` is not a harmless value: Drizzle drops the `LIMIT` clause
 * entirely for negative inputs, which turns a bounded query into a full table
 * scan. `clampLimit` is the single guard against that.
 */
function runTests() {
  console.log('🧪 Running pagination unit tests...');

  // Arrange / Act / Assert
  assert.strictEqual(clampLimit(undefined), DEFAULT_PAGE_SIZE, 'undefined falls back to the default');
  assert.strictEqual(clampLimit(null), DEFAULT_PAGE_SIZE, 'null falls back to the default');
  assert.strictEqual(clampLimit('not-a-number'), DEFAULT_PAGE_SIZE, 'NaN falls back to the default');
  assert.strictEqual(clampLimit(Infinity), DEFAULT_PAGE_SIZE, 'Infinity falls back to the default');

  assert.strictEqual(clampLimit(20), 20, 'a valid limit is preserved');
  assert.strictEqual(clampLimit('25'), 25, 'numeric strings are parsed');
  assert.strictEqual(clampLimit(20.9), 20, 'fractional limits are floored');

  assert.strictEqual(clampLimit(0), DEFAULT_PAGE_SIZE, 'zero is invalid input and falls back to the default');
  assert.strictEqual(clampLimit(-1), DEFAULT_PAGE_SIZE, 'a negative limit falls back to the default');
  assert.strictEqual(clampLimit(-9999), DEFAULT_PAGE_SIZE, 'a large negative limit falls back too');
  assert.strictEqual(clampLimit(0.5), DEFAULT_PAGE_SIZE, 'a fractional value below 1 falls back too');

  assert.strictEqual(clampLimit(100_000), MAX_PAGE_SIZE, 'an oversized limit is capped');
  assert.strictEqual(clampLimit(MAX_PAGE_SIZE + 1), MAX_PAGE_SIZE, 'the cap is inclusive');

  const clamped = clampLimit(-1);
  assert.ok(clamped > 0, 'the clamped limit is always positive, so SQL LIMIT is never dropped');

  assert.strictEqual(clampOffset(undefined), 0, 'an undefined offset defaults to 0');
  assert.strictEqual(clampOffset(-5), 0, 'a negative offset is clamped to 0');
  assert.strictEqual(clampOffset('10'), 10, 'numeric strings are parsed');
  assert.strictEqual(clampOffset(3.7), 3, 'fractional offsets are floored');

  assert.ok(MAX_PROJECTS_PER_USER > 0, 'the project list is bounded');

  console.log('✅ Pagination unit tests passed.');
}

runTests();
