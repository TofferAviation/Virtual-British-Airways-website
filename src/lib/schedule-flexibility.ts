/**
 * BAV treats published BA times as a realism reference, never a gate to
 * enjoying a simulator flight. A small VA-point adjustment keeps a late
 * start visible without penalising a pilot out of meaningful progression.
 */
export const LATE_START_POINT_DEDUCTION_PER_HOUR = 0.1;

type ScheduledBooking = {
  date: string;
  departure: string;
};

export type LateStartAdjustment = {
  wholeHoursLate: number;
  vaPointsDeducted: number;
};

export function calculateLateStartAdjustment(
  booking: ScheduledBooking | null | undefined,
  actualStartedAt: string,
): LateStartAdjustment {
  if (!booking || !/^\d{4}-\d{2}-\d{2}$/.test(booking.date) || !/^\d{2}:\d{2}$/.test(booking.departure)) {
    return { wholeHoursLate: 0, vaPointsDeducted: 0 };
  }

  const scheduledAt = Date.parse(`${booking.date}T${booking.departure}:00.000Z`);
  const startedAt = Date.parse(actualStartedAt);
  if (!Number.isFinite(scheduledAt) || !Number.isFinite(startedAt) || startedAt <= scheduledAt) {
    return { wholeHoursLate: 0, vaPointsDeducted: 0 };
  }

  const wholeHoursLate = Math.floor((startedAt - scheduledAt) / 3_600_000);
  return {
    wholeHoursLate,
    vaPointsDeducted: Math.round(wholeHoursLate * LATE_START_POINT_DEDUCTION_PER_HOUR * 10) / 10,
  };
}
