import test from "node:test";
import assert from "node:assert/strict";
import {
    parseInfoXml,
    parseListXml,
    parseLogXml,
    parseNodeInfoXml,
    parsePropertyListXml,
    parseStatusXml,
} from "../svn/svn-xml-parser";

test("parseInfoXml extracts working copy metadata", () => {
    const xml = `<?xml version="1.0"?>
<info>
  <entry kind="dir" path="." revision="42">
    <url>https://svn.example.com/repos/project/trunk</url>
    <relative-url>^/project/trunk</relative-url>
    <repository>
      <root>https://svn.example.com/repos</root>
    </repository>
    <wc-info>
      <wcroot-abspath>/workspace/project</wcroot-abspath>
    </wc-info>
  </entry>
</info>`;

    const info = parseInfoXml(xml, "/workspace/project");

    assert.ok(info);
    assert.equal(info.rootPath, "/workspace/project");
    assert.equal(info.workingCopyRoot, "/workspace/project");
    assert.equal(info.repositoryRelativePath, "/project/trunk");
    assert.equal(info.repositoryRoot, "https://svn.example.com/repos");
});

test("parseInfoXml preserves nested workspace scope separately from working copy root", () => {
    const xml = `<?xml version="1.0"?>
<info>
  <entry kind="dir" path="." revision="42">
    <url>https://svn.example.com/repos/project/trunk/src/feature</url>
    <relative-url>^/project/trunk/src/feature</relative-url>
    <repository>
      <root>https://svn.example.com/repos</root>
    </repository>
    <wc-info>
      <wcroot-abspath>/workspace/project</wcroot-abspath>
    </wc-info>
  </entry>
</info>`;

    const info = parseInfoXml(xml, "/workspace/project/src/feature");

    assert.ok(info);
    assert.equal(info.rootPath, "/workspace/project/src/feature");
    assert.equal(info.workingCopyRoot, "/workspace/project");
    assert.equal(info.repositoryRelativePath, "/project/trunk/src/feature");
});

test("parseStatusXml extracts local and remote states", () => {
    const xml = `<?xml version="1.0"?>
<status>
  <target path=".">
    <entry path="src/app.ts" kind="file">
      <wc-status item="modified" revision="12">
        <commit revision="11">
          <author>alice</author>
          <date>2026-04-24T01:02:03.000000Z</date>
        </commit>
      </wc-status>
      <repos-status item="modified" />
    </entry>
    <entry path="README.md" kind="file">
      <wc-status item="unversioned" />
    </entry>
  </target>
  <changelist name="feature-a">
    <entry path="src/feature.ts" kind="file">
      <wc-status item="modified" revision="12" />
    </entry>
  </changelist>
</status>`;

    const statuses = parseStatusXml(xml, "/workspace/project");

    assert.equal(statuses.length, 3);
    assert.equal(statuses[0].relativePath, "src/app.ts");
    assert.equal(statuses[0].wcStatus, "modified");
    assert.equal(statuses[0].reposStatus, "modified");
    assert.equal(statuses[1].wcStatus, "unversioned");
    assert.equal(statuses[2].relativePath, "src/feature.ts");
    assert.equal(statuses[2].changelist, "feature-a");
});

test("parseNodeInfoXml extracts node metadata and lock info", () => {
    const xml = `<?xml version="1.0"?>
<info>
  <entry kind="file" path="src/app.ts" revision="42">
    <url>https://svn.example.com/repos/project/trunk/src/app.ts</url>
    <relative-url>^/project/trunk/src/app.ts</relative-url>
    <repository>
      <root>https://svn.example.com/repos</root>
    </repository>
    <wc-info>
      <wcroot-abspath>/workspace/project</wcroot-abspath>
    </wc-info>
    <commit revision="41">
      <author>alice</author>
      <date>2026-04-24T01:02:03.000000Z</date>
    </commit>
    <lock>
      <owner>bob</owner>
      <comment>editing</comment>
      <created>2026-04-25T01:02:03.000000Z</created>
    </lock>
  </entry>
</info>`;

    const info = parseNodeInfoXml(xml, "/workspace/project/src/app.ts");

    assert.ok(info);
    assert.equal(info.absolutePath, "/workspace/project/src/app.ts");
    assert.equal(info.kind, "file");
    assert.equal(info.repositoryRelativePath, "/project/trunk/src/app.ts");
    assert.equal(info.committedRevision, "41");
    assert.equal(info.lockOwner, "bob");
    assert.equal(info.lockComment, "editing");
});

test("parseLogXml extracts revisions and changed paths", () => {
    const xml = `<?xml version="1.0"?>
<log>
  <logentry revision="108">
    <author>bob</author>
    <date>2026-04-24T02:03:04.000000Z</date>
    <paths>
      <path action="M" kind="file" text-mods="true" prop-mods="false">/project/trunk/src/app.ts</path>
      <path action="A" kind="dir">/project/trunk/src/new-dir</path>
    </paths>
    <msg>Refine history panel</msg>
  </logentry>
</log>`;

    const logEntries = parseLogXml(xml);

    assert.equal(logEntries.length, 1);
    assert.equal(logEntries[0].revision, 108);
    assert.equal(logEntries[0].changes.length, 2);
    assert.equal(logEntries[0].changes[0].path, "/project/trunk/src/app.ts");
    assert.equal(logEntries[0].changes[1].action, "A");
});

test("parsePropertyListXml extracts property names and values", () => {
    const xml = `<?xml version="1.0"?>
<properties>
  <target path="src/app.ts">
    <property name="svn:eol-style">LF</property>
    <property name="svn:keywords">Id
Author</property>
  </target>
</properties>`;

    const properties = parsePropertyListXml(xml);

    assert.equal(properties.length, 2);
    assert.equal(properties[0].name, "svn:eol-style");
    assert.equal(properties[0].value, "LF");
    assert.equal(properties[1].value, "Id\nAuthor");
});

test("parseListXml extracts repository list entries", () => {
    const xml = `<?xml version="1.0"?>
<lists>
  <list path="https://svn.example.com/repos/project/trunk">
    <entry kind="dir">
      <name>src</name>
      <commit revision="108">
        <author>alice</author>
        <date>2026-04-24T02:03:04.000000Z</date>
      </commit>
    </entry>
    <entry kind="file">
      <name>README.md</name>
      <size>42</size>
      <commit revision="107">
        <author>bob</author>
        <date>2026-04-23T01:02:03.000000Z</date>
      </commit>
    </entry>
  </list>
</lists>`;

    const entries = parseListXml(xml);

    assert.equal(entries.length, 2);
    assert.equal(entries[0].kind, "dir");
    assert.equal(entries[0].name, "src");
    assert.equal(entries[0].revision, "108");
    assert.equal(entries[1].kind, "file");
    assert.equal(entries[1].size, 42);
    assert.equal(entries[1].author, "bob");
});
