import { it } from 'vitest';
import { DEEP, checkFloor } from './willy-balance-helpers';

/** Balance regression for floor 5 (see willy-balance-helpers.ts and docs/willy/BALANCE.md). */
it.runIf(DEEP)('floor 5: Willy and his companion get through it at the expected rate', () => checkFloor(5), DEEP ? 1_800_000 : 120_000);
