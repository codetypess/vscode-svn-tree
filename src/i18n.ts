export type SupportedLocale = "en" | "zh-CN";
export type DisplayLanguageSetting = "auto" | SupportedLocale;
export type FileManagerPlatform = "mac" | "windows" | "linux" | "unknown";

const englishMessages = {
    openDiff: "Open Diff",
    incomingChange: "Incoming change",
    workingCopyChange: "Working copy change",
    statusLabel: "Status: {status}",
    authorLabel: "Author: {author}",
    committedRevisionLabel: "Committed revision: r{revision}",
    changelistLabel: "Changelist: {name}",
    historyStatusTooltip: "Open SVN History",
    noSvnExecutableWarning: "SVN Tree could not find the `svn` executable on PATH.",
    noWorkingCopyInfo: "No SVN working copy is available in the current workspace.",
    selectWorkingCopyPlaceholder: "Select an SVN working copy",
    refreshStatusActionLabel: "Refresh SVN Status",
    refreshStatusActionDescription: "Reload local and incoming changes",
    openHistoryActionLabel: "Open SVN History",
    openHistoryActionDescription: "Open the revision history for this working copy",
    revisionGraphActionLabel: "Revision Graph",
    revisionGraphActionDescription: "Open the history view with the revision graph",
    repositoryBrowserActionLabel: "Repository Browser",
    repositoryBrowserActionDescription: "Browse repository folders and files",
    commitActionLabel: "Commit SVN Changes",
    commitActionDescription: "Commit selected working copy changes",
    refreshStatusProgress: "Refreshing SVN status for {label}...",
    refreshStatusCompleted: "SVN status refreshed for {label}",
    refreshStatusRunningTooltip: "Refreshing SVN status...",
    updateWorkingCopyActionLabel: "Update Working Copy",
    updateWorkingCopyActionDescription: "Download incoming changes from the repository",
    updateToRevisionActionLabel: "Update Working Copy To Revision",
    updateToRevisionActionDescription: "Update the working copy to a specific revision",
    updateToRevisionInputPrompt: "Revision number to update this working copy to",
    updateToRevisionInputPlaceholder: "Enter a positive SVN revision number",
    updateSelectedToRevisionActionLabel: "Update Selected Paths To Revision",
    updateSelectedToRevisionInputPrompt: "Revision number to update the selected paths to",
    updateSelectedToRevisionInputPlaceholder: "Enter a positive SVN revision number",
    switchWorkingCopyActionLabel: "Switch Branch Or Tag",
    switchWorkingCopyActionDescription: "Switch this working copy to another branch, tag, or repository path",
    showBlameActionLabel: "Blame / Annotate",
    showBlameActionDescription: "Show line-by-line revision and author details",
    showPropertiesActionLabel: "Show Properties",
    showPropertiesActionDescription: "List SVN properties on a path",
    editPropertyActionLabel: "Edit Properties",
    editPropertyActionDescription: "Set or delete SVN properties on a path",
    createBranchFromWorkingCopyActionLabel: "Create Branch From Working Copy",
    createBranchFromWorkingCopyActionDescription:
        "Copy this working copy, including local changes, to a new branch",
    createTagFromWorkingCopyActionLabel: "Create Tag From Working Copy",
    createTagFromWorkingCopyActionDescription:
        "Copy this working copy, including local changes, to a new tag",
    deleteReferenceActionLabel: "Delete Branch / Tag",
    deleteReferenceActionDescription: "Delete a branch or tag from the repository",
    relocateWorkingCopyActionLabel: "Relocate Working Copy",
    relocateWorkingCopyActionDescription:
        "Point this working copy at a new repository URL",
    switchTargetPrompt: "Target path under {layoutRoot}, absolute repository path, or full URL",
    switchTargetPlaceholder: "trunk, branches/feature-x, tags/v1, or https://...",
    switchTargetRequired: "Enter a target branch, tag, repository path, or URL.",
    switchTargetInvalid: "Use a valid repository path or URL.",
    updateWorkingCopyProgress: "Updating working copy {label}...",
    updateWorkingCopyCompleted: "Working copy update completed for {label}",
    updateWorkingCopyRunningTooltip: "Updating working copy...",
    updateToRevisionQuestion: "Update the current working copy to r{revision}?",
    updateToRevisionDetail:
        "This will update the current working copy to r{revision}.",
    updateToRevisionRecoveryDetail: "You can update back to HEAD later if needed.",
    updateToRevisionProgress: "Updating working copy {label} to r{revision}...",
    updatedToRevisionInfo: "Updated working copy {label} to r{revision}.",
    updateSelectedToRevisionProgress: "Updating selected paths in {label} to r{revision}...",
    updatedSelectedToRevisionInfo: "Updated selected paths in {label} to r{revision}.",
    switchWorkingCopyProgress: "Switching working copy {label} to {target}...",
    switchedWorkingCopyCompleted: "Switched working copy {label} to {target}.",
    cleanupWorkingCopyActionLabel: "Cleanup Working Copy",
    cleanupWorkingCopyActionDescription: "Run svn cleanup for this working copy",
    cleanupWorkingCopyProgress: "Cleaning up working copy {label}...",
    cleanupWorkingCopyCompleted: "Working copy cleanup completed for {label}",
    cleanupWorkingCopyRunningTooltip: "Cleaning up working copy...",
    switchWorkingCopyRunningTooltip: "Switching working copy...",
    addAllUnversionedActionLabel: "Add All Unversioned",
    addAllUnversionedActionDescription: "Add all unversioned files in this working copy",
    deleteAllUnversionedActionLabel: "Delete All Unversioned",
    deleteAllUnversionedActionDescription: "Delete all unversioned files from disk",
    revertAllChangesActionLabel: "Revert All Changes",
    revertAllChangesActionDescription: "Revert all local changes in this working copy",
    commitChangelistActionLabel: "Commit Changelist",
    commitChangelistActionDescription: "Commit only the paths assigned to a changelist",
    resolveAllConflictsActionLabel: "Mark All Conflicts As Resolved",
    resolveAllConflictsActionDescription: "Mark every conflicted path in this working copy as resolved",
    acceptMineAllActionLabel: "Accept Local Version For All Conflicts",
    acceptMineAllActionDescription: "Keep the local version for every conflicted path",
    acceptTheirsAllActionLabel: "Accept Incoming Version For All Conflicts",
    acceptTheirsAllActionDescription: "Keep the incoming version for every conflicted path",
    showOutputActionLabel: "Show SVN Output",
    showOutputActionDescription: "Open the extension output channel",
    actionsPlaceholder: "SVN actions for {label}",
    operationAlreadyRunning: "{action} is already running for {label}.",
    invalidRevisionError: "Enter a valid positive revision number.",
    changelistNameRequired: "Enter a changelist name.",
    changelistNamePrompt: "Changelist name",
    changelistNamePlaceholder: "Enter a changelist name",
    renamePathActionLabel: "Rename",
    lockPathActionLabel: "Lock",
    unlockPathActionLabel: "Unlock",
    showPathInfoActionLabel: "Show SVN Info",
    copyRepositoryUrlActionLabel: "Copy Repository URL",
    copyRepositoryPathActionLabel: "Copy Repository Path",
    renamePathPrompt: "New name for {path}",
    renamePathPlaceholder: "Enter a new file or folder name",
    renamePathRequired: "Enter a new name.",
    renamePathPathSeparatorError: "Enter a name, not a path.",
    renamePathInvalidNameError: "Use a valid file or folder name.",
    renamePathSameNameError: "Enter a different name.",
    renamePathExistsError: "{name} already exists in this folder.",
    renamePathProgress: "Renaming {path}...",
    renamedPathCompleted: "Renamed {from} to {to}.",
    renamePathRunningTooltip: "Renaming path...",
    lockPathProgress: "Locking {items}...",
    lockedPathCompleted: "Locked {items}.",
    unlockPathProgress: "Unlocking {items}...",
    unlockedPathCompleted: "Unlocked {items}.",
    lockPathRunningTooltip: "Locking paths...",
    unlockPathRunningTooltip: "Unlocking paths...",
    showPathInfoOutputHeader: "SVN Info: {path}",
    openedPathInfoStatus: "Opened SVN info",
    copiedRepositoryUrlStatus: "Copied repository URL",
    copiedRepositoryPathStatus: "Copied repository path",
    showBlameProgress: "Loading blame for {path}...",
    openedBlameStatus: "Opened blame",
    blameFileOnlyError: "Blame is only available for files.",
    showPropertiesProgress: "Loading properties for {path}...",
    showPropertiesOutputHeader: "SVN Properties: {path}",
    openedPropertiesStatus: "Opened properties",
    propertiesHeaderLabel: "Properties",
    noPropertiesFoundLabel: "(no SVN properties)",
    propertyNamePrompt: "SVN property name",
    propertyNamePlaceholder: "Select or enter an SVN property name",
    propertyNameRequired: "Enter a property name.",
    propertySetActionLabel: "Set Property",
    propertyDeleteActionLabel: "Delete Property",
    propertyActionPlaceholder: "Choose what to do with {name}",
    propertyCurrentValueDetail: "Current value: {value}",
    propertyValuePrompt: "Value for {name}. Use \\n for new lines.",
    propertyValuePlaceholder: "Enter the property value",
    propertyValueRequired: "Enter a property value.",
    propertyNotSetInfo: "{name} is not set on this path.",
    setPropertyProgress: "Setting property {name}...",
    deletePropertyProgress: "Deleting property {name}...",
    updatedPropertyInfo: "Updated property {name} on {path}.",
    deletedPropertyInfo: "Deleted property {name} from {path}.",
    propertyNameEolStyleDescription: "Line ending style",
    propertyNameKeywordsDescription: "Keyword expansion",
    propertyNameExecutableDescription: "Mark as executable",
    propertyNameNeedsLockDescription: "Require locking before edits",
    propertyNameMimeTypeDescription: "Content MIME type",
    propertyNameIgnoreDescription: "Ignored child names",
    propertyNameExternalsDescription: "External definitions",
    customPropertyNameLabel: "Custom Property...",
    customPropertyNameDescription: "Enter another property name",
    repositoryBrowserProgress: "Loading repository browser for {path}...",
    repositoryBrowserPlaceholder: "Browse repository path {path}",
    repositoryBrowserActionsSeparator: "Actions",
    repositoryBrowserEntriesSeparator: "Entries",
    repositoryBrowserUpLabel: "..",
    repositoryBrowserEmptyLabel: "(empty directory)",
    repositoryBrowserSwitchHereLabel: "Switch Working Copy Here",
    repositoryBrowserFileActionsPlaceholder: "Actions for {path}",
    infoPathLabel: "Path",
    infoKindLabel: "Kind",
    infoWorkingCopyRootLabel: "Working copy root",
    infoRepositoryPathLabel: "Repository path",
    infoUrlLabel: "URL",
    infoRepositoryRootLabel: "Repository root",
    infoRevisionLabel: "Working revision",
    infoLastChangedRevisionLabel: "Last changed revision",
    infoLastChangedAuthorLabel: "Last changed author",
    infoLastChangedDateLabel: "Last changed date",
    infoLockOwnerLabel: "Lock owner",
    infoLockCreatedLabel: "Lock created",
    infoLockCommentLabel: "Lock comment",
    noUnversionedChangesInfo: "There are no unversioned files to add.",
    noLockablePathsInfo: "There are no files that can be locked in the current selection.",
    noConflictsInfo: "There are no conflicts to resolve.",
    noLocalChangesInfo: "There are no local changes to revert.",
    cannotIgnoreWorkingCopyRootError: "The working copy root cannot be ignored.",
    cannotRenameWorkingCopyRootError: "The working copy root cannot be renamed.",
    noSvnInfoForPathError: "No SVN info is available for {path}.",
    cannotOpenResourceWarning: "Cannot open {path} because it is {status}.",
    revertResourceWarning: "Revert changes in {path}?",
    revertButton: "Revert",
    revertGroupWarning: "Revert changes in {label}?",
    revertAllButton: "Revert All",
    deleteResourceWarning: "Delete {path} from disk?",
    deleteButton: "Delete",
    deleteGroupWarning: "Delete {label} from disk?",
    deleteAllButton: "Delete All",
    commitAcceptTitle: "Commit",
    commitInputPlaceholder: 'Message ({shortcut} to commit on "{target}")',
    commitSelectFilesTitle: "Select files to commit",
    commitSelectFilesPlaceholder: "Choose which changed files to include",
    changesGroupLabel: "Changes",
    conflictArtifactsGroupLabel: "Conflict Artifacts",
    unversionedGroupLabel: "Unversioned",
    remoteChangesGroupLabel: "Remote Changes",
    emptyCommitMessageError: "Enter a commit message before committing.",
    emptyCommitSelectionError: "Select at least one file to commit.",
    noCommittableChangesError: "No committable changes are available.",
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
    newReferencePathFromWorkingCopyPrompt:
        "New {kind} path under {location} from the current working copy",
    createReferenceFromWorkingCopyQuestion:
        "Create {kind} {destination} from the current working copy?",
    createReferenceFromWorkingCopyDetail:
        "This creates {destination} on the repository from the current working copy state.",
    createReferenceFromWorkingCopyWithLocalChangesDetail:
        "Local working copy changes will be included in the new branch or tag.",
    createReferenceFromWorkingCopyCommitMessage:
        "Create {kind} {destination} from working copy",
    createReferenceFromWorkingCopyProgress:
        "Creating {kind} from the current working copy...",
    createdReferenceFromWorkingCopyMessage:
        "Created {kind} from the current working copy: {destination}",
    branchNameRequired: "Branch name is required.",
    tagNameRequired: "Tag name is required.",
    relativePathRequired: "Use a path relative to {location}.",
    avoidEmptySegments: "Avoid empty path segments.",
    deleteReferencePrompt:
        "Branch or tag path under {layoutRoot}, absolute repository path, or full URL to delete",
    deleteReferencePlaceholder: "branches/feature-x, /project/tags/v1, or https://...",
    deleteReferenceRequired:
        "Enter a branch, tag, repository path, or URL to delete.",
    deleteReferenceInvalid:
        "Use a valid branch or tag path in this repository, or a full URL to one.",
    deleteReferenceQuestion: "Delete {target} from the repository?",
    deleteReferenceDetail:
        "This immediately deletes the remote branch or tag {target} by creating an SVN commit.",
    deleteReferenceCommitMessage: "Delete {target}",
    deleteReferenceProgress: "Deleting {target}...",
    deletedReferenceInfo: "Deleted {target}.",
    relocateWorkingCopyPrompt: "New repository URL for working copy {label}",
    relocateWorkingCopyPlaceholder: "https://server/new-repo/path",
    relocateWorkingCopyRequired: "Enter the new repository URL.",
    relocateWorkingCopyInvalid: "Enter a valid full repository URL.",
    relocateWorkingCopyProgress: "Relocating working copy {label}...",
    relocatedWorkingCopyInfo: "Relocated working copy {label}.",
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
    resolveConflictsActionLabel: "Resolve Conflicts",
    resolveConflictsRunningTooltip: "Resolving conflicts...",
    markResolvedQuestion: "Mark {items} as resolved?",
    markResolvedDetail:
        "Use this after you have manually edited the file content to the final result.",
    markResolvedProgress: "Marking {items} as resolved...",
    markedResolvedInfo: "Marked {items} as resolved.",
    acceptMineQuestion: "Accept the local version for {items}?",
    acceptMineDetail:
        "This keeps your current working copy content and marks the conflict as resolved.",
    acceptMineProgress: "Accepting the local version for {items}...",
    acceptedMineInfo: "Accepted the local version for {items}.",
    acceptTheirsQuestion: "Accept the incoming version for {items}?",
    acceptTheirsDetail:
        "This replaces your current working copy content with the incoming repository version and marks the conflict as resolved.",
    acceptTheirsProgress: "Accepting the incoming version for {items}...",
    acceptedTheirsInfo: "Accepted the incoming version for {items}.",
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
    conflictArtifactLabel: "conflict artifact",
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
    checkoutToThisRevision: "Checkout This Revision To New Folder",
    exportThisRevision: "Export This Revision",
    updateWorkingCopyToThisRevision: "Update Current Working Copy To This Revision",
    compareWithWorkingCopy: "Compare With Working Copy",
    compareWithPreviousRevision: "Compare With Previous Revision",
    revertToThisRevision: "Revert To This Revision",
    revertChangesFromThisRevision: "Revert Changes From This Revision",
    createBranchFromThisRevision: "Create Branch From This Revision",
    createTagFromThisRevision: "Create Tag From This Revision",
    showFileHistory: "Show Full History For This File",
    revealInFinder: "Reveal in Finder",
    revealInExplorer: "Reveal in Explorer",
    revealInFileManager: "Reveal in File Manager",
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
        changelistLabel: "变更列表：{name}",
        historyStatusTooltip: "打开 SVN 历史",
        noSvnExecutableWarning: "SVN Tree 未在 PATH 中找到 `svn` 可执行文件。",
        noWorkingCopyInfo: "当前工作区中没有可用的 SVN 工作副本。",
        selectWorkingCopyPlaceholder: "选择一个 SVN 工作副本",
        refreshStatusActionLabel: "刷新 SVN 状态",
        refreshStatusActionDescription: "重新加载本地和远程传入变更",
        openHistoryActionLabel: "打开 SVN 历史",
        openHistoryActionDescription: "打开当前工作副本的版本历史",
        revisionGraphActionLabel: "版本图",
        revisionGraphActionDescription: "打开带版本图的历史视图",
        repositoryBrowserActionLabel: "仓库浏览器",
        repositoryBrowserActionDescription: "浏览仓库中的目录和文件",
        commitActionLabel: "提交 SVN 更改",
        commitActionDescription: "提交当前工作副本中已选择的变更",
        refreshStatusProgress: "正在刷新 {label} 的 SVN 状态...",
        refreshStatusCompleted: "已刷新 {label} 的 SVN 状态",
        refreshStatusRunningTooltip: "正在刷新 SVN 状态...",
        updateWorkingCopyActionLabel: "更新工作副本",
        updateWorkingCopyActionDescription: "从仓库下载远程传入变更",
        updateToRevisionActionLabel: "更新工作副本到指定版本",
        updateToRevisionActionDescription: "将当前工作副本更新到指定版本号",
        updateToRevisionInputPrompt: "输入要更新到的版本号",
        updateToRevisionInputPlaceholder: "请输入正整数 SVN 版本号",
        updateSelectedToRevisionActionLabel: "将选中的路径更新到指定版本",
        updateSelectedToRevisionInputPrompt: "输入要将选中路径更新到的版本号",
        updateSelectedToRevisionInputPlaceholder: "请输入正整数 SVN 版本号",
        switchWorkingCopyActionLabel: "切换分支或标签",
        switchWorkingCopyActionDescription: "将当前工作副本切换到其他分支、标签或仓库路径",
        showBlameActionLabel: "Blame / Annotate",
        showBlameActionDescription: "按行查看版本和作者信息",
        showPropertiesActionLabel: "显示属性",
        showPropertiesActionDescription: "列出路径上的 SVN 属性",
        editPropertyActionLabel: "编辑属性",
        editPropertyActionDescription: "设置或删除路径上的 SVN 属性",
        createBranchFromWorkingCopyActionLabel: "从工作副本创建分支",
        createBranchFromWorkingCopyActionDescription:
            "将当前工作副本连同本地修改一起复制到新分支",
        createTagFromWorkingCopyActionLabel: "从工作副本创建标签",
        createTagFromWorkingCopyActionDescription:
            "将当前工作副本连同本地修改一起复制到新标签",
        deleteReferenceActionLabel: "删除分支 / 标签",
        deleteReferenceActionDescription: "从仓库中删除分支或标签",
        relocateWorkingCopyActionLabel: "重定位工作副本",
        relocateWorkingCopyActionDescription: "把当前工作副本指向新的仓库 URL",
        switchTargetPrompt: "输入 {layoutRoot} 下的目标路径、仓库绝对路径，或完整 URL",
        switchTargetPlaceholder: "trunk、branches/feature-x、tags/v1，或 https://...",
        switchTargetRequired: "请输入目标分支、标签、仓库路径或 URL。",
        switchTargetInvalid: "请输入有效的仓库路径或 URL。",
        updateWorkingCopyProgress: "正在更新工作副本 {label}...",
        updateWorkingCopyCompleted: "已完成 {label} 的工作副本更新",
        updateWorkingCopyRunningTooltip: "正在更新工作副本...",
        updateToRevisionQuestion: "要将当前工作副本更新到 r{revision} 吗？",
        updateToRevisionDetail: "这会把当前工作副本更新到 r{revision}。",
        updateToRevisionRecoveryDetail: "如有需要，后续仍可再更新回 HEAD。",
        updateToRevisionProgress: "正在将工作副本 {label} 更新到 r{revision}...",
        updatedToRevisionInfo: "已将工作副本 {label} 更新到 r{revision}。",
        updateSelectedToRevisionProgress: "正在将 {label} 中选中的路径更新到 r{revision}...",
        updatedSelectedToRevisionInfo: "已将 {label} 中选中的路径更新到 r{revision}。",
        switchWorkingCopyProgress: "正在将工作副本 {label} 切换到 {target}...",
        switchedWorkingCopyCompleted: "已将工作副本 {label} 切换到 {target}。",
        cleanupWorkingCopyActionLabel: "清理工作副本",
        cleanupWorkingCopyActionDescription: "对当前工作副本执行 svn cleanup",
        cleanupWorkingCopyProgress: "正在清理工作副本 {label}...",
        cleanupWorkingCopyCompleted: "已完成 {label} 的工作副本清理",
        cleanupWorkingCopyRunningTooltip: "正在清理工作副本...",
        switchWorkingCopyRunningTooltip: "正在切换工作副本...",
        addAllUnversionedActionLabel: "添加全部未纳管项",
        addAllUnversionedActionDescription: "将当前工作副本中的全部未纳管文件加入版本控制",
        deleteAllUnversionedActionLabel: "删除全部未纳管项",
        deleteAllUnversionedActionDescription: "从磁盘删除当前工作副本中的全部未纳管文件",
        revertAllChangesActionLabel: "还原全部更改",
        revertAllChangesActionDescription: "还原当前工作副本中的全部本地更改",
        commitChangelistActionLabel: "提交 changelist",
        commitChangelistActionDescription: "只提交分配到某个 changelist 的路径",
        resolveAllConflictsActionLabel: "将全部冲突标记为已解决",
        resolveAllConflictsActionDescription: "将当前工作副本中的全部冲突路径标记为已解决",
        acceptMineAllActionLabel: "对全部冲突接受本地版本",
        acceptMineAllActionDescription: "对当前工作副本中的全部冲突路径保留本地版本",
        acceptTheirsAllActionLabel: "对全部冲突接受远端版本",
        acceptTheirsAllActionDescription: "对当前工作副本中的全部冲突路径保留远端版本",
        showOutputActionLabel: "显示 SVN 输出",
        showOutputActionDescription: "打开扩展输出通道",
        actionsPlaceholder: "{label} 的 SVN 操作",
        operationAlreadyRunning: "{label} 正在执行“{action}”。",
        invalidRevisionError: "请输入有效的正整数版本号。",
        changelistNameRequired: "请输入 changelist 名称。",
        changelistNamePrompt: "changelist 名称",
        changelistNamePlaceholder: "请输入 changelist 名称",
        renamePathActionLabel: "重命名",
        lockPathActionLabel: "加锁",
        unlockPathActionLabel: "解锁",
        showPathInfoActionLabel: "显示 SVN 信息",
        copyRepositoryUrlActionLabel: "复制仓库 URL",
        copyRepositoryPathActionLabel: "复制仓库路径",
        renamePathPrompt: "输入 {path} 的新名称",
        renamePathPlaceholder: "请输入新的文件名或目录名",
        renamePathRequired: "请输入新名称。",
        renamePathPathSeparatorError: "请输入名称，不要输入路径。",
        renamePathInvalidNameError: "请输入有效的文件或目录名称。",
        renamePathSameNameError: "请输入不同的新名称。",
        renamePathExistsError: "当前文件夹中已存在 {name}。",
        renamePathProgress: "正在重命名 {path}...",
        renamedPathCompleted: "已将 {from} 重命名为 {to}。",
        renamePathRunningTooltip: "正在重命名路径...",
        lockPathProgress: "正在为 {items} 加锁...",
        lockedPathCompleted: "已为 {items} 加锁。",
        unlockPathProgress: "正在为 {items} 解锁...",
        unlockedPathCompleted: "已为 {items} 解锁。",
        lockPathRunningTooltip: "正在加锁...",
        unlockPathRunningTooltip: "正在解锁...",
        showPathInfoOutputHeader: "SVN 信息：{path}",
        openedPathInfoStatus: "已打开 SVN 信息",
        copiedRepositoryUrlStatus: "已复制仓库 URL",
        copiedRepositoryPathStatus: "已复制仓库路径",
        showBlameProgress: "正在加载 {path} 的 blame...",
        openedBlameStatus: "已打开 blame",
        blameFileOnlyError: "Blame 只支持文件。",
        showPropertiesProgress: "正在加载 {path} 的属性...",
        showPropertiesOutputHeader: "SVN 属性：{path}",
        openedPropertiesStatus: "已打开属性",
        propertiesHeaderLabel: "属性",
        noPropertiesFoundLabel: "（没有 SVN 属性）",
        propertyNamePrompt: "SVN 属性名",
        propertyNamePlaceholder: "选择或输入 SVN 属性名",
        propertyNameRequired: "请输入属性名。",
        propertySetActionLabel: "设置属性",
        propertyDeleteActionLabel: "删除属性",
        propertyActionPlaceholder: "选择要如何处理 {name}",
        propertyCurrentValueDetail: "当前值：{value}",
        propertyValuePrompt: "输入 {name} 的值。多行请使用 \\n。",
        propertyValuePlaceholder: "请输入属性值",
        propertyValueRequired: "请输入属性值。",
        propertyNotSetInfo: "{name} 尚未设置到该路径上。",
        setPropertyProgress: "正在设置属性 {name}...",
        deletePropertyProgress: "正在删除属性 {name}...",
        updatedPropertyInfo: "已更新 {path} 的属性 {name}。",
        deletedPropertyInfo: "已删除 {path} 的属性 {name}。",
        propertyNameEolStyleDescription: "行结束符样式",
        propertyNameKeywordsDescription: "关键字展开",
        propertyNameExecutableDescription: "标记为可执行",
        propertyNameNeedsLockDescription: "编辑前需要先加锁",
        propertyNameMimeTypeDescription: "内容 MIME 类型",
        propertyNameIgnoreDescription: "忽略的子项名称",
        propertyNameExternalsDescription: "外部定义",
        customPropertyNameLabel: "自定义属性...",
        customPropertyNameDescription: "输入其他属性名",
        repositoryBrowserProgress: "正在加载 {path} 的仓库浏览器...",
        repositoryBrowserPlaceholder: "浏览仓库路径 {path}",
        repositoryBrowserActionsSeparator: "操作",
        repositoryBrowserEntriesSeparator: "条目",
        repositoryBrowserUpLabel: "..",
        repositoryBrowserEmptyLabel: "（空目录）",
        repositoryBrowserSwitchHereLabel: "切换工作副本到这里",
        repositoryBrowserFileActionsPlaceholder: "{path} 的操作",
        infoPathLabel: "路径",
        infoKindLabel: "类型",
        infoWorkingCopyRootLabel: "工作副本根目录",
        infoRepositoryPathLabel: "仓库路径",
        infoUrlLabel: "URL",
        infoRepositoryRootLabel: "仓库根地址",
        infoRevisionLabel: "工作副本版本",
        infoLastChangedRevisionLabel: "最后修改版本",
        infoLastChangedAuthorLabel: "最后修改作者",
        infoLastChangedDateLabel: "最后修改时间",
        infoLockOwnerLabel: "锁定人",
        infoLockCreatedLabel: "加锁时间",
        infoLockCommentLabel: "锁备注",
        noUnversionedChangesInfo: "当前没有可添加的未纳管文件。",
        noLockablePathsInfo: "当前选择中没有可加锁的文件。",
        noConflictsInfo: "当前没有可处理的冲突。",
        noLocalChangesInfo: "当前没有可还原的本地更改。",
        cannotIgnoreWorkingCopyRootError: "不能忽略工作副本根目录。",
        cannotRenameWorkingCopyRootError: "不能重命名工作副本根目录。",
        noSvnInfoForPathError: "无法获取 {path} 的 SVN 信息。",
        cannotOpenResourceWarning: "无法打开 {path}，因为它当前状态为 {status}。",
        revertResourceWarning: "要还原 {path} 的更改吗？",
        revertButton: "还原",
        revertGroupWarning: "要还原 {label} 的更改吗？",
        revertAllButton: "全部还原",
        deleteResourceWarning: "要从磁盘删除 {path} 吗？",
        deleteButton: "删除",
        deleteGroupWarning: "要从磁盘删除 {label} 吗？",
        deleteAllButton: "全部删除",
        commitAcceptTitle: "提交",
        commitInputPlaceholder: "提交说明（{shortcut} 提交到“{target}”）",
        commitSelectFilesTitle: "选择要提交的文件",
        commitSelectFilesPlaceholder: "选择这次要包含的变更文件",
        changesGroupLabel: "变更",
        conflictArtifactsGroupLabel: "冲突辅助文件",
        unversionedGroupLabel: "未纳入版本控制",
        remoteChangesGroupLabel: "远程变更",
        emptyCommitMessageError: "提交前请输入提交说明。",
        emptyCommitSelectionError: "请至少选择一个要提交的文件。",
        noCommittableChangesError: "当前没有可提交的变更。",
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
        newReferencePathFromWorkingCopyPrompt: "输入当前工作副本在 {location} 下的新{kind}路径",
        createReferenceFromWorkingCopyQuestion: "要从当前工作副本创建{kind} {destination} 吗？",
        createReferenceFromWorkingCopyDetail:
            "这会直接根据当前工作副本状态在仓库中创建 {destination}。",
        createReferenceFromWorkingCopyWithLocalChangesDetail:
            "当前工作副本中的本地修改也会包含到新分支或标签里。",
        createReferenceFromWorkingCopyCommitMessage: "从工作副本创建{kind} {destination}",
        createReferenceFromWorkingCopyProgress: "正在从当前工作副本创建{kind}...",
        createdReferenceFromWorkingCopyMessage: "已从当前工作副本创建{kind}：{destination}",
        branchNameRequired: "必须填写分支名称。",
        tagNameRequired: "必须填写标签名称。",
        relativePathRequired: "请输入相对于 {location} 的路径。",
        avoidEmptySegments: "路径段不能为空。",
        deleteReferencePrompt:
            "输入要删除的 {layoutRoot} 下分支/标签路径、仓库绝对路径，或完整 URL",
        deleteReferencePlaceholder: "branches/feature-x、/project/tags/v1，或 https://...",
        deleteReferenceRequired: "请输入要删除的分支、标签、仓库路径或 URL。",
        deleteReferenceInvalid:
            "请输入当前仓库中的有效分支或标签路径，或指向它的完整 URL。",
        deleteReferenceQuestion: "要从仓库中删除 {target} 吗？",
        deleteReferenceDetail:
            "这会立即通过一次 SVN 提交删除远端分支或标签 {target}。",
        deleteReferenceCommitMessage: "删除 {target}",
        deleteReferenceProgress: "正在删除 {target}...",
        deletedReferenceInfo: "已删除 {target}。",
        relocateWorkingCopyPrompt: "输入工作副本 {label} 的新仓库 URL",
        relocateWorkingCopyPlaceholder: "https://server/new-repo/path",
        relocateWorkingCopyRequired: "请输入新的仓库 URL。",
        relocateWorkingCopyInvalid: "请输入有效的完整仓库 URL。",
        relocateWorkingCopyProgress: "正在重定位工作副本 {label}...",
        relocatedWorkingCopyInfo: "已重定位工作副本 {label}。",
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
        resolveConflictsActionLabel: "处理冲突",
        resolveConflictsRunningTooltip: "正在处理冲突...",
        markResolvedQuestion: "要将 {items} 标记为已解决吗？",
        markResolvedDetail: "请在你已经手动把文件内容整理为最终结果后再执行此操作。",
        markResolvedProgress: "正在将 {items} 标记为已解决...",
        markedResolvedInfo: "已将 {items} 标记为已解决。",
        acceptMineQuestion: "要对 {items} 接受本地版本吗？",
        acceptMineDetail: "这会保留你当前工作副本中的内容，并将冲突标记为已解决。",
        acceptMineProgress: "正在对 {items} 接受本地版本...",
        acceptedMineInfo: "已对 {items} 接受本地版本。",
        acceptTheirsQuestion: "要对 {items} 接受远端版本吗？",
        acceptTheirsDetail:
            "这会用仓库中的传入版本替换你当前工作副本内容，并将冲突标记为已解决。",
        acceptTheirsProgress: "正在对 {items} 接受远端版本...",
        acceptedTheirsInfo: "已对 {items} 接受远端版本。",
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
        conflictArtifactLabel: "冲突辅助文件",
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
        checkoutToThisRevision: "检出此版本到新目录",
        exportThisRevision: "导出此版本",
        updateWorkingCopyToThisRevision: "更新当前工作副本到此版本",
        compareWithWorkingCopy: "与当前工作副本比较",
        compareWithPreviousRevision: "与上一版本比较",
        revertToThisRevision: "还原到此版本",
        revertChangesFromThisRevision: "还原此版本引入的更改",
        createBranchFromThisRevision: "从此版本创建分支",
        createTagFromThisRevision: "从此版本创建标签",
        showFileHistory: "查看此文件的所有变更记录",
        revealInFinder: "在 Finder 中显示",
        revealInExplorer: "在资源管理器中显示",
        revealInFileManager: "在文件管理器中显示",
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

export function normalizeFileManagerPlatform(platform: string | undefined): FileManagerPlatform {
    switch (platform) {
        case "darwin":
        case "mac":
            return "mac";
        case "win32":
        case "windows":
            return "windows";
        case "linux":
            return "linux";
        default:
            return "unknown";
    }
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
    formatRevealInFileManager(platform: FileManagerPlatform): string;
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
        formatRevealInFileManager: (platform) => {
            switch (platform) {
                case "mac":
                    return translate("revealInFinder");
                case "windows":
                    return translate("revealInExplorer");
                default:
                    return translate("revealInFileManager");
            }
        },
    };
}
