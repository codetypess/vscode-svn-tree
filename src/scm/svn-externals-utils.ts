export function normalizeExternalsEditorValue(value: string): string | undefined {
    const normalizedValue = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (!normalizedValue.trim()) {
        return undefined;
    }

    return normalizedValue.replace(/\n+$/u, "");
}
