import { describe, expect, it } from 'vitest';
import { isRedundantRebuild } from '../../src/scenes/rebuildEvents';

describe('client event playback: world rebuilds are coalesced', () => {
  it('skips a rebuild event when another one follows (a collapsing room emits 130+ tileChanged)', () => {
    const run = Array.from({ length: 150 }, () => ({ type: 'tileChanged' }));
    const played = run.filter((e, i) => !isRedundantRebuild(e, run[i + 1]));
    expect(played).toHaveLength(1);
  });

  it('keeps a rebuild that is followed by something else, and never skips other events', () => {
    expect(isRedundantRebuild({ type: 'tileChanged' }, { type: 'entityMoved' })).toBe(false);
    expect(isRedundantRebuild({ type: 'tileChanged' }, undefined)).toBe(false);
    expect(isRedundantRebuild({ type: 'entityMoved' }, { type: 'tileChanged' })).toBe(false);
    expect(isRedundantRebuild({ type: 'entityDespawned' }, { type: 'tileChanged' })).toBe(true);
  });
});
