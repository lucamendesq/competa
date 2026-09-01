import type { db } from './index.js';

type Db = Omit<typeof db, '$client'>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class Database {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type,@typescript-eslint/no-unsafe-declaration-merging
export interface Database extends Db {}
