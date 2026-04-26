export interface ParsedBlameLine {
    readonly lineNumber: number;
    readonly revision: string;
    readonly author: string;
    readonly content: string;
    readonly raw: string;
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
                content: contentStartIndex >= 0 ? remainder.slice(contentStartIndex + 2) : remainder,
                raw: line,
            },
        ];
    });
}
