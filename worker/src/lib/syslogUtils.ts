export const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function parseLineTimestamp(line: string): number | null {
  const m = line.match(/^(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const monthNum = MONTHS[m[1]!];
  if (monthNum === undefined) return null;
  const year = new Date().getFullYear();
  let ts = new Date(year, monthNum, parseInt(m[2]!), parseInt(m[3]!), parseInt(m[4]!), parseInt(m[5]!)).getTime();
  if (ts > Date.now() + 86_400_000) ts -= 365 * 86_400_000;
  return ts;
}

export function filterSyslogByHours(content: string, hours: number): string {
  const cutoffMs = Date.now() - hours * 3_600_000;
  const filtered = content.split('\n').filter(line => {
    const ts = parseLineTimestamp(line);
    return ts !== null && ts >= cutoffMs;
  });
  return filtered.join('\n');
}

export function filterSyslogSinceCursor(
  content: string,
  cursor: string | null,
): { lines: string[]; newCursor: string | null } {
  const cutoffMs = cursor === null
    ? Date.now() - 2 * 3_600_000
    : (() => {
        // Parse cursor as a syslog timestamp prefix
        const m = cursor.match(/^(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})/);
        if (!m) return Date.now() - 2 * 3_600_000;
        const monthNum = MONTHS[m[1]!];
        if (monthNum === undefined) return Date.now() - 2 * 3_600_000;
        const year = new Date().getFullYear();
        let ts = new Date(year, monthNum, parseInt(m[2]!), parseInt(m[3]!), parseInt(m[4]!), parseInt(m[5]!)).getTime();
        if (ts > Date.now() + 86_400_000) ts -= 365 * 86_400_000;
        return ts;
      })();

  const allLines = content.split('\n').filter(Boolean);
  const newLines = allLines.filter(line => {
    const ts = parseLineTimestamp(line);
    return ts !== null && ts > cutoffMs;
  });

  // Find the timestamp of the last processed line to store as new cursor
  let newCursor: string | null = cursor;
  for (let i = allLines.length - 1; i >= 0; i--) {
    const m = allLines[i]!.match(/^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})/);
    if (m) {
      newCursor = m[1]!;
      break;
    }
  }

  return { lines: newLines, newCursor };
}
