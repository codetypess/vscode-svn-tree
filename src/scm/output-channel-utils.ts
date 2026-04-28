import type * as vscode from "vscode";

export function appendOutputSection(
    outputChannel: vscode.OutputChannel,
    header: string,
    lines: readonly string[]
): void {
    outputChannel.appendLine("");
    const headerLine = `=== ${header} ===`;
    outputChannel.appendLine(headerLine);
    for (const line of lines) {
        outputChannel.appendLine(line);
    }
    outputChannel.appendLine("=".repeat(headerLine.length));
}

export interface ErrorOutputLabels {
    readonly timeLabel: string;
    readonly messageLabel: string;
    readonly stackLabel: string;
    readonly causeLabel: string;
    readonly valueLabel: string;
}

export function buildErrorOutputLines(
    error: unknown,
    labels: ErrorOutputLabels,
    timestamp: Date = new Date()
): string[] {
    const lines = [`${labels.timeLabel}: ${timestamp.toISOString()}`];
    appendErrorDetails(lines, error, labels);
    return lines;
}

function appendErrorDetails(
    lines: string[],
    error: unknown,
    labels: ErrorOutputLabels,
    isCause = false
): void {
    if (isCause) {
        lines.push("");
        lines.push(`${labels.causeLabel}:`);
    }

    if (error instanceof Error) {
        lines.push(`${labels.messageLabel}: ${error.message}`);

        if (typeof error.stack === "string" && error.stack.trim()) {
            lines.push(`${labels.stackLabel}:`);
            lines.push(...error.stack.split(/\r?\n/u));
        }

        const cause = (error as Error & { cause?: unknown }).cause;
        if (cause !== undefined) {
            appendErrorDetails(lines, cause, labels, true);
        }
        return;
    }

    lines.push(`${labels.valueLabel}: ${String(error)}`);
}
