import { BaseDocument } from '../../../../shared/firestore/base-document';

export const FILE_KINDS = ['folder', 'file'] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export interface FileItem extends BaseDocument {
  kind: FileKind;
  parentId: string | null;
  name: string;
  description: string | null;
  url: string | null;
}
