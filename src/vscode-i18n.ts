import * as vscode from "vscode";
import {
    createI18n,
    resolveDisplayLanguage,
    type DisplayLanguageSetting,
    type MessageKey,
    type MessageVariables,
    type RuntimeI18n,
    type SupportedLocale,
} from "./i18n";

export const displayLanguageConfigurationKey = "svn-tree.displayLanguage";

export function getDisplayLanguageSetting(): DisplayLanguageSetting {
    const value = vscode.workspace
        .getConfiguration("svn-tree")
        .get<string>("displayLanguage", "auto");

    if (value === "en" || value === "zh-CN") {
        return value;
    }

    return "auto";
}

export function getDisplayLocale(): SupportedLocale {
    return resolveDisplayLanguage(getDisplayLanguageSetting(), vscode.env.language);
}

export function getI18n(): RuntimeI18n {
    return createI18n(getDisplayLocale());
}

export function t(key: MessageKey, variables?: MessageVariables): string {
    return getI18n().t(key, variables);
}
