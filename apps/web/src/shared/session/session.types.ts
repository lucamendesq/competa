import {
  BILLING_CYCLES,
  PLAN_CAPABILITIES,
  PLAN_NAMES,
  type PlanCapability,
} from '@competa/contracts';
import * as z from 'zod';

export const AccountantSession = z.object({
  accountant: z.object({ id: z.string(), name: z.string(), email: z.string(), owner: z.boolean() }),
  accountingFirm: z.object({
    id: z.string(),
    name: z.string(),
    logoUrl: z.string().nullish(),
    contactEmail: z.string().nullish(),
    cnpj: z.string().nullish(),
    plan: z.object({
      name: z.enum(PLAN_NAMES),
      companyCap: z.number(),
      capabilities: z.array(z.enum(PLAN_CAPABILITIES)),
    }),
    subscription: z
      .object({
        status: z.string(),
        planName: z.string(),
        cycle: z.enum(BILLING_CYCLES),
        trialEndsAt: z.string().nullable(),
        currentPeriodEnd: z.string().nullable(),
        priceOverride: z.record(z.string(), z.number()).nullable(),
      })
      .optional(),
  }),
});
export type AccountantSession = z.infer<typeof AccountantSession>;

export const ContactSession = z.object({
  contactId: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  companyId: z.string(),
  companyName: z.string(),
  accountingFirmName: z.string(),
  companies: z.array(
    z.object({ companyId: z.string(), companyName: z.string(), accountingFirmName: z.string() }),
  ),
  hasPassword: z.boolean().optional(),
});
export type ContactSession = z.infer<typeof ContactSession>;

export type Session = {
  status: 'loading' | 'ready';
  accountant: AccountantSession | null;
  contact: ContactSession | null;
  isOwner: boolean;
  isOverdue: boolean;
  can: (capability: PlanCapability) => boolean;
  refresh: () => Promise<unknown>;
};
