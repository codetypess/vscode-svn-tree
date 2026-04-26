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
