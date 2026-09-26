export function isWithinCheckInWindow(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  now = new Date(),
): boolean {
  if (!startTime || !endTime) {
    return true;
  }
  const start = parseHm(startTime);
  const end = parseHm(endTime);
  if (start == null || end == null) {
    return true;
  }
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (end >= start) {
    return minutes >= start && minutes <= end;
  }
  return minutes >= start || minutes <= end;
}

function parseHm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}
