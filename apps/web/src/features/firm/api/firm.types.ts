export type Firm = {
  id: string;
  name: string;
  reminderMax: number;
  reminderDueSoonDays: number;
  reminderGapDays: number;
  logoUrl: string | null;
  contactEmail: string | null;
  cnpj: string | null;
};
