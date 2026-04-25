export type SupportedLocale = "en" | "zh-CN";
export type DisplayLanguageSetting = "auto" | SupportedLocale;

const englishMessages = {
    openDiff: "Open Diff",
    incomingChange: "Incoming change",
    workingCopyChange: "Working copy change",
    statusLabel: "Status: {status}",
    authorLabel: "Author: {author}",
    committedRevisionLabel: "Committed revision: r{revision}",
    historyStatusTooltip: "Open SVN History",
    noSvnExecutableWarning: "SVN Tree could not find the `svn` executable on PATH.",
    noWorkingCopyInfo: "No SVN working copy is available in the current workspace.",
    selectWorkingCopyPlaceholder: "Select an SVN working copy",
    refreshStatusActionLabel: "Refresh SVN Status",
    refreshStatusActionDescription: "Reload local and incoming changes",
    refreshStatusProgress: "Refreshing SVN status for {label}...",
    refreshStatusCompleted: "SVN status refreshed for {label}",
    refreshStatusRunningTooltip: "Refreshing SVN status...",
    updateWorkingCopyActionLabel: "Update Working Copy",
    updateWorkingCopyActionDescription: "Download incoming changes from the repository",
    updateWorkingCopyProgress: "Updating working copy {label}...",
    updateWorkingCopyCompleted: "Working copy update completed for {label}",
    updateWorkingCopyRunningTooltip: "Updating working copy...",
    cleanupWorkingCopyActionLabel: "Cleanup Working Copy",
    cleanupWorkingCopyActionDescription: "Run svn cleanup for this working copy",
    cleanupWorkingCopyProgress: "Cleaning up working copy {label}...",
    cleanupWorkingCopyCompleted: "Working copy cleanup completed for {label}",
    cleanupWorkingCopyRunningTooltip: "Cleaning up working copy...",
    showOutputActionLabel: "Show SVN Output",
    showOutputActionDescription: "Open the extension output channel",
    actionsPlaceholder: "SVN actions for {label}",
    operationAlreadyRunning: "{action} is already running for {label}.",
    cannotOpenResourceWarning: "Cannot open {path} because it is {status}.",
    revertResourceWarning: "Revert changes in {path}?",
    revertButton: "Revert",
    revertGroupWarning: "Revert changes in {label}?",
    revertAllButton: "Revert All",
    deleteResourceWarning: "Delete {path} from disk?",
    deleteButton: "Delete",
    commitAcceptTitle: "Commit",
    commitInputPlaceholder: 'Message ({shortcut} to commit on "{target}")',
    changesGroupLabel: "Changes",
    unversionedGroupLabel: "Unversioned",
    remoteChangesGroupLabel: "Remote Changes",
    emptyCommitMessageError: "Enter a commit message before committing.",
    checkoutProgress: "Checking out r{revision}...",
    checkedOutMessage: "Checked out r{revision} to {destination}.",
    exportProgress: "Exporting r{revision}...",
    exportedMessage: "Exported r{revision} to {destination}.",
    compareWithWorkingCopyActionLower: "compare with the working copy",
    compareWithPreviousRevisionActionLower: "compare with the previous revision",
    historyNoFileChanges: "Revision r{revision} has no file changes to {action}.",
    selectFilePlaceholder: "Select a file to {action}",
    historyActionInRevision: "{action} in r{revision}",
    cannotMapPathWarning: "Cannot map {path} into the current working copy.",
    selectParentFolderLabel: "Select Parent Folder",
    selectParentFolderCheckoutTitle: "Select parent folder for checkout of r{revision}",
    selectParentFolderExportTitle: "Select parent folder for export of r{revision}",
    folderNameCheckoutPrompt: "Folder name for checkout of r{revision}",
    folderNameExportPrompt: "Folder name for export of r{revision}",
    folderNameRequired: "Folder name is required.",
    folderNamePathWarning: "Use a folder name, not a path.",
    destinationExistsWarning: "Destination already exists: {destination}",
    revealButton: "Reveal",
    revisionVsWorkingCopy: "{label} (r{revision} vs working copy)",
    checkingIncomingTooltip: "Checking for incoming changes...",
    updateTooltipNoIncoming: "Update",
    updateTooltipIncomingOne: "Update (1 incoming change)",
    updateTooltipIncomingMany: "Update ({count} incoming changes)",
    branchKind: "branch",
    tagKind: "tag",
    createReferenceCommitMessage: "Create {kind} {destination} from r{revision}",
    createReferenceProgress: "Creating {kind} from r{revision}...",
    createdReferenceMessage: "Created {kind} from r{revision}: {destination}",
    copyPathButton: "Copy Path",
    copiedReferencePathStatus: "Copied {kind} path {destination}",
    newReferencePathPrompt: "New {kind} path under {location} for r{revision}",
    branchNameRequired: "Branch name is required.",
    tagNameRequired: "Tag name is required.",
    relativePathRequired: "Use a path relative to {location}.",
    avoidEmptySegments: "Avoid empty path segments.",
    revertWorkingCopyQuestion: "Revert working copy to r{revision}?",
    revertChangesQuestion: "Revert changes from r{revision}?",
    revertWorkingCopyDetail:
        "This will reverse-merge all revisions newer than r{revision} into the current working copy.",
    revertChangesDetail:
        "This will reverse-merge only revision r{revision} into the current working copy.",
    cleanWorkingCopyRecommended: "A clean, up-to-date working copy is recommended.",
    workingCopyOnlyDetail:
        "The operation only changes your working copy. You still need to commit the result.",
    localChangesConflictWarning:
        "This working copy already has local changes, so conflicts are more likely.",
    continueButton: "Continue",
    revertedWorkingCopyInfo:
        "Reverted working copy to r{revision}. Review the changes and commit when ready.",
    revertedChangesInfo:
        "Reverted changes from r{revision}. Review the changes and commit when ready.",
    revertWorkingCopyProgress: "Reverting working copy to r{revision}...",
    revertChangesProgress: "Reverting changes from r{revision}...",
    missingDiffMetadata: "Missing SVN diff content metadata.",
    unableLoadSvnContent: "Unable to load SVN content.\n\n{message}",
    labelEmpty: "empty",
    labelBase: "BASE",
    labelWorkingTreeMissing: "working tree missing",
    labelDeleted: "deleted",
    labelHead: "HEAD",
    labelDeletedInHead: "deleted in HEAD",
    labelWorkingCopyMissing: "working copy missing",
    incomingStatusLabel: "incoming",
    copiedFilePathStatus: "Copied file path for r{revision}",
    copiedRevisionStatus: "Copied revision r{revision}",
    copiedCommitMessageStatus: "Copied commit message for r{revision}",
    copiedChangedPathsStatus: "Copied changed paths for r{revision}",
    historyPanelTitle: "SVN History: {label}",
    unknownDate: "Unknown date",
    noCommitMessage: "(no commit message)",
    changedPathOne: "1 changed path",
    changedPathMany: "{count} changed paths",
    historyCopiedFrom: "from {path}",
    historyCopiedFromRevision: "from {path} @ r{revision}",
    historyTextAndProps: "text: {text}, props: {props}",
    noChangedPathsReported: "No changed paths were reported for this revision.",
    changedFilesLabel: "Changed Files",
    filesLabel: "Files",
    checkoutToThisRevision: "Checkout To This Revision",
    exportThisRevision: "Export This Revision",
    compareWithWorkingCopy: "Compare With Working Copy",
    compareWithPreviousRevision: "Compare With Previous Revision",
    revertToThisRevision: "Revert To This Revision",
    revertChangesFromThisRevision: "Revert Changes From This Revision",
    createBranchFromThisRevision: "Create Branch From This Revision",
    createTagFromThisRevision: "Create Tag From This Revision",
    copyFilePath: "Copy File Path",
    copyRevisionNumber: "Copy Revision Number",
    copyCommitMessage: "Copy Commit Message",
    copyChangedPaths: "Copy Changed Paths",
    loadingHistory: "Loading history...",
    unableLoadHistory: "Unable to load history.",
    noLoadedRevisionsMatch: "No loaded revisions match the current filter yet.",
    noRevisionsMatch: "No revisions match the current filter.",
    loadingMoreHistory: "Loading more history...",
    retryLoadingHistory: "Retry loading history",
    retryLoadingOlderRevisions: "Retry loading older revisions",
    loadOlderRevisions: "Load older revisions",
    allHistoryLoaded: "All available history has been loaded.",
    filterPlaceholder: "Filter by revision, author, message or path",
    refreshButton: "Refresh",
    graphLabel: "Graph",
    descriptionLabel: "Description",
    dateLabel: "Date",
    authorDetailLabel: "Author",
    revisionLabel: "Revision",
    svnStatusAdded: "added",
    svnStatusConflicted: "conflicted",
    svnStatusDeleted: "deleted",
    svnStatusExternal: "external",
    svnStatusIgnored: "ignored",
    svnStatusIncomplete: "incomplete",
    svnStatusMissing: "missing",
    svnStatusModified: "modified",
    svnStatusNormal: "normal",
    svnStatusNone: "none",
    svnStatusObstructed: "obstructed",
    svnStatusReplaced: "replaced",
    svnStatusUnversioned: "unversioned",
    nodeKindFile: "file",
    nodeKindDir: "dir",
    nodeKindUnknown: "unknown",
    historyActionAdded: "Added",
    historyActionDeleted: "Deleted",
    historyActionModified: "Modified",
    historyActionReplaced: "Replaced",
    itemCountOne: "1 item",
    itemCountMany: "{count} items",
} as const;

export type MessageKey = keyof typeof englishMessages;
type MessageCatalog = Record<MessageKey, string>;
export type MessageVariables = Record<string, string | number>;

const messages: Record<SupportedLocale, MessageCatalog> = {
    en: englishMessages,
    "zh-CN": {
        openDiff: "打开对比",
        incomingChange: "传入变更",
        workingCopyChange: "工作副本变更",
        statusLabel: "状态：{status}",
        authorLabel: "作者：{author}",
        committedRevisionLabel: "提交版本：r{revision}",
        historyStatusTooltip: "打开 SVN 历史",
        noSvnExecutableWarning: "SVN Tree 未在 PATH 中找到 `svn` 可执行文件。",
        noWorkingCopyInfo: "当前工作区中没有可用的 SVN 工作副本。",
        selectWorkingCopyPlaceholder: "选择一个 SVN 工作副本",
        refreshStatusActionLabel: "刷新 SVN 状态",
        refreshStatusActionDescription: "重新加载本地和远程传入变更",
        refreshStatusProgress: "正在刷新 {label} 的 SVN 状态...",
        refreshStatusCompleted: "已刷新 {label} 的 SVN 状态",
        refreshStatusRunningTooltip: "正在刷新 SVN 状态...",
        updateWorkingCopyActionLabel: "更新工作副本",
        updateWorkingCopyActionDescription: "从仓库下载远程传入变更",
        updateWorkingCopyProgress: "正在更新工作副本 {label}...",
        updateWorkingCopyCompleted: "已完成 {label} 的工作副本更新",
        updateWorkingCopyRunningTooltip: "正在更新工作副本...",
        cleanupWorkingCopyActionLabel: "清理工作副本",
        cleanupWorkingCopyActionDescription: "对当前工作副本执行 svn cleanup",
        cleanupWorkingCopyProgress: "正在清理工作副本 {label}...",
        cleanupWorkingCopyCompleted: "已完成 {label} 的工作副本清理",
        cleanupWorkingCopyRunningTooltip: "正在清理工作副本...",
        showOutputActionLabel: "显示 SVN 输出",
        showOutputActionDescription: "打开扩展输出通道",
        actionsPlaceholder: "{label} 的 SVN 操作",
        operationAlreadyRunning: "{label} 正在执行“{action}”。",
        cannotOpenResourceWarning: "无法打开 {path}，因为它当前状态为 {status}。",
        revertResourceWarning: "要还原 {path} 的更改吗？",
        revertButton: "还原",
        revertGroupWarning: "要还原 {label} 的更改吗？",
        revertAllButton: "全部还原",
        deleteResourceWarning: "要从磁盘删除 {path} 吗？",
        deleteButton: "删除",
        commitAcceptTitle: "提交",
        commitInputPlaceholder: "提交说明（{shortcut} 提交到“{target}”）",
        changesGroupLabel: "变更",
        unversionedGroupLabel: "未纳入版本控制",
        remoteChangesGroupLabel: "远程变更",
        emptyCommitMessageError: "提交前请输入提交说明。",
        checkoutProgress: "正在检出 r{revision}...",
        checkedOutMessage: "已将 r{revision} 检出到 {destination}。",
        exportProgress: "正在导出 r{revision}...",
        exportedMessage: "已将 r{revision} 导出到 {destination}。",
        compareWithWorkingCopyActionLower: "与当前工作副本比较",
        compareWithPreviousRevisionActionLower: "与上一版本比较",
        historyNoFileChanges: "版本 r{revision} 没有可用于{action}的文件变更。",
        selectFilePlaceholder: "选择要{action}的文件",
        historyActionInRevision: "r{revision} 中{action}",
        cannotMapPathWarning: "无法将 {path} 映射到当前工作副本。",
        selectParentFolderLabel: "选择父文件夹",
        selectParentFolderCheckoutTitle: "选择用于检出 r{revision} 的父文件夹",
        selectParentFolderExportTitle: "选择用于导出 r{revision} 的父文件夹",
        folderNameCheckoutPrompt: "输入检出 r{revision} 的文件夹名称",
        folderNameExportPrompt: "输入导出 r{revision} 的文件夹名称",
        folderNameRequired: "必须填写文件夹名称。",
        folderNamePathWarning: "请输入文件夹名称，不要输入路径。",
        destinationExistsWarning: "目标已存在：{destination}",
        revealButton: "显示",
        revisionVsWorkingCopy: "{label}（r{revision} 对比工作副本）",
        checkingIncomingTooltip: "正在检查传入变更...",
        updateTooltipNoIncoming: "更新",
        updateTooltipIncomingOne: "更新（1 个传入变更）",
        updateTooltipIncomingMany: "更新（{count} 个传入变更）",
        branchKind: "分支",
        tagKind: "标签",
        createReferenceCommitMessage: "从 r{revision} 创建{kind} {destination}",
        createReferenceProgress: "正在从 r{revision} 创建{kind}...",
        createdReferenceMessage: "已从 r{revision} 创建{kind}：{destination}",
        copyPathButton: "复制路径",
        copiedReferencePathStatus: "已复制{kind}路径 {destination}",
        newReferencePathPrompt: "输入 r{revision} 在 {location} 下的新{kind}路径",
        branchNameRequired: "必须填写分支名称。",
        tagNameRequired: "必须填写标签名称。",
        relativePathRequired: "请输入相对于 {location} 的路径。",
        avoidEmptySegments: "路径段不能为空。",
        revertWorkingCopyQuestion: "要将工作副本还原到 r{revision} 吗？",
        revertChangesQuestion: "要还原 r{revision} 引入的更改吗？",
        revertWorkingCopyDetail:
            "这会把所有比 r{revision} 更新的版本反向合并到当前工作副本。",
        revertChangesDetail:
            "这只会把 r{revision} 这个版本反向合并到当前工作副本。",
        cleanWorkingCopyRecommended: "建议在干净且已更新到最新的工作副本上执行此操作。",
        workingCopyOnlyDetail: "此操作只会修改你的工作副本，完成后仍需要手动提交。",
        localChangesConflictWarning:
            "当前工作副本已经存在本地修改，发生冲突的概率会更高。",
        continueButton: "继续",
        revertedWorkingCopyInfo:
            "已将工作副本还原到 r{revision}。请检查变更并在准备好后提交。",
        revertedChangesInfo:
            "已还原 r{revision} 引入的更改。请检查变更并在准备好后提交。",
        revertWorkingCopyProgress: "正在将工作副本还原到 r{revision}...",
        revertChangesProgress: "正在还原 r{revision} 引入的更改...",
        missingDiffMetadata: "缺少 SVN 对比内容元数据。",
        unableLoadSvnContent: "无法加载 SVN 内容。\n\n{message}",
        labelEmpty: "空内容",
        labelBase: "BASE",
        labelWorkingTreeMissing: "工作副本中不存在",
        labelDeleted: "已删除",
        labelHead: "HEAD",
        labelDeletedInHead: "已在 HEAD 中删除",
        labelWorkingCopyMissing: "工作副本中不存在",
        incomingStatusLabel: "传入变更",
        copiedFilePathStatus: "已复制 r{revision} 的文件路径",
        copiedRevisionStatus: "已复制版本 r{revision}",
        copiedCommitMessageStatus: "已复制 r{revision} 的提交说明",
        copiedChangedPathsStatus: "已复制 r{revision} 的变更路径",
        historyPanelTitle: "SVN 历史：{label}",
        unknownDate: "未知日期",
        noCommitMessage: "（无提交说明）",
        changedPathOne: "1 个变更路径",
        changedPathMany: "{count} 个变更路径",
        historyCopiedFrom: "来自 {path}",
        historyCopiedFromRevision: "来自 {path} @ r{revision}",
        historyTextAndProps: "文本：{text}，属性：{props}",
        noChangedPathsReported: "此版本没有报告任何变更路径。",
        changedFilesLabel: "变更文件",
        filesLabel: "文件数",
        checkoutToThisRevision: "检出到此版本",
        exportThisRevision: "导出此版本",
        compareWithWorkingCopy: "与当前工作副本比较",
        compareWithPreviousRevision: "与上一版本比较",
        revertToThisRevision: "还原到此版本",
        revertChangesFromThisRevision: "还原此版本引入的更改",
        createBranchFromThisRevision: "从此版本创建分支",
        createTagFromThisRevision: "从此版本创建标签",
        copyFilePath: "复制文件路径",
        copyRevisionNumber: "复制版本号",
        copyCommitMessage: "复制提交说明",
        copyChangedPaths: "复制变更路径",
        loadingHistory: "正在加载历史...",
        unableLoadHistory: "无法加载历史。",
        noLoadedRevisionsMatch: "当前筛选条件下，已加载的版本中还没有匹配项。",
        noRevisionsMatch: "没有版本匹配当前筛选条件。",
        loadingMoreHistory: "正在加载更多历史...",
        retryLoadingHistory: "重试加载历史",
        retryLoadingOlderRevisions: "重试加载更早的版本",
        loadOlderRevisions: "加载更早的版本",
        allHistoryLoaded: "已加载全部可用历史。",
        filterPlaceholder: "按版本号、作者、提交说明或路径筛选",
        refreshButton: "刷新",
        graphLabel: "图谱",
        descriptionLabel: "描述",
        dateLabel: "日期",
        authorDetailLabel: "作者",
        revisionLabel: "版本",
        svnStatusAdded: "已添加",
        svnStatusConflicted: "冲突",
        svnStatusDeleted: "已删除",
        svnStatusExternal: "外部",
        svnStatusIgnored: "已忽略",
        svnStatusIncomplete: "不完整",
        svnStatusMissing: "缺失",
        svnStatusModified: "已修改",
        svnStatusNormal: "正常",
        svnStatusNone: "无",
        svnStatusObstructed: "受阻",
        svnStatusReplaced: "已替换",
        svnStatusUnversioned: "未纳入版本控制",
        nodeKindFile: "文件",
        nodeKindDir: "目录",
        nodeKindUnknown: "未知",
        historyActionAdded: "新增",
        historyActionDeleted: "删除",
        historyActionModified: "修改",
        historyActionReplaced: "替换",
        itemCountOne: "1 项",
        itemCountMany: "{count} 项",
    },
};

function formatMessage(template: string, variables: MessageVariables = {}): string {
    return template.replaceAll(/\{(\w+)\}/g, (_, key: string) =>
        Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : `{${key}}`
    );
}

function normalizeLocale(language: string | undefined): SupportedLocale {
    return language?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export interface RuntimeI18n {
    readonly locale: SupportedLocale;
    readonly isChinese: boolean;
    t(key: MessageKey, variables?: MessageVariables): string;
    formatIncomingChangeCount(count: number): string;
    formatChangedPathCount(count: number): string;
    formatItemCount(count: number): string;
    formatSvnStatus(status: string | undefined): string;
    formatNodeKind(kind: string | undefined): string;
    formatHistoryAction(action: string | undefined): string;
}

export function resolveDisplayLanguage(
    setting: string | undefined,
    uiLanguage: string | undefined
): SupportedLocale {
    if (setting === "en" || setting === "zh-CN") {
        return setting;
    }

    return normalizeLocale(uiLanguage);
}

export function getHtmlLanguage(locale: SupportedLocale): string {
    return locale;
}

export function createI18n(locale: SupportedLocale): RuntimeI18n {
    const catalog = messages[locale];
    const translate = (key: MessageKey, variables?: MessageVariables) =>
        formatMessage(catalog[key], variables);

    return {
        locale,
        isChinese: locale === "zh-CN",
        t: translate,
        formatIncomingChangeCount: (count) =>
            count <= 0
                ? translate("updateTooltipNoIncoming")
                : count === 1
                  ? translate("updateTooltipIncomingOne")
                  : translate("updateTooltipIncomingMany", { count }),
        formatChangedPathCount: (count) =>
            count === 1
                ? translate("changedPathOne")
                : translate("changedPathMany", { count }),
        formatItemCount: (count) =>
            count === 1 ? translate("itemCountOne") : translate("itemCountMany", { count }),
        formatSvnStatus: (status) => {
            switch (status) {
                case "added":
                    return translate("svnStatusAdded");
                case "conflicted":
                    return translate("svnStatusConflicted");
                case "deleted":
                    return translate("svnStatusDeleted");
                case "external":
                    return translate("svnStatusExternal");
                case "ignored":
                    return translate("svnStatusIgnored");
                case "incomplete":
                    return translate("svnStatusIncomplete");
                case "missing":
                    return translate("svnStatusMissing");
                case "modified":
                    return translate("svnStatusModified");
                case "normal":
                    return translate("svnStatusNormal");
                case "none":
                    return translate("svnStatusNone");
                case "obstructed":
                    return translate("svnStatusObstructed");
                case "replaced":
                    return translate("svnStatusReplaced");
                case "unversioned":
                    return translate("svnStatusUnversioned");
                case "incoming":
                    return translate("incomingStatusLabel");
                default:
                    return status ?? "";
            }
        },
        formatNodeKind: (kind) => {
            switch (kind) {
                case "file":
                    return translate("nodeKindFile");
                case "dir":
                    return translate("nodeKindDir");
                case "unknown":
                    return translate("nodeKindUnknown");
                default:
                    return kind ?? "";
            }
        },
        formatHistoryAction: (action) => {
            switch (action) {
                case "A":
                    return translate("historyActionAdded");
                case "D":
                    return translate("historyActionDeleted");
                case "R":
                    return translate("historyActionReplaced");
                case "M":
                    return translate("historyActionModified");
                default:
                    return action ?? "";
            }
        },
    };
}
