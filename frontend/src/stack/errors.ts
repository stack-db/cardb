// ---------------------------------------------------------------------------
// Legacy errors (kept for backward compatibility with parser.ts tests)
// ---------------------------------------------------------------------------

/** Thrown when a stack file cannot be fetched (network failure, non-200). */
export class LoadError extends Error {
  constructor(public readonly cause: unknown) {
    super('Failed to load stack')
    this.name = 'LoadError'
  }
}

/** Thrown when a stack file is invalid YAML or violates graph constraints. */
export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParseError'
  }
}

// ---------------------------------------------------------------------------
// Spec 008 / 007 stack format error hierarchy
// ---------------------------------------------------------------------------

/** Base class for all stack format errors. */
export class StackError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StackError'
  }
}

/** Thrown when the ZIP archive is structurally invalid. */
export class StackArchiveError extends StackError {
  constructor(message: string) {
    super(message)
    this.name = 'StackArchiveError'
  }
}

/** Thrown when stack.yml cannot be parsed or fails schema validation. */
export class StackYamlError extends StackError {
  constructor(
    message: string,
    public readonly line?: number,
  ) {
    super(message)
    this.name = 'StackYamlError'
  }
}

/** Thrown during Pass 1 (handle/alias indexing) on name collision. */
export class StackHandleCollisionError extends StackError {
  constructor(
    public readonly conflictingName: string,
    message: string,
  ) {
    super(message)
    this.name = 'StackHandleCollisionError'
  }
}

/** Thrown during Pass 2 (reference resolution) on unresolved @name. */
export class StackUnresolvedRefError extends StackError {
  constructor(
    public readonly refName: string,
    message: string,
  ) {
    super(message)
    this.name = 'StackUnresolvedRefError'
  }
}

/** Thrown when a $.path file reference is not present in docs/. */
export class StackMissingFileError extends StackError {
  constructor(
    public readonly filePath: string,
    message: string,
  ) {
    super(message)
    this.name = 'StackMissingFileError'
  }
}

/** Thrown during serialization when an embedded file is missing. */
export class StackSerializationError extends StackError {
  constructor(message: string) {
    super(message)
    this.name = 'StackSerializationError'
  }
}
