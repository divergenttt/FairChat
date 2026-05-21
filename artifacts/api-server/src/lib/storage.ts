import fs from "fs";
import path from "path";

export interface StorageAdapter {
  /** Persists a file and returns its public URL path (e.g. `/api/uploads/<filename>`). */
  save(filename: string, buffer: Buffer, mimetype: string): Promise<string>;
  delete(filename: string): Promise<void>;
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private uploadDir: string) {}

  async save(filename: string, buffer: Buffer, _mimetype: string): Promise<string> {
    await fs.promises.mkdir(this.uploadDir, { recursive: true });
    await fs.promises.writeFile(path.join(this.uploadDir, filename), buffer);
    return `/api/uploads/${filename}`;
  }

  async delete(filename: string): Promise<void> {
    await fs.promises.unlink(path.join(this.uploadDir, filename)).catch(() => {});
  }
}

// TODO: реализовать для продакшна
// Нужны env vars: S3_BUCKET, S3_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
export class S3StorageAdapter implements StorageAdapter {
  async save(_filename: string, _buffer: Buffer, _mimetype: string): Promise<string> {
    throw new Error(
      "S3StorageAdapter is not implemented. Set STORAGE_ADAPTER=local or implement S3 upload.",
    );
  }

  async delete(_filename: string): Promise<void> {
    throw new Error(
      "S3StorageAdapter is not implemented. Set STORAGE_ADAPTER=local or implement S3 delete.",
    );
  }
}

export type StorageAdapterKind = "local" | "s3";

export function resolveStorageAdapterKind(): StorageAdapterKind {
  const raw = (process.env.STORAGE_ADAPTER ?? "local").trim().toLowerCase();
  if (raw === "s3") return "s3";
  if (raw !== "local") {
    throw new Error(`Invalid STORAGE_ADAPTER="${raw}". Use "local" or "s3".`);
  }
  return "local";
}

export function createStorageAdapter(uploadDir: string): StorageAdapter {
  switch (resolveStorageAdapterKind()) {
    case "s3":
      return new S3StorageAdapter();
    case "local":
    default:
      return new LocalStorageAdapter(uploadDir);
  }
}
