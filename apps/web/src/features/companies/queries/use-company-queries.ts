import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getAccesses } from '@/features/companies/api/get-accesses';
import { getAccountantOptions } from '@/features/companies/api/get-accountant-options';
import { getCompanies, type CompanyListFilters } from '@/features/companies/api/get-companies';
import { getCompany } from '@/features/companies/api/get-company';
import { getEffectiveChecklist } from '@/features/companies/api/get-effective-checklist';
import { getOverrides } from '@/features/companies/api/get-overrides';
import { getPlanUsage } from '@/features/companies/api/get-plan-usage';
import { companyKeys } from '@/features/companies/queries/company-keys';

export const useCompanies = (filters: CompanyListFilters) =>
  useQuery({
    queryKey: companyKeys.list(filters),
    queryFn: ({ signal }) => getCompanies(filters, signal),
    placeholderData: keepPreviousData,
  });

export const useCompany = (id: string) =>
  useQuery({ queryKey: companyKeys.detail(id), queryFn: ({ signal }) => getCompany(id, signal) });

export const useCompanyAccesses = (id: string) =>
  useQuery({
    queryKey: companyKeys.accesses(id),
    queryFn: ({ signal }) => getAccesses(id, signal),
    enabled: id !== '',
  });

export const useEffectiveChecklist = (id: string) =>
  useQuery({
    queryKey: companyKeys.checklist(id),
    queryFn: ({ signal }) => getEffectiveChecklist(id, signal),
    enabled: id !== '',
  });

export const useOverrides = (id: string) =>
  useQuery({
    queryKey: companyKeys.overrides(id),
    queryFn: ({ signal }) => getOverrides(id, signal),
  });

export const usePlanUsage = () =>
  useQuery({ queryKey: companyKeys.usage(), queryFn: ({ signal }) => getPlanUsage(signal) });

export const useAccountantOptions = () =>
  useQuery({
    queryKey: companyKeys.accountantOptions(),
    queryFn: ({ signal }) => getAccountantOptions(signal),
  });
