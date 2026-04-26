import test from "node:test";
import assert from "node:assert/strict";
import { createI18n, normalizeFileManagerPlatform } from "../i18n";

test("normalizeFileManagerPlatform maps supported platform identifiers", () => {
    assert.equal(normalizeFileManagerPlatform("darwin"), "mac");
    assert.equal(normalizeFileManagerPlatform("win32"), "windows");
    assert.equal(normalizeFileManagerPlatform("linux"), "linux");
    assert.equal(normalizeFileManagerPlatform("freebsd"), "unknown");
});

test("createI18n formats reveal labels for file managers", () => {
    const english = createI18n("en");
    const chinese = createI18n("zh-CN");

    assert.equal(english.formatRevealInFileManager("mac"), "Reveal in Finder");
    assert.equal(english.formatRevealInFileManager("windows"), "Reveal in Explorer");
    assert.equal(english.formatRevealInFileManager("linux"), "Reveal in File Manager");

    assert.equal(chinese.formatRevealInFileManager("mac"), "在 Finder 中显示");
    assert.equal(chinese.formatRevealInFileManager("windows"), "在资源管理器中显示");
    assert.equal(chinese.formatRevealInFileManager("unknown"), "在文件管理器中显示");
});

test("createI18n returns commit selection prompts", () => {
    const english = createI18n("en");
    const chinese = createI18n("zh-CN");

    assert.equal(english.t("commitSelectFilesTitle"), "Select files to commit");
    assert.equal(english.t("emptyCommitSelectionError"), "Select at least one file to commit.");

    assert.equal(chinese.t("commitSelectFilesTitle"), "选择要提交的文件");
    assert.equal(chinese.t("noCommittableChangesError"), "当前没有可提交的变更。");
});

test("createI18n returns repository action prompts", () => {
    const english = createI18n("en");
    const chinese = createI18n("zh-CN");

    assert.equal(
        english.t("updateToRevisionActionLabel"),
        "Update Working Copy To Revision"
    );
    assert.equal(english.t("switchWorkingCopyActionLabel"), "Switch Branch Or Tag");
    assert.equal(english.t("revisionGraphActionLabel"), "Revision Graph");
    assert.equal(english.t("repositoryBrowserActionLabel"), "Repository Browser");
    assert.equal(english.t("invalidRevisionError"), "Enter a valid positive revision number.");
    assert.equal(english.t("changelistLabel", { name: "feature-a" }), "Changelist: feature-a");
    assert.equal(english.t("renamePathActionLabel"), "Rename");
    assert.equal(english.t("lockPathActionLabel"), "Lock");
    assert.equal(english.t("showPathInfoActionLabel"), "Show SVN Info");
    assert.equal(english.t("showBlameActionLabel"), "Blame / Annotate");
    assert.equal(english.t("showBlameOutputActionLabel"), "Show Blame In Output");
    assert.equal(
        english.t("showBlameOutputHeader", { path: "src/app.ts" }),
        "SVN Blame: src/app.ts"
    );
    assert.equal(english.t("copyBlameAuthorActionLabel"), "Copy Author");
    assert.equal(english.t("showPropertiesActionLabel"), "Show Properties");
    assert.equal(
        english.t("showPropertiesOutputHeader", { path: "src/app.ts" }),
        "SVN Properties: src/app.ts"
    );
    assert.equal(english.t("editPropertyActionLabel"), "Edit Properties");
    assert.equal(
        english.t("renamePathExistsError", { name: "app.ts" }),
        "app.ts already exists in this folder."
    );
    assert.equal(
        english.t("changelistNameRequired"),
        "Enter a changelist name."
    );
    assert.equal(
        english.t("resolveAllConflictsActionLabel"),
        "Mark All Conflicts As Resolved"
    );
    assert.equal(
        english.t("actionCategoriesPlaceholder", { label: "repo" }),
        "Choose an SVN action category for repo"
    );
    assert.equal(english.t("browseActionsCategoryLabel"), "Browse And History");
    assert.equal(
        english.t("acceptBaseAllActionLabel"),
        "Accept Base Version For All Conflicts"
    );
    assert.equal(
        english.t("acceptMineConflictAllActionLabel"),
        "Accept Local Conflicted Hunks For All Conflicts"
    );
    assert.equal(
        english.t("acceptTheirsConflictAllActionLabel"),
        "Accept Incoming Conflicted Hunks For All Conflicts"
    );
    assert.equal(
        english.t("postponeAllConflictsActionLabel"),
        "Postpone Resolution For All Conflicts"
    );
    assert.equal(english.t("deleteAllButton"), "Delete All");
    assert.equal(
        english.t("cannotIgnoreWorkingCopyRootError"),
        "The working copy root cannot be ignored."
    );
    assert.equal(
        english.t("cannotRenameWorkingCopyRootError"),
        "The working copy root cannot be renamed."
    );
    assert.equal(english.t("copiedRepositoryUrlStatus"), "Copied repository URL");
    assert.equal(
        english.t("noSvnInfoForPathError", { path: "tmp.txt" }),
        "No SVN info is available for tmp.txt."
    );
    assert.equal(
        english.t("noLockablePathsInfo"),
        "There are no files that can be locked in the current selection."
    );
    assert.equal(
        english.t("deleteReferenceInvalid"),
        "Use a valid branch or tag path in this repository, or a full URL to one."
    );
    assert.equal(
        english.t("relocateWorkingCopyActionLabel"),
        "Relocate Working Copy"
    );
    assert.equal(
        english.t("acceptBaseQuestion", { items: "1 item" }),
        "Accept the base version for 1 item?"
    );
    assert.equal(
        english.t("postponeConflictProgress", { items: "2 items" }),
        "Postponing conflict resolution for 2 items..."
    );
    assert.equal(english.t("openFile"), "Open File");
    assert.equal(english.t("exportThisFile"), "Export This File");
    assert.equal(
        english.t("selectFileExportTitle", { path: "/src/app.ts", revision: 42 }),
        "Choose where to export /src/app.ts from r42"
    );

    assert.equal(chinese.t("addAllUnversionedActionLabel"), "添加全部未纳管项");
    assert.equal(chinese.t("noLocalChangesInfo"), "当前没有可还原的本地更改。");
    assert.equal(chinese.t("updateSelectedToRevisionActionLabel"), "将选中的路径更新到指定版本");
    assert.equal(chinese.t("noConflictsInfo"), "当前没有可处理的冲突。");
    assert.equal(chinese.t("renamePathActionLabel"), "重命名");
    assert.equal(chinese.t("copyRepositoryPathActionLabel"), "复制仓库路径");
    assert.equal(chinese.t("revisionGraphActionLabel"), "版本图");
    assert.equal(chinese.t("repositoryBrowserActionLabel"), "仓库浏览器");
    assert.equal(chinese.t("editPropertyActionLabel"), "编辑属性");
    assert.equal(chinese.t("showPropertiesActionLabel"), "显示属性");
    assert.equal(chinese.t("showBlameOutputActionLabel"), "在输出中显示 blame");
    assert.equal(chinese.t("copyBlameLineActionLabel"), "复制 blame 行信息");
    assert.equal(
        chinese.t("actionCategoryPlaceholder", { label: "仓库", category: "浏览与历史" }),
        "仓库的浏览与历史操作"
    );
    assert.equal(chinese.t("conflictActionsCategoryLabel"), "冲突处理");
    assert.equal(
        chinese.t("showPropertiesOutputHeader", { path: "src/app.ts" }),
        "SVN 属性：src/app.ts"
    );
    assert.equal(chinese.t("createBranchFromWorkingCopyActionLabel"), "从工作副本创建分支");
    assert.equal(chinese.t("acceptBaseAllActionLabel"), "对全部冲突接受基础版本");
    assert.equal(chinese.t("postponeAllConflictsActionLabel"), "对全部冲突暂不处理");
    assert.equal(
        chinese.t("acceptTheirsConflictQuestion", { items: "1 项" }),
        "要对 1 项 接受远端冲突块吗？"
    );
    assert.equal(chinese.t("openFile"), "打开文件");
    assert.equal(chinese.t("exportThisFile"), "导出此文件");
    assert.equal(
        chinese.t("selectFileExportTitle", { path: "/src/app.ts", revision: 42 }),
        "选择将 r42 的 /src/app.ts 导出到哪里"
    );
});
