const TZ = "Australia/Sydney";

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-AU", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }) : "—";

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-AU", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export const DAY_MS = 24 * 60 * 60 * 1000;

export const daysBetween = (fromIso: string, to: Date) =>
  Math.floor((to.getTime() - new Date(fromIso).getTime()) / DAY_MS);

export const addDays = (isoDate: string, days: number) =>
  new Date(new Date(`${isoDate.slice(0, 10)}T12:00:00`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
