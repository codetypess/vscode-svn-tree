import test from "node:test";
import assert from "node:assert/strict";
import { parseInfoXml, parseLogXml, parseNodeInfoXml, parseStatusXml } from "../svn/svn-xml-parser";

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
    assert.equal(info.workingCopyRoot, "/workspace/project");
    assert.equal(info.repositoryRelativePath, "/project/trunk");
    assert.equal(info.repositoryRoot, "https://svn.example.com/repos");
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
