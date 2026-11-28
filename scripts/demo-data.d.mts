export const DEMO: { slug: string; domain: string; password: string; lat: number; lng: number };
export const emails: {
  superAdmin: string; schoolAdmin: string; schoolAdmin2: string;
  gate: (i: number) => string; teacher: (room: number) => string; student: (i: number) => string; parent: (i: number) => string; pending: (i: number) => string;
};
export const world: { ROOMS: string[]; STUDENTS: unknown[]; PARENTS: unknown[]; PENDING_PARENTS: unknown[] };
