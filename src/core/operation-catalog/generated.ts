// GENERATED FILE — DO NOT EDIT. Source: catalog.v1.json; generator: scripts/lint-operation-catalog.mjs

export const Op = Object.freeze({
  FsRead: 'op.fs.read',
  FsWrite: 'op.fs.write',
  FsDelete: 'op.fs.delete',
  MemoryRead: 'op.memory.read',
  MemoryWrite: 'op.memory.write',
  MemoryExport: 'op.memory.export',
} as const);

export type OpId = (typeof Op)[keyof typeof Op];

export interface OperationReferenceBySymbol {
  readonly FsRead: Readonly<{ readonly operationId: typeof Op.FsRead; readonly version: 1; readonly key: 'op.fs.read@1' }>;
  readonly FsWrite: Readonly<{ readonly operationId: typeof Op.FsWrite; readonly version: 1; readonly key: 'op.fs.write@1' }>;
  readonly FsDelete: Readonly<{ readonly operationId: typeof Op.FsDelete; readonly version: 1; readonly key: 'op.fs.delete@1' }>;
  readonly MemoryRead: Readonly<{ readonly operationId: typeof Op.MemoryRead; readonly version: 1; readonly key: 'op.memory.read@1' }>;
  readonly MemoryWrite: Readonly<{ readonly operationId: typeof Op.MemoryWrite; readonly version: 1; readonly key: 'op.memory.write@1' }>;
  readonly MemoryExport: Readonly<{ readonly operationId: typeof Op.MemoryExport; readonly version: 1; readonly key: 'op.memory.export@1' }>;
}

export type ExactOperationReference = OperationReferenceBySymbol[keyof OperationReferenceBySymbol];

export const OperationRef = Object.freeze({
  FsRead: Object.freeze({ operationId: Op.FsRead, version: 1, key: 'op.fs.read@1' }),
  FsWrite: Object.freeze({ operationId: Op.FsWrite, version: 1, key: 'op.fs.write@1' }),
  FsDelete: Object.freeze({ operationId: Op.FsDelete, version: 1, key: 'op.fs.delete@1' }),
  MemoryRead: Object.freeze({ operationId: Op.MemoryRead, version: 1, key: 'op.memory.read@1' }),
  MemoryWrite: Object.freeze({ operationId: Op.MemoryWrite, version: 1, key: 'op.memory.write@1' }),
  MemoryExport: Object.freeze({ operationId: Op.MemoryExport, version: 1, key: 'op.memory.export@1' }),
} as const) satisfies OperationReferenceBySymbol;

export type GeneratedOperationReference = (typeof OperationRef)[keyof typeof OperationRef];
