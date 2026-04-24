import * as nodePath from "node:path";
import * as vscode from "vscode";
import { HistoryPanel } from "../history/history-panel";
import { SvnContentProvider } from "../svn/svn-content-provider";
import { SvnService } from "../svn/svn-service";
import type { SvnLogEntry, SvnStatusEntry, SvnWorkingCopyInfo } from "../svn/svn-types";
import { ScmResource } from "./scm-resource";

interface RefreshOptions {
    forceRemote?: boolean;
}

function posixJoin(left: string, right: string): string {
    return `${left.replace(/\/+$/, "")}/${right.replace(/\\/g, "/").replace(/^\/+/, "")}`;
}

function buildRepositoryUrl(repositoryRoot: string, repositoryPath: string): string {
    const url = new URL(repositoryRoot);
    url.pathname = posixJoin(url.pathname || "/", repositoryPath);
    return url.toString();
}

function isLocalChange(status: SvnStatusEntry): boolean {
    return status.wcStatus !== "normal" && status.wcStatus !== "none";
}

function isRemoteChange(status: SvnStatusEntry): boolean {
    return !!status.reposStatus && status.reposStatus !== "none";
}

export class SvnRepository implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private readonly changesGroup: vscode.SourceControlResourceGroup;
    private readonly remoteChangesGroup: vscode.SourceControlResourceGroup;
    private readonly sourceControl: vscode.SourceControl;
    private lastRemoteRefreshAt = 0;
    private isRefreshing = false;

    public constructor(
        public readonly info: SvnWorkingCopyInfo,
        private readonly svnService: SvnService,
        private readonly historyPanel: HistoryPanel,
        private readonly contentProvider: SvnContentProvider
    ) {
        this.sourceControl = vscode.scm.createSourceControl(
            "svn-graph",
            `SVN: ${nodePath.basename(info.workingCopyRoot)}`,
            vscode.Uri.file(info.workingCopyRoot)
        );
        this.sourceControl.acceptInputCommand = {
            command: "svn-graph.commit",
            title: "Commit",
            arguments: [this],
        };
        this.sourceControl.quickDiffProvider = {
            provideOriginalResource: (uri) => this.provideOriginalResource(uri),
        };

        this.changesGroup = this.sourceControl.createResourceGroup("svn-graph.changes", "Changes");
        this.remoteChangesGroup = this.sourceControl.createResourceGroup(
            "svn-graph.remote-changes",
            "Remote Changes"
        );
        this.changesGroup.hideWhenEmpty = false;
        this.remoteChangesGroup.hideWhenEmpty = false;
        this.sourceControl.count = 0;
        this.sourceControl.statusBarCommands = [
            { command: "svn-graph.refresh", title: "Refresh", arguments: [this] },
            { command: "svn-graph.update", title: "Update", arguments: [this] },
            { command: "svn-graph.open-history", title: "History", arguments: [this] },
        ];
    }

    public get rootPath(): string {
        return this.info.workingCopyRoot;
    }

    public get label(): string {
        return nodePath.basename(this.rootPath);
    }

    public dispose(): void {
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
        this.sourceControl.dispose();
    }

    public async refresh(options: RefreshOptions = {}): Promise<void> {
        if (this.isRefreshing) {
            return;
        }

        this.isRefreshing = true;

        try {
            const includeRemote = this.shouldIncludeRemote(options.forceRemote === true);
            const statuses = await this.svnService.getStatus(this.rootPath, includeRemote);
            const changeResources = statuses
                .filter(isLocalChange)
                .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
                .map((status) => new ScmResource(this, status, "change"));
            const remoteResources = includeRemote
                ? statuses
                      .filter(isRemoteChange)
                      .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
                      .map((status) => new ScmResource(this, status, "remote-change"))
                : this.remoteChangesGroup.resourceStates;

            this.changesGroup.resourceStates = changeResources;
            this.remoteChangesGroup.resourceStates = remoteResources;
            this.sourceControl.count = changeResources.length;

            if (includeRemote) {
                this.lastRemoteRefreshAt = Date.now();
            }
        } finally {
            this.isRefreshing = false;
        }
    }

    public async commit(paths?: string[]): Promise<void> {
        const message = this.sourceControl.inputBox.value.trim();

        if (!message) {
            throw new Error("Enter a commit message before committing.");
        }

        await this.svnService.commit(this.rootPath, message, paths);
        this.sourceControl.inputBox.value = "";
        await this.refresh({ forceRemote: true });
    }

    public async update(paths?: string[]): Promise<void> {
        await this.svnService.update(this.rootPath, paths);
        await this.refresh({ forceRemote: true });
    }

    public async revert(paths: string[]): Promise<void> {
        await this.svnService.revert(this.rootPath, paths);
        await this.refresh();
    }

    public async add(paths: string[]): Promise<void> {
        await this.svnService.add(this.rootPath, paths);
        await this.refresh();
    }

    public async delete(paths: string[]): Promise<void> {
        await this.svnService.delete(this.rootPath, paths);
        await this.refresh();
    }

    public async showHistory(): Promise<void> {
        await this.historyPanel.show(this);
    }

    public async loadHistory(): Promise<SvnLogEntry[]> {
        const maxEntries = vscode.workspace
            .getConfiguration("svn-graph")
            .get<number>("max-log-entries", 200);
        return this.svnService.getLog(this.rootPath, maxEntries);
    }

    public async openResourceDiff(resource: ScmResource): Promise<void> {
        if (resource.kind === "remote-change") {
            await this.openRemoteDiff(resource.status);
            return;
        }

        if (resource.status.wcStatus === "unversioned") {
            await vscode.window.showTextDocument(resource.resourceUri, { preview: true });
            return;
        }

        const rightUri =
            resource.status.wcStatus === "deleted" || resource.status.wcStatus === "missing"
                ? this.contentProvider.createUri({
                      label: `${resource.status.relativePath} (working tree missing)`,
                      source: "empty",
                  })
                : resource.resourceUri;

        const leftUri =
            resource.status.wcStatus === "added"
                ? this.contentProvider.createUri({
                      label: `${resource.status.relativePath} (empty)`,
                      source: "empty",
                  })
                : this.contentProvider.createUri({
                      label: `${resource.status.relativePath} (BASE)`,
                      source: "svn",
                      target: resource.status.absolutePath,
                      revision: "BASE",
                  });

        await vscode.commands.executeCommand(
            "vscode.diff",
            leftUri,
            rightUri,
            `${resource.status.relativePath} (${resource.status.wcStatus})`
        );
    }

    public async openHistoryDiff(
        revision: number,
        repositoryPath: string,
        action: string
    ): Promise<void> {
        const targetUrl = buildRepositoryUrl(this.info.repositoryRoot, repositoryPath);
        const rightRevision = String(revision);
        const leftRevision = String(Math.max(revision - 1, 0));

        const leftUri =
            action === "A" || revision <= 1
                ? this.contentProvider.createUri({
                      label: `${repositoryPath} (empty)`,
                      source: "empty",
                  })
                : this.contentProvider.createUri({
                      label: `${repositoryPath} (r${leftRevision})`,
                      source: "svn",
                      target: targetUrl,
                      revision: leftRevision,
                  });

        const rightUri =
            action === "D"
                ? this.contentProvider.createUri({
                      label: `${repositoryPath} (deleted)`,
                      source: "empty",
                  })
                : this.contentProvider.createUri({
                      label: `${repositoryPath} (r${rightRevision})`,
                      source: "svn",
                      target: targetUrl,
                      revision: rightRevision,
                  });

        await vscode.commands.executeCommand(
            "vscode.diff",
            leftUri,
            rightUri,
            `${repositoryPath} (r${revision})`
        );
    }

    private async openRemoteDiff(status: SvnStatusEntry): Promise<void> {
        const repositoryUrl = this.resolveRepositoryUrl(status.absolutePath);
        const rightUri =
            status.reposStatus === "deleted"
                ? this.contentProvider.createUri({
                      label: `${status.relativePath} (deleted in HEAD)`,
                      source: "empty",
                  })
                : this.contentProvider.createUri({
                      label: `${status.relativePath} (HEAD)`,
                      source: "svn",
                      target: repositoryUrl,
                      revision: "HEAD",
                  });

        const leftUri =
            status.reposStatus === "added"
                ? this.contentProvider.createUri({
                      label: `${status.relativePath} (empty)`,
                      source: "empty",
                  })
                : this.contentProvider.createUri({
                      label: `${status.relativePath} (BASE)`,
                      source: "svn",
                      target: status.absolutePath,
                      revision: "BASE",
                  });

        await vscode.commands.executeCommand(
            "vscode.diff",
            leftUri,
            rightUri,
            `${status.relativePath} (${status.reposStatus ?? "incoming"})`
        );
    }

    private shouldIncludeRemote(forceRemote: boolean): boolean {
        const enabled = vscode.workspace
            .getConfiguration("svn-graph")
            .get<boolean>("enable-remote-status", true);
        if (!enabled) {
            return false;
        }

        if (forceRemote) {
            return true;
        }

        const intervalSeconds = vscode.workspace
            .getConfiguration("svn-graph")
            .get<number>("remote-status-interval-seconds", 60);
        return Date.now() - this.lastRemoteRefreshAt >= intervalSeconds * 1000;
    }

    private provideOriginalResource(uri: vscode.Uri): vscode.ProviderResult<vscode.Uri> {
        if (!uri.fsPath.startsWith(this.rootPath)) {
            return undefined;
        }

        return this.contentProvider.createUri({
            label: `${nodePath.relative(this.rootPath, uri.fsPath)} (BASE)`,
            source: "svn",
            target: uri.fsPath,
            revision: "BASE",
        });
    }

    public resolveRepositoryUrl(absolutePath: string): string {
        const relativePath = nodePath.relative(this.rootPath, absolutePath);
        return buildRepositoryUrl(
            this.info.repositoryRoot,
            posixJoin(this.info.repositoryRelativePath, relativePath)
        );
    }
}
