import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  getDocumentTypes,
  type DocumentTypeParams,
} from '@/features/catalog/api/get-document-types';
import { getTemplates } from '@/features/catalog/api/get-templates';
import { catalogKeys } from '@/features/catalog/queries/catalog-keys';

export const useDocumentTypes = (params: DocumentTypeParams) =>
  useQuery({
    queryKey: catalogKeys.documentTypes(params),
    queryFn: ({ signal }) => getDocumentTypes(params, signal),
    placeholderData: keepPreviousData,
  });

export const useTemplateOptions = () =>
  useQuery({ queryKey: catalogKeys.templates(), queryFn: ({ signal }) => getTemplates(signal) });
