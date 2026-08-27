// Reading a tool's arguments, strictly, and saying which field was wrong.
//
// §15's last row: an argument error names the field and the reason. An AI that
// is told "invalid input" retries the same call; one that is told `days must
// be a whole number between 1 and 90` fixes it. These are the messages the
// model reads, so they are written for a reader rather than for a log.
//
// Unknown arguments are refused rather than ignored. A model that invents
// `projectName` and gets silence back believes it filtered the list, and the
// answer it then gives is confidently wrong about which project it describes.
import { invalidArgument } from "../errors";

export type Args = Record<string, unknown>;

export function readArgs(value: unknown): Args {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw invalidArgument("Arguments must be an object.");
  return value as Args;
}

export function rejectUnknown(args: Args, allowed: readonly string[]): void {
  const unknown = Object.keys(args).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw invalidArgument(`Unknown argument${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}. Accepted: ${allowed.join(", ")}.`);
  }
}

export function optionalString(args: Args, field: string): string | undefined {
  const value = args[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw invalidArgument(`${field} must be a string.`);
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function requiredString(args: Args, field: string): string {
  const value = optionalString(args, field);
  if (!value) throw invalidArgument(`${field} is required.`);
  return value;
}

export function optionalBoolean(args: Args, field: string): boolean | undefined {
  const value = args[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw invalidArgument(`${field} must be true or false.`);
  return value;
}

export function optionalInteger(args: Args, field: string, min: number, max: number): number | undefined {
  const value = args[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw invalidArgument(`${field} must be a whole number.`);
  }
  if (value < min || value > max) throw invalidArgument(`${field} must be between ${min} and ${max}.`);
  return value;
}

export function optionalEnum<T extends string>(args: Args, field: string, allowed: readonly T[]): T | undefined {
  const value = optionalString(args, field);
  if (value === undefined) return undefined;
  if (!allowed.includes(value as T)) {
    throw invalidArgument(`${field} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

export function optionalDate(args: Args, field: string): string | undefined {
  const value = optionalString(args, field);
  if (value === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalidArgument(`${field} must be a date like 2026-08-28.`);
  return value;
}

export function requiredDate(args: Args, field: string): string {
  const value = optionalDate(args, field);
  if (!value) throw invalidArgument(`${field} is required, as a date like 2026-08-28.`);
  return value;
}

export function optionalTime(args: Args, field: string): string | undefined {
  const value = optionalString(args, field);
  if (value === undefined) return undefined;
  if (!/^\d{2}:\d{2}$/.test(value)) throw invalidArgument(`${field} must be a time like 09:00.`);
  return value;
}

export function optionalStringArray<T extends string>(
  args: Args,
  field: string,
  allowed: readonly T[],
): T[] | undefined {
  const value = args[field];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw invalidArgument(`${field} must be an array.`);
  for (const entry of value) {
    if (typeof entry !== "string" || !allowed.includes(entry as T)) {
      throw invalidArgument(`${field} may only contain: ${allowed.join(", ")}.`);
    }
  }
  return value as T[];
}
