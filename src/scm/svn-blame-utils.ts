export interface ParsedBlameLine {
    readonly lineNumber: number;
    readonly revision: string;
    readonly author: string;
    readonly content: string;
    readonly raw: string;
}

export function formatInlineBlameLabel(line: Pick<ParsedBlameLine, "revision" | "author">): string {
    return `r${line.revision} ${line.author}`.trim();
}

export function formatInlineBlameHoverTimestamp(
    value: string | undefined,
    locale: string,
    now = new Date()
): string | undefined {
    if (!value) {
        return undefined;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    const absolute = new Intl.DateTimeFormat(locale, {
        dateStyle: "long",
        timeStyle: "short",
    }).format(date);
    const relative = formatRelativeTime(date, locale, now);
    return relative ? `${relative} (${absolute})` : absolute;
}

function formatRelativeTime(date: Date, locale: string, now: Date): string | undefined {
    const diffMs = date.getTime() - now.getTime();
    const absDiffMs = Math.abs(diffMs);
    const rtf = new Intl.RelativeTimeFormat(locale, {
        numeric: "auto",
    });
    const minuteMs = 60_000;
    const hourMs = 60 * minuteMs;
    const dayMs = 24 * hourMs;
    const weekMs = 7 * dayMs;
    const monthMs = 30 * dayMs;
    const yearMs = 365 * dayMs;

    if (absDiffMs < minuteMs) {
        return rtf.format(Math.round(diffMs / 1000), "second");
    }

    if (absDiffMs < hourMs) {
        return rtf.format(Math.round(diffMs / minuteMs), "minute");
    }

    if (absDiffMs < dayMs) {
        return rtf.format(Math.round(diffMs / hourMs), "hour");
    }

    if (absDiffMs < weekMs) {
        return rtf.format(Math.round(diffMs / dayMs), "day");
    }

    if (absDiffMs < monthMs) {
        return rtf.format(Math.round(diffMs / weekMs), "week");
    }

    if (absDiffMs < yearMs) {
        return rtf.format(Math.round(diffMs / monthMs), "month");
    }

    return rtf.format(Math.round(diffMs / yearMs), "year");
}

export function parseBlameLines(blameOutput: string): ParsedBlameLine[] {
    return blameOutput.split(/\r?\n/).flatMap((line, index) => {
        if (!line.trim()) {
            return [];
        }

        const metadataMatch = line.match(/^\s*(\S+)\s+(\S+)\s+(.*)$/);
        const remainder = metadataMatch?.[3] ?? "";
        const contentStartIndex = remainder.indexOf(") ");

        return [
            {
                lineNumber: index + 1,
                revision: metadataMatch?.[1] ?? "?",
                author: metadataMatch?.[2] ?? "?",
                content:
                    contentStartIndex >= 0 ? remainder.slice(contentStartIndex + 2) : remainder,
                raw: line,
            },
        ];
    });
}
