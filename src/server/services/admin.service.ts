import { adminRepo } from "@/server/repositories/admin.repo";

/** Pad a {day, value} series so every day in the window has a point (0 where
 *  there's no data), oldest→newest — a continuous x-axis for TrendChart.
 *  Generic sibling of analytics.service.ts's fillDailyGaps (that one stays
 *  {day, sent}-shaped for its own tenant-scoped callers). */
function fillDailyGaps(
  rows: { day: string; value: number }[],
  days: number,
): { day: string; value: number }[] {
  const byDay = new Map(rows.map((r) => [r.day, r.value]));
  const out: { day: string; value: number }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({ day: key, value: byDay.get(key) ?? 0 });
  }
  return out;
}

export const adminService = {
  async signupsSeries(days: number) {
    const clamped = Math.min(Math.max(days, 1), 90);
    const rows = await adminRepo.signupsDailySeries(clamped);
    return fillDailyGaps(rows, clamped);
  },
};
