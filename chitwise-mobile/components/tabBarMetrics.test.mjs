import test from 'node:test';
import assert from 'node:assert/strict';
import { tabBarMetrics } from './tabBarMetrics.ts';
test('tab buttons stay above Android navigation keys, gesture bars and tablet taskbars', () => {
  for (const bottom of [0, 24, 48, 80]) {
    const metrics = tabBarMetrics('android', bottom);
    assert.ok(metrics.height - metrics.paddingBottom <= metrics.height - bottom);
    assert.equal(metrics.height - metrics.paddingBottom, 65, 'Changing system insets cannot shrink the usable button area');
  }
});
test('iPhone home indicators are reserved while preserving the selected pill dimensions', () => {
  for (const bottom of [0, 20, 34]) {
    const metrics = tabBarMetrics('ios', bottom);
    assert.ok(metrics.paddingBottom >= bottom);
    assert.equal(metrics.height - metrics.paddingBottom, 68);
  }
});
test('invalid initial insets do not produce broken layout dimensions', () => {
  for (const value of [-10, NaN, Infinity]) {
    const metrics = tabBarMetrics('android', value);
    assert.ok(Number.isFinite(metrics.height) && metrics.paddingBottom >= 7);
  }
});
