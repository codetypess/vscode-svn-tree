import type { MessageKey } from "../i18n";
import type { SvnCheckoutDepth, SvnDepth } from "../svn/svn-types";

export interface SvnDepthOption<TDepth extends string> {
    readonly depth: TDepth;
    readonly labelKey: MessageKey;
    readonly descriptionKey: MessageKey;
}

const checkoutDepthOptions: readonly SvnDepthOption<SvnCheckoutDepth>[] = [
    {
        depth: "infinity",
        labelKey: "depthInfinityLabel",
        descriptionKey: "depthInfinityDescription",
    },
    {
        depth: "immediates",
        labelKey: "depthImmediatesLabel",
        descriptionKey: "depthImmediatesDescription",
    },
    {
        depth: "files",
        labelKey: "depthFilesLabel",
        descriptionKey: "depthFilesDescription",
    },
    {
        depth: "empty",
        labelKey: "depthEmptyLabel",
        descriptionKey: "depthEmptyDescription",
    },
];

const workingCopyDepthOptions: readonly SvnDepthOption<SvnDepth>[] = [
    ...checkoutDepthOptions,
    {
        depth: "exclude",
        labelKey: "depthExcludeLabel",
        descriptionKey: "depthExcludeDescription",
    },
];

export function getCheckoutDepthOptions(): readonly SvnDepthOption<SvnCheckoutDepth>[] {
    return checkoutDepthOptions;
}

export function getWorkingCopyDepthOptions(
    includeExclude: boolean
): readonly SvnDepthOption<SvnDepth>[] {
    return includeExclude ? workingCopyDepthOptions : checkoutDepthOptions;
}

export function getDepthLabelKey(depth: SvnDepth): MessageKey {
    switch (depth) {
        case "empty":
            return "depthEmptyLabel";
        case "files":
            return "depthFilesLabel";
        case "immediates":
            return "depthImmediatesLabel";
        case "exclude":
            return "depthExcludeLabel";
        default:
            return "depthInfinityLabel";
    }
}
