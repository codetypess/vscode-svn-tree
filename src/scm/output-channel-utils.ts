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
