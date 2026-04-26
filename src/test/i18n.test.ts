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
    assert.equal(english.t("invalidRevisionError"), "Enter a valid positive revision number.");
    assert.equal(english.t("changelistLabel", { name: "feature-a" }), "Changelist: feature-a");
    assert.equal(english.t("renamePathActionLabel"), "Rename");
    assert.equal(english.t("lockPathActionLabel"), "Lock");
    assert.equal(english.t("showPathInfoActionLabel"), "Show SVN Info");
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

    assert.equal(chinese.t("addAllUnversionedActionLabel"), "添加全部未纳管项");
    assert.equal(chinese.t("noLocalChangesInfo"), "当前没有可还原的本地更改。");
    assert.equal(chinese.t("updateSelectedToRevisionActionLabel"), "将选中的路径更新到指定版本");
    assert.equal(chinese.t("noConflictsInfo"), "当前没有可处理的冲突。");
    assert.equal(chinese.t("renamePathActionLabel"), "重命名");
    assert.equal(chinese.t("copyRepositoryPathActionLabel"), "复制仓库路径");
});
