export interface ParsedBlameLine {
    readonly lineNumber: number;
    readonly revision: string;
    readonly author: string;
    readonly content: string;
    readonly raw: string;
}

export interface InlineBlameLogEntry {
    readonly author?: string;
    readonly date?: string;
    readonly message?: string;
}

export interface InlineBlameAnnotationOptions {
    readonly locale: string;
    readonly noCommitMessage: string;
    readonly maxSummaryLength?: number;
    readonly now?: Date;
}

const defaultInlineBlameSummaryLength = 72;

export function formatInlineBlameLabel(line: Pick<ParsedBlameLine, "revision" | "author">): string {
    return `r${line.revision} ${line.author}`.trim();
}

export function formatInlineBlameAnnotation(
    line: Pick<ParsedBlameLine, "revision" | "author">,
    entry: InlineBlameLogEntry | undefined,
    options: InlineBlameAnnotationOptions
): string {
    if (!entry) {
        return formatInlineBlameLabel(line);
    }

    const summary = truncateInlineBlameSummary(
        getInlineBlameSummary(entry, options.noCommitMessage),
        options.maxSummaryLength ?? defaultInlineBlameSummaryLength
    );
    const author = entry.author?.trim() || line.author;
    const relativeTime = formatInlineBlameRelativeTime(entry.date, options.locale, options.now);
    const prefix = [author, relativeTime].filter((part) => part && part.trim()).join(", ");

    return prefix ? `${prefix} • ${summary}` : summary;
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
    const relative = formatInlineBlameRelativeTime(value, locale, now);
    return relative ? `${relative} (${absolute})` : absolute;
}

export function formatInlineBlameRelativeTime(
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

    return formatRelativeTime(date, locale, now);
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

function getInlineBlameSummary(entry: InlineBlameLogEntry, noCommitMessage: string): string {
    const subject = entry.message?.split(/\r?\n/u, 1)[0]?.trim();
    return subject || noCommitMessage;
}

function truncateInlineBlameSummary(value: string, maxLength: number): string {
    const normalizedMaxLength = Math.max(0, Math.floor(maxLength));
    if (normalizedMaxLength === 0) {
        return "";
    }

    if (value.length <= normalizedMaxLength) {
        return value;
    }

    const ellipsis = "...";
    if (normalizedMaxLength <= ellipsis.length) {
        return ellipsis.slice(0, normalizedMaxLength);
    }

    const clipped = value.slice(0, normalizedMaxLength - ellipsis.length).trimEnd();
    const wordBoundaryIndex = clipped.lastIndexOf(" ");
    const summary =
        wordBoundaryIndex > ellipsis.length ? clipped.slice(0, wordBoundaryIndex) : clipped;

    return `${summary}${ellipsis}`;
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
