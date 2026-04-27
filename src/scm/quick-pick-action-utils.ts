import type * as vscode from "vscode";

export interface QuickPickActionDefinition<TTarget> {
    readonly label: string;
    readonly description?: string;
    readonly detail?: string;
    readonly run: (target: TTarget) => Promise<void>;
}

export interface QuickPickActionCategoryDefinition<TTarget> {
    readonly label: string;
    readonly description?: string;
    readonly detail?: string;
    readonly actions: readonly QuickPickActionDefinition<TTarget>[];
}

export interface QuickPickActionItem<TTarget> extends vscode.QuickPickItem {
    readonly run: (target: TTarget) => Promise<void>;
}

export interface QuickPickActionCategoryItem<TTarget> extends vscode.QuickPickItem {
    readonly actions: QuickPickActionItem<TTarget>[];
}

export function buildQuickPickActionCategories<TTarget>(
    definitions: readonly QuickPickActionCategoryDefinition<TTarget>[]
): QuickPickActionCategoryItem<TTarget>[] {
    return definitions.map((definition) => ({
        label: definition.label,
        description: definition.description,
        detail: definition.detail,
        actions: definition.actions.map((action) => ({
            label: action.label,
            description: action.description,
            detail: action.detail,
            run: action.run,
        })),
    }));
}
