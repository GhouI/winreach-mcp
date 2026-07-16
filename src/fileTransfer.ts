import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export type FileTransferRuntime = {
  /** Absolute sandbox root. All transfer paths resolve within it. */
  root?: string;
  /** Maximum bytes per transferred file. */
  maxBytes: number;
};

export type FileUploadOptions = {
  /** Destination path, relative to the configured root. */
  path: string;
  /** File content, base64-encoded. */
  content: string;
  /** Overwrite an existing file. Defaults to false. */
  overwrite?: boolean;
};

export type FileUploadResult = {
  commandId: string;
  success: boolean;
  path?: string;
  relativePath?: string;
  bytes: number;
  sha256?: string;
  overwritten?: boolean;
  error?: string;
};

export type FileDownloadOptions = {
  /** Source path, relative to the configured root. */
  path: string;
  /** Delete the source after a successful read (i.e. move). Defaults to false. */
  deleteSource?: boolean;
};

export type FileDownloadResult = {
  commandId: string;
  success: boolean;
  path?: string;
  relativePath?: string;
  bytes: number;
  sha256?: string;
  base64?: string;
  deleted?: boolean;
  error?: string;
};

/** Thrown when an operation is rejected before touching the filesystem. */
export class FileTransferError extends Error {}

function requireRoot(runtime: FileTransferRuntime): string {
  if (!runtime.root) {
    throw new FileTransferError("File transfer is disabled: no WINBRIDGE_FILE_ROOT is configured.");
  }
  // Resolve symlinks in the root itself so containment checks compare real paths.
  return existsSync(runtime.root) ? realpathSync(runtime.root) : resolve(runtime.root);
}

/** True when `child` is the same as or nested inside `parent`. */
function isWithin(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}

/**
 * Resolve a caller-supplied path against the sandbox root and confirm it stays
 * inside it, following symlinks on any existing portion so a symlink cannot be
 * used to escape. `mustExist` controls whether the final path has to exist.
 * Returns both the absolute path and its root-relative form.
 */
export function resolveWithinRoot(
  root: string,
  inputPath: string,
  mustExist: boolean
): { absolute: string; relative: string } {
  if (typeof inputPath !== "string" || inputPath.trim() === "") {
    throw new FileTransferError("A file path is required.");
  }
  if (isAbsolute(inputPath)) {
    throw new FileTransferError("File paths must be relative to the configured root.");
  }

  const candidate = resolve(root, inputPath);
  if (!isWithin(root, candidate)) {
    throw new FileTransferError("Path escapes the configured file root.");
  }

  // Walk up to the deepest existing ancestor and resolve its real path; if a
  // symlink there points outside the root, reject.
  let existing = candidate;
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) {
      break;
    }
    existing = parent;
  }
  if (existsSync(existing)) {
    const realExisting = realpathSync(existing);
    if (realExisting !== root && !isWithin(root, realExisting)) {
      throw new FileTransferError("Path escapes the configured file root via a symlink.");
    }
  }

  if (mustExist && !existsSync(candidate)) {
    throw new FileTransferError("File not found within the configured root.");
  }

  return { absolute: candidate, relative: relative(root, candidate) };
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Convert a caught error into a client-safe message. Intentional
 * `FileTransferError` messages are returned as-is; any other error (e.g. a raw
 * Node fs error, which embeds the absolute server path) is logged server-side
 * and replaced with a generic message so filesystem layout is not disclosed.
 */
function describeError(error: unknown): string {
  if (error instanceof FileTransferError) {
    return error.message;
  }
  console.error("File transfer failed:", error);
  return "File operation failed.";
}

/**
 * Write a base64-encoded file into the sandbox root. Creates parent directories
 * as needed (within the root). Refuses to overwrite unless `overwrite` is set,
 * and refuses content larger than `maxBytes`.
 */
export function uploadFile(runtime: FileTransferRuntime, options: FileUploadOptions): FileUploadResult {
  const commandId = randomUUID();
  const failure = (error: string): FileUploadResult => ({ commandId, success: false, bytes: 0, error });

  let buffer: Buffer;
  try {
    const root = requireRoot(runtime);

    if (typeof options.content !== "string") {
      return failure("content must be a base64-encoded string.");
    }
    // Cheap DoS guard: reject clearly-oversize input from the encoded length
    // before allocating the decoded buffer. base64 encodes ~3 bytes per 4 chars;
    // the `- 3` slack keeps this pre-check from ever firing for a file that is
    // actually within the limit (the exact post-decode check below handles the
    // precise boundary), which also avoids off-by-a-few over-rejection when
    // maxBytes is not a multiple of 3.
    if (Math.floor(options.content.length / 4) * 3 - 3 > runtime.maxBytes) {
      return failure(`File exceeds the ${runtime.maxBytes}-byte limit.`);
    }
    buffer = Buffer.from(options.content, "base64");
    if (buffer.length > runtime.maxBytes) {
      return failure(`File is ${buffer.length} bytes, exceeding the ${runtime.maxBytes}-byte limit.`);
    }

    const { absolute, relative: rel } = resolveWithinRoot(root, options.path, false);

    const overwritten = existsSync(absolute);
    if (overwritten) {
      if (statSync(absolute).isDirectory()) {
        return failure("Destination is a directory.");
      }
      if (!options.overwrite) {
        return failure("Destination already exists; set overwrite to replace it.");
      }
    }

    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, buffer);

    return {
      commandId,
      success: true,
      path: absolute,
      relativePath: rel,
      bytes: buffer.length,
      sha256: sha256(buffer),
      overwritten
    };
  } catch (error) {
    return failure(describeError(error));
  }
}

/**
 * Read a file from the sandbox root and return it base64-encoded. When
 * `deleteSource` is set, the source is removed after a successful read (move).
 * Refuses files larger than `maxBytes`.
 */
export function downloadFile(runtime: FileTransferRuntime, options: FileDownloadOptions): FileDownloadResult {
  const commandId = randomUUID();
  const failure = (error: string): FileDownloadResult => ({ commandId, success: false, bytes: 0, error });

  try {
    const root = requireRoot(runtime);
    const { absolute, relative: rel } = resolveWithinRoot(root, options.path, true);

    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      return failure("Path is a directory; only single files can be downloaded.");
    }
    if (stats.size > runtime.maxBytes) {
      return failure(`File is ${stats.size} bytes, exceeding the ${runtime.maxBytes}-byte limit.`);
    }

    const buffer = readFileSync(absolute);

    let deleted = false;
    if (options.deleteSource) {
      rmSync(absolute);
      deleted = true;
    }

    return {
      commandId,
      success: true,
      path: absolute,
      relativePath: rel,
      bytes: buffer.length,
      sha256: sha256(buffer),
      base64: buffer.toString("base64"),
      deleted
    };
  } catch (error) {
    return failure(describeError(error));
  }
}

// Re-exported for callers that build paths for display/testing.
export { join as joinPath };
