import * as vscode from "vscode";
import { SvnRepositoryManager } from "./scm/svn-repository-manager";

export function activate(context: vscode.ExtensionContext): void {
    const repositoryManager = new SvnRepositoryManager(context);
    context.subscriptions.push(repositoryManager);
}

export function deactivate(): void {
    // Nothing to do.
}
