/** Default page sizes for CRM table listings. */
export const CRM_TABLE_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export const CRM_TABLE_DEFAULT_PAGE_SIZE = 10;

export type CrmTablePageSize = (typeof CRM_TABLE_PAGE_SIZE_OPTIONS)[number];

export type PaginationPageToken = number | 'ellipsis';
