import { DEFAULT_REMINDER_SETTINGS, UpdateFirmBody } from '@competa/contracts';
import * as z from 'zod';
import type { Firm } from '@/features/firm/api/firm.types';

export const REMINDER_FIELDS = ['reminderMax', 'reminderDueSoonDays', 'reminderGapDays'] as const;

const FirmFormFields = z.object({
  name: z.string(),
  contactEmail: z.string(),
  cnpj: z.string(),
  logoUrl: z.string(),
  reminderMax: z.string(),
  reminderDueSoonDays: z.string(),
  reminderGapDays: z.string(),
});
export type FirmFormValues = z.infer<typeof FirmFormFields>;

export const bodyOf = (values: FirmFormValues, canTuneReminders: boolean) => ({
  name: values.name,
  contactEmail: values.contactEmail,
  logoUrl: values.logoUrl,
  ...(values.cnpj.trim() ? { cnpj: values.cnpj } : {}),
  ...(canTuneReminders
    ? {
        reminderMax: Number(values.reminderMax),
        reminderDueSoonDays: Number(values.reminderDueSoonDays),
        reminderGapDays: Number(values.reminderGapDays),
      }
    : {}),
});

export const firmFormSchema = (canTuneReminders: boolean) =>
  FirmFormFields.superRefine((values, context) => {
    const blank = canTuneReminders
      ? REMINDER_FIELDS.filter((field) => values[field].trim() === '')
      : [];
    for (const field of blank) {
      context.addIssue({ code: 'custom', path: [field], message: 'Preencha este campo.' });
    }
    if (blank.length) return;

    const parsed = UpdateFirmBody.safeParse(bodyOf(values, canTuneReminders));
    if (parsed.success) return;
    for (const issue of parsed.error.issues) {
      context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
    }
  });

export const formValuesOf = (firm: Firm, canTuneReminders: boolean): FirmFormValues => {
  const reminders = canTuneReminders ? firm : DEFAULT_REMINDER_SETTINGS;
  return {
    name: firm.name,
    contactEmail: firm.contactEmail ?? '',
    cnpj: firm.cnpj ?? '',
    logoUrl: firm.logoUrl ?? '',
    reminderMax: String(reminders.reminderMax),
    reminderDueSoonDays: String(reminders.reminderDueSoonDays),
    reminderGapDays: String(reminders.reminderGapDays),
  };
};

export const changedFields = (body: UpdateFirmBody, firm: Firm) =>
  Object.fromEntries(
    Object.entries(body).filter(([key, value]) => (firm[key as keyof Firm] ?? null) !== value),
  ) as UpdateFirmBody;
