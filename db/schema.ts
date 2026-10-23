import { sqliteTable,text,integer } from 'drizzle-orm/sqlite-core';
export const signals=sqliteTable('signals',{id:text('id').primaryKey(),url:text('url').notNull().unique(),data:text('data').notNull(),collectedAt:text('collected_at').notNull()});
export const records=sqliteTable('records',{id:text('id').primaryKey(),kind:text('kind').notNull(),data:text('data').notNull(),revision:integer('revision').notNull().default(1),updatedAt:text('updated_at').notNull()});
export const audit=sqliteTable('audit',{id:text('id').primaryKey(),action:text('action').notNull(),entityId:text('entity_id'),detail:text('detail').notNull(),actor:text('actor').notNull(),at:text('at').notNull()});
export const refreshRuns=sqliteTable('refresh_runs',{id:text('id').primaryKey(),startedAt:text('started_at').notNull(),finishedAt:text('finished_at'),status:text('status').notNull(),added:integer('added').notNull().default(0),details:text('details').notNull()});
