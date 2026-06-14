import { Forbidden } from "@/server/http/errors";

export type Role = "admin" | "recruiter" | "viewer";

/** Higher number = more privilege. */
const RANK: Record<Role, number> = {
  viewer: 1,
  recruiter: 2,
  admin: 3,
};

export function hasRole(actual: Role, required: Role): boolean {
  return RANK[actual] >= RANK[required];
}

/** Throws 403 unless `actual` meets or exceeds `required`. Server-side only. */
export function assertRole(actual: Role, required: Role): void {
  if (!hasRole(actual, required)) {
    throw new Forbidden(`Requires ${required} role`);
  }
}
