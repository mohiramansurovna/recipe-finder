export const COOKING_TIME_OUTLIER_THRESHOLD_MINUTES = 132.5;

export function isCookingTimeOutlier(minutes: number | null): boolean {
  return (
    minutes !== null &&
    Number.isInteger(minutes) &&
    minutes >= 0 &&
    minutes > COOKING_TIME_OUTLIER_THRESHOLD_MINUTES
  );
}
