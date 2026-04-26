import type { MessageKey } from "../i18n";
import type { SvnPropertyEntry } from "../svn/svn-types";

export interface BuiltinPropertyNameDefinition {
    readonly name: string;
    readonly descriptionKey: MessageKey;
}

export const builtinPropertyNameDefinitions: readonly BuiltinPropertyNameDefinition[] = [
    {
        name: "svn:eol-style",
        descriptionKey: "propertyNameEolStyleDescription",
    },
    {
        name: "svn:keywords",
        descriptionKey: "propertyNameKeywordsDescription",
    },
    {
        name: "svn:executable",
        descriptionKey: "propertyNameExecutableDescription",
    },
    {
        name: "svn:needs-lock",
        descriptionKey: "propertyNameNeedsLockDescription",
    },
    {
        name: "svn:mime-type",
        descriptionKey: "propertyNameMimeTypeDescription",
    },
    {
        name: "svn:ignore",
        descriptionKey: "propertyNameIgnoreDescription",
    },
    {
        name: "svn:externals",
        descriptionKey: "propertyNameExternalsDescription",
    },
];

export function encodePropertyValue(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
}

export function decodePropertyValue(value: string): string {
    let decoded = "";
    for (let index = 0; index < value.length; index += 1) {
        const currentChar = value[index];
        const nextChar = value[index + 1];

        if (currentChar === "\\" && nextChar === "n") {
            decoded += "\n";
            index += 1;
            continue;
        }

        if (currentChar === "\\" && nextChar === "\\") {
            decoded += "\\";
            index += 1;
            continue;
        }

        decoded += currentChar;
    }

    return decoded;
}

export function formatPropertyEntries(
    properties: readonly SvnPropertyEntry[],
    noPropertiesFoundLabel: string
): string[] {
    if (properties.length === 0) {
        return [noPropertiesFoundLabel];
    }

    return properties.flatMap((property) => {
        const valueLines = property.value.split("\n");
        if (valueLines.length === 1) {
            return `${property.name}: ${valueLines[0]}`;
        }

        return [
            `${property.name}:`,
            ...valueLines.map((line) => `  ${line}`),
        ];
    });
}
