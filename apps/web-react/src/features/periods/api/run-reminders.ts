import { api } from '@/shared/lib/api-client';
import type { ReminderRun } from '@/features/periods/api/period.types';

export const runReminders = () => api.post<ReminderRun>('/messages/reminders/run');
