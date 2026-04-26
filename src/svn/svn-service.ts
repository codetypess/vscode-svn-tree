import { execFile } from "node:child_process";
import * as nodePath from "node:path";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { parseInfoXml, parseLogXml, parseNodeInfoXml, parseStatusXml } from "./svn-xml-parser";
import type { SvnLogEntry, SvnNodeInfo, SvnStatusEntry, SvnWorkingCopyInfo } from "./svn-types";

const execFileAsync = promisify(execFile);
const historyLogRetryCount = 1;
const historyLogRetryDelayMs = 1500;
const historyLogInitialTimeoutMs = 3000;
const historyLogTimeoutBackoffFactor = 2;
const maxHistoryLogTimeoutMs = 20000;

interface RunSvnOptions {
    cwd?: string;
    quiet?: boolean;
    retryCount?: number;
    retryDelayMs?: number;
    timeoutMs?: number;
    getTimeoutMs?: (attempt: number, totalAttempts: number) => number | undefined;
}

type SvnResolveAcceptOption = "working" | "mine-full" | "theirs-full";

export class SvnService {
    public constructor(private readonly outputChannel: vscode.OutputChannel) {}

    public async checkAvailability(): Promise<boolean> {
        try {
            await this.run(["--version", "--quiet"], { quiet: true });
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
        targetPath?: string
    ): Promise<SvnLogEntry[]> {
        if (beforeRevision !== undefined && beforeRevision < 1) {
            return [];
        }

        const args = ["log", "--xml", "-v", "-l", String(limit)];
        const upperBound = beforeRevision !== undefined ? String(Math.floor(beforeRevision)) : "HEAD";
        args.push("-r", `${upperBound}:1`);

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

    public async commit(rootPath: string, message: string, paths?: string[]): Promise<void> {
        const targets = this.toRelativeTargets(rootPath, paths);
        const args = ["commit", "-m", message, ...targets];
        await this.run(args, { cwd: rootPath });
    }

    public async update(rootPath: string, paths?: string[], revision?: string): Promise<void> {
        const targets = this.toRelativeTargets(rootPath, paths);
        const args = ["update"];
        if (revision) {
            args.push("-r", revision);
        }

        args.push(...targets);
        await this.run(args, { cwd: rootPath });
    }

    public async blame(rootPath: string, targetPath: string): Promise<string> {
        const [target] = this.toRelativeTargets(rootPath, [targetPath]);
        const { stdout } = await this.run(["blame", "-v", target], { cwd: rootPath });
        return stdout;
    }

    public async switch(rootPath: string, target: string): Promise<void> {
        await this.run(["switch", target, "."], { cwd: rootPath });
    }

    public async relocate(rootPath: string, targetUrl: string): Promise<void> {
        await this.run(["relocate", targetUrl, "."], { cwd: rootPath });
    }

    public async checkout(target: string, revision: string, destinationPath: string): Promise<void> {
        const args = ["checkout", "-r", revision, target, destinationPath];
        await this.run(args);
    }

    public async export(target: string, revision: string, destinationPath: string): Promise<void> {
        const args = ["export", "-r", revision, target, destinationPath];
        await this.run(args);
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
        await this.run(args);
    }

    public async reverseMergeRevision(
        rootPath: string,
        source: string,
        revision: number
    ): Promise<void> {
        await this.run(
            ["merge", "--accept", "postpone", "-c", `-${revision}`, source, "."],
            { cwd: rootPath }
        );
    }

    public async reverseMergeToRevision(
        rootPath: string,
        source: string,
        revision: number
    ): Promise<void> {
        await this.run(
            ["merge", "--accept", "postpone", "-r", `HEAD:${revision}`, source, "."],
            { cwd: rootPath }
        );
    }

    public async cleanup(rootPath: string): Promise<void> {
        await this.run(["cleanup", "."], { cwd: rootPath });
    }

    public async revert(rootPath: string, paths: string[]): Promise<void> {
        const targets = this.toRelativeTargets(rootPath, paths);
        const args = ["revert", "-R", ...targets];
        await this.run(args, { cwd: rootPath });
    }

    public async add(rootPath: string, paths: string[]): Promise<void> {
        const targets = this.toRelativeTargets(rootPath, paths);
        const args = ["add", "--parents", ...targets];
        await this.run(args, { cwd: rootPath });
    }

    public async delete(rootPath: string, paths: string[]): Promise<void> {
        const targets = this.toRelativeTargets(rootPath, paths);
        const args = ["delete", "--force", ...targets];
        await this.run(args, { cwd: rootPath });
    }

    public async deleteUrl(target: string, message: string): Promise<void> {
        await this.run(["delete", target, "-m", message]);
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
        await this.run(["move", sourceTarget, destinationTarget], { cwd: rootPath });
    }

    public async lock(rootPath: string, paths: string[]): Promise<void> {
        const targets = this.toRelativeTargets(rootPath, paths);
        await this.run(["lock", ...targets], { cwd: rootPath });
    }

    public async unlock(rootPath: string, paths: string[]): Promise<void> {
        const targets = this.toRelativeTargets(rootPath, paths);
        await this.run(["unlock", ...targets], { cwd: rootPath });
    }

    public async addToChangelist(rootPath: string, paths: string[], name: string): Promise<void> {
        const targets = this.toRelativeTargets(rootPath, paths);
        await this.run(["changelist", name, ...targets], { cwd: rootPath });
    }

    public async removeFromChangelist(rootPath: string, paths: string[]): Promise<void> {
        const targets = this.toRelativeTargets(rootPath, paths);
        await this.run(["changelist", "--remove", ...targets], { cwd: rootPath });
    }

    public async commitChangelist(
        rootPath: string,
        message: string,
        changelist: string
    ): Promise<void> {
        await this.run(
            ["commit", "--changelist", changelist, "-m", message, "."],
            { cwd: rootPath }
        );
    }

    public async resolve(
        rootPath: string,
        paths: string[],
        accept: SvnResolveAcceptOption
    ): Promise<void> {
        const targets = this.toRelativeTargets(rootPath, paths);
        const args = ["resolve", "--accept", accept, ...targets];
        await this.run(args, { cwd: rootPath });
    }

    public async getProperty(target: string, name: string): Promise<string | undefined> {
        try {
            const { stdout } = await this.run(["propget", name, target], { quiet: true });
            return stdout.replace(/\r\n/g, "\n").replace(/\n$/, "");
        } catch {
            return undefined;
        }
    }

    public async setProperty(target: string, name: string, value: string): Promise<void> {
        await this.run(["propset", name, value, target], {
            cwd: nodePath.isAbsolute(target) ? nodePath.dirname(target) : undefined,
        });
    }

    public async deleteProperty(target: string, name: string): Promise<void> {
        await this.run(["propdel", name, target], {
            cwd: nodePath.isAbsolute(target) ? nodePath.dirname(target) : undefined,
        });
    }

    public async cat(target: string, revision: string): Promise<string> {
        const { stdout } = await this.run(["cat", "-r", revision, target], {
            cwd: nodePath.isAbsolute(target) ? nodePath.dirname(target) : undefined,
        });

        return stdout;
    }

    private async run(
        args: string[],
        options: RunSvnOptions = {}
    ): Promise<{ stdout: string; stderr: string }> {
        const totalAttempts = Math.max(1, (options.retryCount ?? 0) + 1);

        for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
            const timeoutMs = this.resolveTimeoutMs(options, attempt, totalAttempts);
            if (!options.quiet) {
                this.outputChannel.appendLine(
                    this.renderCommand(args, options, attempt, totalAttempts, timeoutMs)
                );
            }

            try {
                return await execFileAsync("svn", args, {
                    cwd: options.cwd,
                    encoding: "utf8",
                    maxBuffer: 16 * 1024 * 1024,
                    timeout: timeoutMs,
                });
            } catch (error) {
                const message = this.renderError(error, args, timeoutMs);
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
                    throw new Error(finalMessage);
                }

                const retryDelayMs = options.retryDelayMs ?? 0;
                this.outputChannel.appendLine(
                    `Retrying svn ${args[0]} in ${Math.max(retryDelayMs, 0)}ms ` +
                        `(${attempt + 1}/${totalAttempts})`
                );

                if (retryDelayMs > 0) {
                    await this.delay(retryDelayMs);
                }
            }
        }

        throw new Error("SVN command did not complete.");
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
        args: string[],
        options: RunSvnOptions,
        attempt: number,
        totalAttempts: number,
        _timeoutMs?: number
    ): string {
        const renderedCwd = options.cwd ? ` (cwd: ${options.cwd})` : "";
        const attemptSuffix =
            totalAttempts > 1 && attempt > 1 ? ` [attempt ${attempt}/${totalAttempts}]` : "";

        return `svn ${args.join(" ")}${renderedCwd}${attemptSuffix}`;
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

    private renderError(
        error: unknown,
        args?: string[],
        timeoutMs?: number
    ): string {
        if (
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
}
