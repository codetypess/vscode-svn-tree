import * as vscode from "vscode";
import { getI18n } from "../vscode-i18n";
import { SvnService } from "./svn-service";

type SvnContentSource = "empty" | "svn";

interface SvnContentDescriptor {
    label: string;
    source: SvnContentSource;
    target?: string;
    revision?: string;
}

export class SvnContentProvider implements vscode.TextDocumentContentProvider {
    public static readonly scheme = "svn-tree";

    public constructor(private readonly svnService: SvnService) {}

    public provideTextDocumentContent(uri: vscode.Uri): Thenable<string> {
        const i18n = getI18n();
        const descriptor = this.parse(uri);

        if (descriptor.source === "empty") {
            return Promise.resolve("");
        }

        if (!descriptor.target || !descriptor.revision) {
            return Promise.resolve(i18n.t("missingDiffMetadata"));
        }

        return this.svnService
            .cat(descriptor.target, descriptor.revision)
            .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                return i18n.t("unableLoadSvnContent", { message });
            });
    }

    public createUri(descriptor: SvnContentDescriptor): vscode.Uri {
        const params = new URLSearchParams({
            label: descriptor.label,
            source: descriptor.source,
        });
        const uriPath = descriptor.label.startsWith("/")
            ? descriptor.label
            : `/${descriptor.label}`;

        if (descriptor.target) {
            params.set("target", descriptor.target);
        }

        if (descriptor.revision) {
            params.set("revision", descriptor.revision);
        }

        return vscode.Uri.from({
            scheme: SvnContentProvider.scheme,
            path: uriPath,
            query: params.toString(),
        });
    }

    private parse(uri: vscode.Uri): SvnContentDescriptor {
        const params = new URLSearchParams(uri.query);

        return {
            label: params.get("label") ?? "svn-content",
            source: (params.get("source") as SvnContentSource | null) ?? "svn",
            target: params.get("target") ?? undefined,
            revision: params.get("revision") ?? undefined,
        };
    }
}
