import { execFile } from "node:child_process";
import * as nodePath from "node:path";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { parseInfoXml, parseLogXml, parseStatusXml } from "./svn-xml-parser";
import type { SvnLogEntry, SvnStatusEntry, SvnWorkingCopyInfo } from "./svn-types";

const execFileAsync = promisify(execFile);

interface RunSvnOptions {
    cwd?: string;
    quiet?: boolean;
}

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

    public async getStatus(rootPath: string, includeRemote: boolean): Promise<SvnStatusEntry[]> {
        const args = ["status", "--xml", "--verbose"];
        if (includeRemote) {
            args.push("-u");
        }

        args.push(".");

        const { stdout } = await this.run(args, { cwd: rootPath });
        return parseStatusXml(stdout, rootPath);
    }

    public async getLog(rootPath: string, limit: number): Promise<SvnLogEntry[]> {
        const { stdout } = await this.run(["log", "--xml", "-v", "-l", String(limit), "."], {
            cwd: rootPath,
        });
        return parseLogXml(stdout);
    }

    public async commit(rootPath: string, message: string, paths?: string[]): Promise<void> {
        const targets = this.toRelativeTargets(rootPath, paths);
        const args = ["commit", "-m", message, ...targets];
        await this.run(args, { cwd: rootPath });
    }

    public async update(rootPath: string, paths?: string[]): Promise<void> {
        const targets = this.toRelativeTargets(rootPath, paths);
        const args = ["update", ...targets];
        await this.run(args, { cwd: rootPath });
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
        if (!options.quiet) {
            const renderedCwd = options.cwd ? ` (cwd: ${options.cwd})` : "";
            this.outputChannel.appendLine(`svn ${args.join(" ")}${renderedCwd}`);
        }

        try {
            return await execFileAsync("svn", args, {
                cwd: options.cwd,
                encoding: "utf8",
                maxBuffer: 16 * 1024 * 1024,
            });
        } catch (error) {
            const message = this.renderError(error);
            this.outputChannel.appendLine(message);
            throw new Error(message);
        }
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

    private renderError(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }

        return String(error);
    }
}
