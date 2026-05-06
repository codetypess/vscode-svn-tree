import { spawn } from "node:child_process";
import { promises as nodeFs } from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import * as vscode from "vscode";
import {
    hasActiveHistoryFilters,
    hasInvalidHistoryDateRange,
    matchesHistoryFilters,
    normalizeHistoryFilters,
} from "../history/history-utils";
import {
    parseInfoXml,
    parseListXml,
    parseLogXml,
    parseNodeInfoXml,
    parsePropertyListXml,
    parseStatusXml,
} from "./svn-xml-parser";
import type {
    SvnConflictAcceptOption,
    SvnCheckoutOptions,
    SvnHistoryFilters,
    SvnLogEntry,
    SvnNodeInfo,
    SvnPropertyEntry,
    SvnRepositoryListEntry,
    SvnStatusEntry,
    SvnUpdateOptions,
    SvnWorkingCopyInfo,
} from "./svn-types";

const historyLogRetryCount = 1;
const historyLogRetryDelayMs = 1500;
const historyLogInitialTimeoutMs = 3000;
const historyLogTimeoutBackoffFactor = 2;
const maxHistoryLogTimeoutMs = 20000;
const filteredHistoryLogScanMultiplier = 3;
const filteredHistoryLogMinScanLimit = 100;
const filteredHistoryLogMaxScanLimit = 600;
const retainedErrorOutputLimit = 64 * 1024;

interface RunSvnOptions {
    cwd?: string;
    quiet?: boolean;
    retryCount?: number;
    retryDelayMs?: number;
    timeoutMs?: number;
    getTimeoutMs?: (attempt: number, totalAttempts: number) => number | undefined;
    captureOutput?: boolean;
    executable?: "svn" | "svnmucc";
    actionName?: string;
}

interface SvnMergeRunOptions {
    readonly dryRun?: boolean;
    readonly accept?: SvnConflictAcceptOption;
}

interface SvnLogQueryResult {
    entries: SvnLogEntry[];
    hasMore: boolean;
    nextBeforeRevision?: number;
}

export interface SvnPatchRunOptions {
    readonly dryRun?: boolean;
    readonly stripCount?: number;
    readonly reverse?: boolean;
}

export interface SvnPatchRunResult {
    readonly succeeded: boolean;
    readonly output: string;
    readonly errorMessage?: string;
}

function toPegTarget(target: string, revision?: string): string {
    if (!revision) {
        return target;
    }

    return `${target}@${revision}`;
}

function isRepositoryUrlTarget(target: string): boolean {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(target);
}

export class SvnService {
    public constructor(private readonly outputChannel: vscode.OutputChannel) {}

    public async checkAvailability(): Promise<boolean> {
        try {
            await this.runWithoutOutput(["--version", "--quiet"], { quiet: true });
            return true;
        } catch {
            return false;
        }
    }

    public async getWorkingCopyInfo(
        candidatePath: string
    ): Promise<SvnWorkingCopyInfo | undefined> {
        try {
            const { stdout } = await this.run(["info", "--xml", candidatePath], { quiet: true });
            return parseInfoXml(stdout, candidatePath);
        } catch {
            return undefined;
        }
    }

    public async getNodeInfo(candidatePath: string): Promise<SvnNodeInfo | undefined> {
        try {
            const { stdout } = await this.run(["info", "--xml", candidatePath], { quiet: true });
            return parseNodeInfoXml(stdout, candidatePath);
        } catch {
            return undefined;
        }
    }

    public async getStatus(rootPath: string, includeRemote: boolean): Promise<SvnStatusEntry[]> {
        const args = ["status", "--xml", "--verbose"];
        if (includeRemote) {
            args.push("-u");
        }

        args.push(".");

        const { stdout } = await this.run(args, { cwd: rootPath });
        return parseStatusXml(stdout, rootPath);
    }

    public async getLog(
        rootPath: string,
        limit: number,
        beforeRevision?: number,
        targetPath?: string,
        filters?: SvnHistoryFilters
    ): Promise<SvnLogQueryResult> {
        if (beforeRevision !== undefined && beforeRevision < 1) {
            return {
                entries: [],
                hasMore: false,
            };
        }

        const normalizedFilters = normalizeHistoryFilters(filters);
        if (hasInvalidHistoryDateRange(normalizedFilters)) {
            return {
                entries: [],
                hasMore: false,
            };
        }

        if (hasActiveHistoryFilters(normalizedFilters)) {
            return this.getFilteredLog(
                rootPath,
                limit,
                beforeRevision,
                targetPath,
                normalizedFilters
            );
        }

        const entries = await this.runHistoryLog(
            rootPath,
            limit,
            beforeRevision !== undefined ? String(Math.floor(beforeRevision)) : "HEAD",
            "1",
            targetPath
        );
        const oldestRevision = entries.at(-1)?.revision;

        return {
            entries,
            hasMore: entries.length === limit && oldestRevision !== undefined && oldestRevision > 1,
            nextBeforeRevision:
                oldestRevision !== undefined && oldestRevision > 1 ? oldestRevision - 1 : undefined,
        };
    }

    public async getLogEntryAtRevision(
        rootPath: string,
        revision: number,
        targetPath?: string
    ): Promise<SvnLogEntry | undefined> {
        const entries = await this.runHistoryLog(
            rootPath,
            1,
            String(Math.floor(revision)),
            String(Math.floor(revision)),
            targetPath
        );

        return entries[0];
    }

    private async getFilteredLog(
        rootPath: string,
        limit: number,
        beforeRevision: number | undefined,
        targetPath: string | undefined,
        filters: SvnHistoryFilters
    ): Promise<SvnLogQueryResult> {
        const matches: SvnLogEntry[] = [];
        const scanLimit = this.getFilteredHistoryLogScanLimit(limit);
        const lowerBound = this.getHistoryLogLowerBound(filters);
        let upperBound =
            beforeRevision !== undefined
                ? String(Math.floor(beforeRevision))
                : this.getHistoryLogUpperBound(filters);

        while (true) {
            const entries = await this.runHistoryLog(
                rootPath,
                scanLimit,
                upperBound,
                lowerBound,
                targetPath
            );

            if (entries.length === 0) {
                return {
                    entries: matches,
                    hasMore: false,
                };
            }

            for (const entry of entries) {
                if (matchesHistoryFilters(entry, filters)) {
                    matches.push(entry);
                }

                if (matches.length >= limit) {
                    const oldestRevision = entries.at(-1)?.revision;
                    const nextBeforeRevision =
                        oldestRevision !== undefined && oldestRevision > 1
                            ? oldestRevision - 1
                            : undefined;

                    return {
                        entries: matches.slice(0, limit),
                        hasMore: nextBeforeRevision !== undefined,
                        nextBeforeRevision,
                    };
                }
            }

            const oldestRevision = entries.at(-1)?.revision;
            if (entries.length < scanLimit || oldestRevision === undefined || oldestRevision <= 1) {
                return {
                    entries: matches,
                    hasMore: false,
                };
            }

            upperBound = String(oldestRevision - 1);
        }
    }

    private async runHistoryLog(
        rootPath: string,
        limit: number,
        upperBound: string,
        lowerBound: string,
        targetPath?: string
    ): Promise<SvnLogEntry[]> {
        const args = ["log", "--xml", "-v", "-l", String(limit)];
        args.push("-r", `${upperBound}:${lowerBound}`);

        args.push(this.toLogTarget(rootPath, targetPath));

        const { stdout } = await this.run(args, {
            cwd: rootPath,
            retryCount: historyLogRetryCount,
            retryDelayMs: historyLogRetryDelayMs,
            getTimeoutMs: (attempt, totalAttempts) =>
                this.getHistoryLogTimeoutMs(attempt, totalAttempts, limit),
        });
        return parseLogXml(stdout);
    }

    private getFilteredHistoryLogScanLimit(limit: number): number {
        return Math.min(
            filteredHistoryLogMaxScanLimit,
            Math.max(
                filteredHistoryLogMinScanLimit,
                Math.floor(limit * filteredHistoryLogScanMultiplier)
            )
        );
    }

    private getHistoryLogUpperBound(filters: SvnHistoryFilters): string {
        if (!filters.dateTo) {
            return "HEAD";
        }

        const nextDate = this.addCalendarDays(filters.dateTo, 1);
        return nextDate ? `{${nextDate}}` : "HEAD";
    }

    private getHistoryLogLowerBound(filters: SvnHistoryFilters): string {
        return filters.dateFrom ? `{${filters.dateFrom}}` : "1";
    }

    private addCalendarDays(value: string, days: number): string | undefined {
        const date = new Date(`${value}T00:00:00Z`);
        if (Number.isNaN(date.getTime())) {
            return undefined;
        }

        date.setUTCDate(date.getUTCDate() + days);
        return date.toISOString().slice(0, 10);
    }

    public async commit(rootPath: string, message: string, paths?: string[]): Promise<void> {
        const targets = this.toRelativeTargets(rootPath, paths);
        const args = ["commit", "-m", message, ...targets];
        await this.runWithoutOutput(args, { cwd: rootPath });
    }

    public async update(
        rootPath: string,
        paths?: string[],
        options: SvnUpdateOptions = {}
    ): Promise<void> {
        await this.runWithoutOutput(this.buildUpdateArgs(rootPath, paths, options), {
            cwd: rootPath,
        });
    }

    public async blame(rootPath: string, targetPath: string): Promise<string> {
        const [target] = this.toRelativeTargets(rootPath, [targetPath]);
        const { stdout } = await this.run(["blame", "-v", target], { cwd: rootPath });
        return stdout;
    }

    public async blameTarget(target: string): Promise<string> {
        const { stdout } = await this.run(["blame", "-v", target]);
        return stdout;
    }

    public async switch(rootPath: string, target: string): Promise<void> {
        await this.runWithoutOutput(["switch", target, "."], { cwd: rootPath });
    }

    public async relocate(rootPath: string, targetUrl: string): Promise<void> {
        await this.runWithoutOutput(["relocate", targetUrl, "."], { cwd: rootPath });
    }

    public async checkout(
        target: string,
        revision: string,
        destinationPath: string,
        options: SvnCheckoutOptions = {}
    ): Promise<void> {
        const args = ["checkout", "-r", revision];
        if (options.depth) {
            args.push("--depth", options.depth);
        }

        args.push(target, destinationPath);
        await this.runWithoutOutput(args);
    }

    public async importToUrl(
        sourcePath: string,
        targetUrl: string,
        message: string
    ): Promise<void> {
        await this.runWithoutOutput(["import", sourcePath, targetUrl, "-m", message]);
    }

    public async export(target: string, revision: string, destinationPath: string): Promise<void> {
        const args = ["export", "-r", revision, target, destinationPath];
        await this.runWithoutOutput(args);
    }

    public async supportsPatch(): Promise<boolean> {
        try {
            await this.runWithoutOutput(["help", "patch"], { quiet: true });
            return true;
        } catch {
            return false;
        }
    }

    public async diffWorkingCopy(rootPath: string, paths?: string[]): Promise<string> {
        const targets = this.toRelativeTargets(rootPath, paths);
        const { stdout } = await this.run(["diff", ...targets], { cwd: rootPath });
        return stdout;
    }

    public async diffRevision(
        rootPath: string,
        revision: number,
        targetPath?: string
    ): Promise<string> {
        const { stdout } = await this.run(
            ["diff", "-c", String(Math.max(1, Math.floor(revision))), this.toLogTarget(rootPath, targetPath)],
            { cwd: rootPath }
        );
        return stdout;
    }

    public async patch(
        rootPath: string,
        patchFilePath: string,
        options: SvnPatchRunOptions = {}
    ): Promise<SvnPatchRunResult> {
        const args = ["patch"];
        if (options.dryRun) {
            args.push("--dry-run");
        }

        const normalizedStripCount = normalizePatchStripCount(options.stripCount);
        if (normalizedStripCount !== undefined) {
            args.push("--strip", String(normalizedStripCount));
        }

        if (options.reverse) {
            args.push("--reverse-diff");
        }

        args.push(patchFilePath, ".");

        try {
            const { stdout, stderr } = await this.run(args, { cwd: rootPath, captureOutput: true });
            return {
                succeeded: true,
                output: this.joinCommandOutput(stdout, stderr),
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                succeeded: false,
                output: this.extractCommandOutput(error) ?? errorMessage,
                errorMessage,
            };
        }
    }

    public async mkdir(target: string, message: string): Promise<void> {
        await this.runWithoutOutput(["mkdir", "-m", message, target]);
    }

    public async copy(
        source: string,
        destination: string,
        message: string,
        revision?: string
    ): Promise<void> {
        const args = ["copy"];
        if (revision) {
            args.push("-r", revision);
        }

        args.push("-m", message, source, destination);
        await this.runWithoutOutput(args);
    }

    public async mergeRevision(
        rootPath: string,
        source: string,
        revision: number,
        options: SvnMergeRunOptions = {}
    ): Promise<void> {
        await this.runWithoutOutput(
            this.buildMergeArgs(["-c", String(Math.floor(revision)), source, "."], options),
            { cwd: rootPath }
        );
    }

    public async mergeRevisionRange(
        rootPath: string,
        source: string,
        fromRevision: number,
        toRevision: number,
        options: SvnMergeRunOptions = {}
    ): Promise<void> {
        await this.runWithoutOutput(
            this.buildMergeArgs(
                ["-r", `${Math.floor(fromRevision)}:${Math.floor(toRevision)}`, source, "."],
                options
            ),
            { cwd: rootPath }
        );
    }

    public async reverseMergeRevision(
        rootPath: string,
        source: string,
        revision: number,
        options: SvnMergeRunOptions = {}
    ): Promise<void> {
        await this.runWithoutOutput(
            this.buildMergeArgs(["-c", `-${Math.floor(revision)}`, source, "."], options),
            { cwd: rootPath }
        );
    }

    public async reverseMergeToRevision(
        rootPath: string,
        source: string,
        revision: number,
        options: SvnMergeRunOptions = {}
    ): Promise<void> {
        await this.runWithoutOutput(
            this.buildMergeArgs(["-r", `HEAD:${Math.floor(revision)}`, source, "."], options),
            { cwd: rootPath }
        );
    }

    public async cleanup(rootPath: string): Promise<void> {
        await this.runWithoutOutput(["cleanup", "."], { cwd: rootPath });
    }

    public async revert(rootPath: string, paths?: string[]): Promise<void> {
        const targets = this.toRelativeTargets(rootPath, paths);
        const args = ["revert", "-R", ...targets];
        await this.runWithoutOutput(args, { cwd: rootPath });
    }

    public async add(rootPath: string, paths: string[]): Promise<void> {
        const targets = this.toRelativeTargets(rootPath, paths);
        const args = ["add", "--parents", ...targets];
        await this.runWithoutOutput(args, { cwd: rootPath });
    }

    public async delete(rootPath: string, paths: string[]): Promise<void> {
        const targets = this.toRelativeTargets(rootPath, paths);
        const args = ["delete", "--force", ...targets];
        await this.runWithoutOutput(args, { cwd: rootPath });
    }

    public async deleteUrl(target: string, message: string): Promise<void> {
        await this.runWithoutOutput(["delete", target, "-m", message]);
    }

    public async move(
        rootPath: string,
        sourcePath: string,
        destinationPath: string
    ): Promise<void> {
        const [sourceTarget, destinationTarget] = this.toRelativeTargets(rootPath, [
            sourcePath,
            destinationPath,
        ]);
        await this.runWithoutOutput(["move", sourceTarget, destinationTarget], {
            cwd: rootPath,
        });
    }

    public async moveUrl(source: string, destination: string, message: string): Promise<void> {
        await this.runWithoutOutput(["move", "-m", message, source, destination]);
    }

    private buildMergeArgs(mergeArgs: string[], options: SvnMergeRunOptions = {}): string[] {
        const args = ["merge"];
        if (options.dryRun) {
            args.push("--dry-run");
        }

        args.push("--accept", options.accept ?? "postpone", ...mergeArgs);
        return args;
    }

    private buildUpdateArgs(
        rootPath: string,
        paths?: string[],
        options: SvnUpdateOptions = {}
    ): string[] {
        const targets = this.toRelativeTargets(rootPath, paths);
        const args = ["update", "--accept", options.accept ?? "postpone"];
        if (options.revision) {
            args.push("-r", options.revision);
        }

        if (options.depth) {
            args.push(options.setDepth ? "--set-depth" : "--depth", options.depth);
        }

        args.push(...targets);
        return args;
    }

    public async lock(rootPath: string, paths: string[]): Promise<void> {
        const targets = this.toRelativeTargets(rootPath, paths);
        await this.runWithoutOutput(["lock", ...targets], { cwd: rootPath });
    }

    public async unlock(rootPath: string, paths: string[]): Promise<void> {
        const targets = this.toRelativeTargets(rootPath, paths);
        await this.runWithoutOutput(["unlock", ...targets], { cwd: rootPath });
    }

    public async addToChangelist(rootPath: string, paths: string[], name: string): Promise<void> {
        const targets = this.toRelativeTargets(rootPath, paths);
        await this.runWithoutOutput(["changelist", name, ...targets], { cwd: rootPath });
    }

    public async removeFromChangelist(rootPath: string, paths: string[]): Promise<void> {
        const targets = this.toRelativeTargets(rootPath, paths);
        await this.runWithoutOutput(["changelist", "--remove", ...targets], {
            cwd: rootPath,
        });
    }

    public async commitChangelist(
        rootPath: string,
        message: string,
        changelist: string
    ): Promise<void> {
        await this.runWithoutOutput(["commit", "--changelist", changelist, "-m", message, "."], {
            cwd: rootPath,
        });
    }

    public async resolve(
        rootPath: string,
        paths: string[],
        accept: SvnConflictAcceptOption
    ): Promise<void> {
        const targets = this.toRelativeTargets(rootPath, paths);
        const args = ["resolve", "--accept", accept, ...targets];
        await this.runWithoutOutput(args, { cwd: rootPath });
    }

    public async getProperty(target: string, name: string): Promise<string | undefined> {
        try {
            const { stdout } = await this.run(["propget", name, target], { quiet: true });
            return stdout.replace(/\r\n/g, "\n").replace(/\n$/, "");
        } catch {
            return undefined;
        }
    }

    public async getProperties(target: string): Promise<SvnPropertyEntry[]> {
        const { stdout } = await this.run(["proplist", "--xml", "-v", target], { quiet: true });
        return parsePropertyListXml(stdout);
    }

    public async setProperty(
        target: string,
        name: string,
        value: string,
        options: {
            message?: string;
        } = {}
    ): Promise<void> {
        if (isRepositoryUrlTarget(target)) {
            if (!options.message) {
                throw new Error("Remote property updates require a commit message.");
            }

            await this.withTemporaryFile(value, async (filePath) => {
                await this.runWithoutOutput(
                    ["-m", options.message ?? "", "propsetf", name, filePath, target],
                    {
                        executable: "svnmucc",
                        actionName: "propsetf",
                    }
                );
            });
            return;
        }

        await this.runWithoutOutput(["propset", name, value, target], {
            cwd: nodePath.isAbsolute(target) ? nodePath.dirname(target) : undefined,
        });
    }

    public async deleteProperty(
        target: string,
        name: string,
        options: {
            message?: string;
        } = {}
    ): Promise<void> {
        if (isRepositoryUrlTarget(target)) {
            if (!options.message) {
                throw new Error("Remote property updates require a commit message.");
            }

            await this.runWithoutOutput(["-m", options.message ?? "", "propdel", name, target], {
                executable: "svnmucc",
                actionName: "propdel",
            });
            return;
        }

        await this.runWithoutOutput(["propdel", name, target], {
            cwd: nodePath.isAbsolute(target) ? nodePath.dirname(target) : undefined,
        });
    }

    public async cat(target: string, revision: string): Promise<string> {
        const { stdout } = await this.run(["cat", "-r", revision, target], {
            cwd: nodePath.isAbsolute(target) ? nodePath.dirname(target) : undefined,
        });

        return stdout;
    }

    public async diff(
        sourceTarget: string,
        targetTarget: string,
        options: {
            summarize?: boolean;
            sourceRevision?: string;
            targetRevision?: string;
        } = {}
    ): Promise<string> {
        const args = ["diff"];
        if (options.summarize) {
            args.push("--summarize");
        }

        args.push(
            toPegTarget(sourceTarget, options.sourceRevision ?? "HEAD"),
            toPegTarget(targetTarget, options.targetRevision ?? "HEAD")
        );

        const { stdout } = await this.run(args, {
            cwd:
                nodePath.isAbsolute(sourceTarget) && nodePath.isAbsolute(targetTarget)
                    ? nodePath.dirname(sourceTarget)
                    : undefined,
        });

        return stdout;
    }

    public async list(target: string): Promise<SvnRepositoryListEntry[]> {
        const { stdout } = await this.run(["list", "--xml", target], { quiet: true });
        return parseListXml(stdout);
    }

    private async run(
        args: string[],
        options: RunSvnOptions = {}
    ): Promise<{ stdout: string; stderr: string }> {
        const totalAttempts = Math.max(1, (options.retryCount ?? 0) + 1);
        const executable = options.executable ?? "svn";
        const actionName = options.actionName ?? args[0] ?? "command";

        for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
            const timeoutMs = this.resolveTimeoutMs(options, attempt, totalAttempts);
            if (!options.quiet) {
                this.outputChannel.appendLine(
                    this.renderCommand(executable, args, options, attempt, totalAttempts, timeoutMs)
                );
            }

            try {
                return await this.spawnProcess(executable, args, options, timeoutMs);
            } catch (error) {
                const message = this.renderError(executable, error, args, timeoutMs);
                const canRetry = attempt < totalAttempts && this.shouldRetry(error, timeoutMs);
                const attemptMessage =
                    totalAttempts > 1 && attempt > 1
                        ? `${message} (attempt ${attempt}/${totalAttempts})`
                        : message;

                this.outputChannel.appendLine(attemptMessage);

                if (!canRetry) {
                    const finalMessage =
                        totalAttempts > 1 && attempt > 1
                            ? `${message} Failed after ${attempt} attempts.`
                            : message;
                    throw this.createCommandError(finalMessage, error);
                }

                const retryDelayMs = options.retryDelayMs ?? 0;
                this.outputChannel.appendLine(
                    `Retrying ${executable} ${actionName} in ${Math.max(retryDelayMs, 0)}ms ` +
                        `(${attempt + 1}/${totalAttempts})`
                );

                if (retryDelayMs > 0) {
                    await this.delay(retryDelayMs);
                }
            }
        }

        throw new Error("SVN command did not complete.");
    }

    private async runWithoutOutput(args: string[], options: RunSvnOptions = {}): Promise<void> {
        await this.run(args, {
            ...options,
            captureOutput: false,
        });
    }

    private async spawnProcess(
        executable: "svn" | "svnmucc",
        args: string[],
        options: RunSvnOptions,
        timeoutMs?: number
    ): Promise<{ stdout: string; stderr: string }> {
        const captureOutput = options.captureOutput ?? true;

        return await new Promise((resolve, reject) => {
            const child = spawn(executable, args, {
                cwd: options.cwd,
                stdio: ["ignore", "pipe", "pipe"],
            });
            let stdout = "";
            let stderr = "";
            let retainedOutput = "";
            let timedOut = false;
            let finished = false;
            let killTimer: NodeJS.Timeout | undefined;
            let forceKillTimer: NodeJS.Timeout | undefined;

            child.stdout.setEncoding("utf8");
            child.stderr.setEncoding("utf8");

            const cleanup = (): void => {
                if (killTimer) {
                    clearTimeout(killTimer);
                }

                if (forceKillTimer) {
                    clearTimeout(forceKillTimer);
                }
            };

            const finish = (handler: () => void): void => {
                if (finished) {
                    return;
                }

                finished = true;
                cleanup();
                handler();
            };

            child.stdout.on("data", (chunk: string) => {
                if (captureOutput) {
                    stdout += chunk;
                } else {
                    retainedOutput = this.appendRetainedOutput(retainedOutput, chunk);
                }

                if (!options.quiet && !captureOutput) {
                    this.outputChannel.append(chunk);
                }
            });

            child.stderr.on("data", (chunk: string) => {
                if (captureOutput) {
                    stderr += chunk;
                } else {
                    retainedOutput = this.appendRetainedOutput(retainedOutput, chunk);
                }

                if (!options.quiet && !captureOutput) {
                    this.outputChannel.append(chunk);
                }
            });

            child.once("error", (error) => {
                finish(() => reject(error));
            });

            child.once("close", (code, signal) => {
                finish(() => {
                    if (code === 0 && signal === null) {
                        resolve({ stdout, stderr });
                        return;
                    }

                    const outputExcerpt = captureOutput ? stderr || stdout : retainedOutput;
                    reject(
                        this.createProcessError(executable, options.actionName, args, {
                            code,
                            signal,
                            timedOut,
                            outputExcerpt,
                        })
                    );
                });
            });

            if (typeof timeoutMs === "number" && timeoutMs > 0) {
                killTimer = setTimeout(() => {
                    timedOut = true;
                    child.kill("SIGTERM");

                    forceKillTimer = setTimeout(() => {
                        child.kill("SIGKILL");
                    }, 1000);
                }, timeoutMs);
            }
        });
    }

    private toRelativeTargets(rootPath: string, paths?: string[]): string[] {
        if (!paths || paths.length === 0) {
            return ["."];
        }

        return paths.map((targetPath) => {
            const relativePath = nodePath.relative(rootPath, targetPath);
            return relativePath.length > 0 ? relativePath : ".";
        });
    }

    private toLogTarget(rootPath: string, targetPath?: string): string {
        if (!targetPath) {
            return ".";
        }

        const relativePath = nodePath.isAbsolute(targetPath)
            ? nodePath.relative(rootPath, targetPath)
            : targetPath;

        return relativePath.length > 0 ? relativePath : ".";
    }

    private renderCommand(
        executable: "svn" | "svnmucc",
        args: string[],
        options: RunSvnOptions,
        attempt: number,
        totalAttempts: number,
        _timeoutMs?: number
    ): string {
        const renderedCwd = options.cwd ? ` (cwd: ${options.cwd})` : "";
        const attemptSuffix =
            totalAttempts > 1 && attempt > 1 ? ` [attempt ${attempt}/${totalAttempts}]` : "";

        return `${executable} ${args.join(" ")}${renderedCwd}${attemptSuffix}`;
    }

    private appendRetainedOutput(current: string, chunk: string): string {
        const nextValue = current + chunk;
        return nextValue.length <= retainedErrorOutputLimit
            ? nextValue
            : nextValue.slice(-retainedErrorOutputLimit);
    }

    private resolveTimeoutMs(
        options: RunSvnOptions,
        attempt: number,
        totalAttempts: number
    ): number | undefined {
        if (typeof options.getTimeoutMs === "function") {
            return options.getTimeoutMs(attempt, totalAttempts);
        }

        return options.timeoutMs;
    }

    private shouldRetry(error: unknown, timeoutMs?: number): boolean {
        if (typeof timeoutMs !== "number" || timeoutMs <= 0) {
            return false;
        }

        return this.isTimeoutError(error);
    }

    private isTimeoutError(error: unknown): boolean {
        if (!(error instanceof Error)) {
            return false;
        }

        const timedOutError = error as Error & {
            killed?: boolean;
            signal?: NodeJS.Signals | null;
        };

        return timedOutError.killed === true || /timed out/i.test(error.message);
    }

    private getHistoryLogTimeoutMs(
        attempt: number,
        _totalAttempts: number,
        _limit: number
    ): number {
        return Math.min(
            maxHistoryLogTimeoutMs,
            historyLogInitialTimeoutMs *
                Math.pow(historyLogTimeoutBackoffFactor, Math.max(0, attempt - 1))
        );
    }

    private async delay(milliseconds: number): Promise<void> {
        await new Promise<void>((resolve) => {
            setTimeout(resolve, milliseconds);
        });
    }

    private createProcessError(
        executable: "svn" | "svnmucc",
        actionName: string | undefined,
        args: string[],
        options: {
            code: number | null;
            signal: NodeJS.Signals | null;
            timedOut: boolean;
            outputExcerpt: string;
        }
    ): Error {
        const action = actionName ?? args[0] ?? "command";
        const excerpt = options.outputExcerpt.trim();
        const message = options.timedOut
            ? `${executable} ${action} timed out.`
            : excerpt ||
              `${executable} ${action} failed with exit code ${options.code ?? "unknown"}.`;
        const error = new Error(message) as Error & {
            killed?: boolean;
            signal?: NodeJS.Signals | null;
            outputExcerpt?: string;
        };
        error.killed = options.timedOut;
        error.signal = options.signal;
        error.outputExcerpt = excerpt || undefined;
        return error;
    }

    private createCommandError(message: string, cause: unknown): Error {
        if (cause instanceof Error && cause.message === message) {
            return cause;
        }

        return new Error(message, { cause });
    }

    private renderError(
        executable: "svn" | "svnmucc",
        error: unknown,
        args?: string[],
        timeoutMs?: number
    ): string {
        if (
            executable === "svn" &&
            this.isTimeoutError(error) &&
            Array.isArray(args) &&
            args[0] === "log" &&
            typeof timeoutMs === "number" &&
            timeoutMs > 0
        ) {
            return (
                `svn log timed out after ${Math.ceil(timeoutMs / 1000)}s. ` +
                "If this keeps happening, lower `svn-tree.max-log-entries`."
            );
        }

        if (error instanceof Error) {
            return error.message;
        }

        return String(error);
    }

    private joinCommandOutput(stdout: string, stderr: string): string {
        if (!stdout) {
            return stderr;
        }

        if (!stderr) {
            return stdout;
        }

        return `${stdout}\n${stderr}`;
    }

    private extractCommandOutput(error: unknown): string | undefined {
        let currentError = error;
        while (currentError instanceof Error) {
            const outputExcerpt = (currentError as Error & { outputExcerpt?: unknown }).outputExcerpt;
            if (typeof outputExcerpt === "string" && outputExcerpt.trim()) {
                return outputExcerpt;
            }

            const cause = (currentError as Error & { cause?: unknown }).cause;
            if (cause === currentError) {
                break;
            }

            currentError = cause;
        }

        return undefined;
    }

    private async withTemporaryFile<T>(
        content: string,
        action: (filePath: string) => Promise<T>
    ): Promise<T> {
        const directoryPath = await nodeFs.mkdtemp(nodePath.join(nodeOs.tmpdir(), "svn-tree-"));
        const filePath = nodePath.join(directoryPath, "property-value.txt");

        try {
            await nodeFs.writeFile(filePath, content, "utf8");
            return await action(filePath);
        } finally {
            await nodeFs.rm(directoryPath, {
                recursive: true,
                force: true,
            });
        }
    }
}

function normalizePatchStripCount(value: number | undefined): number | undefined {
    return Number.isInteger(value) && (value ?? 0) >= 0 ? value : undefined;
}
