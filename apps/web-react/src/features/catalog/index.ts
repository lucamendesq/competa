export type { DocumentType, TemplateOption } from '@/features/catalog/api/catalog.types';
export type { DocumentTypeParams } from '@/features/catalog/api/get-document-types';
export { catalogKeys } from '@/features/catalog/queries/catalog-keys';
export {
  useDocumentTypes,
  useTemplateOptions,
} from '@/features/catalog/queries/use-catalog-queries';
export {
  CatalogPicker,
  filterCatalog,
  type CatalogDocument,
} from '@/features/catalog/components/catalog-picker';
