import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull().default(''),
  phone: text('phone').notNull().default(''),
  firstName: text('first_name').notNull().default(''),
  lastName: text('last_name').notNull().default(''),
  birthDate: text('birth_date').notNull().default('2000-01-01'),
  gender: text('gender').notNull().default('unspecified'),
  language: text('language').notNull().default('ru'),
  parentalConsent: boolean('parental_consent').notNull().default(false),
  plan: text('plan').notNull().default('free_15s'),
  planExpiresAt: timestamp('plan_expires_at'),
  planAutoRenew: boolean('plan_auto_renew').notNull().default(false),
  dailyAiCount: integer('daily_ai_count').notNull().default(0),
  dailyAiDate: text('daily_ai_date').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
});

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull().default('Новый проект'),
  aspectRatio: text('aspect_ratio').notNull().default('9:16'),
  resolution: text('resolution').notNull().default('1080p'),
  fps: integer('fps').notNull().default(30),
  durationMs: integer('duration_ms').notNull().default(15000),
  thumbnailUrl: text('thumbnail_url').notNull().default(''),
  stateJson: jsonb('state_json').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const colorPresets = pgTable('color_presets', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  settingsJson: jsonb('settings_json').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  plan: text('plan').notNull(),
  amountUsd: integer('amount_usd').notNull(),
  paymentMethod: text('payment_method').notNull(),
  stripeSessionId: text('stripe_session_id').notNull().default(''),
  receiptEmail: text('receipt_email').notNull().default(''),
  status: text('status').notNull().default('paid'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const socialConnections = pgTable('social_connections', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  platform: text('platform').notNull(),
  handle: text('handle').notNull().default(''),
  accessToken: text('access_token').notNull().default(''),
  connectedAt: timestamp('connected_at').defaultNow(),
});

export const scheduledPosts = pgTable('scheduled_posts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  projectId: integer('project_id').references(() => projects.id, {
    onDelete: 'set null',
  }),
  platforms: jsonb('platforms').notNull(),
  caption: text('caption').notNull().default(''),
  hashtags: jsonb('hashtags').notNull(),
  scheduledAt: timestamp('scheduled_at').defaultNow(),
  status: text('status').notNull().default('published'),
  mediaUrl: text('media_url').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  colorPresets: many(colorPresets),
  payments: many(payments),
  socialConnections: many(socialConnections),
  scheduledPosts: many(scheduledPosts),
}));

export const projectsRelations = relations(projects, ({ one }) => ({
  owner: one(users, {
    fields: [projects.userId],
    references: [users.id],
  }),
}));
