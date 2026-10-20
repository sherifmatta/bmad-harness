import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { allStylesheets, literalsIn, withoutComments } from "./literal-guard";

/**
 * The negative surface, asserted (Story 1.14).
 *
 * Epic 1's prohibitions cannot be demonstrated by using the product: nobody
 * notices a palette that is not there. So each is pinned here as a sweep over
 * the sources that names the offending file when it fails, and the rendered
 * half lives in `src/renderer/ui/shell/negative-surface.test.tsx`.
 *
 * Every sweep reads code with its comments removed — a sentence that says
 * "no spinner" is the opposite of a spinner — and none of them may be loosened
 * to make a surface pass: a sweep that fails is extended or the surface is fixed.
 */

const ROOT = resolve(import.meta.dirname, "..");
const SRC = join(ROOT, "src");

/**
 * TypeScript and JSX with block and line comments blanked, string and template
 * literals respected so a `//` inside a URL is not a comment. Quotes end at the
 * line: an apostrophe in JSX text must not swallow the rest of the file.
 */
function withoutCodeComments(source: string): string {
  let out = "";
  let at = 0;
  while (at < source.length) {
    const char = source[at];
    const next = source[at + 1];
    if (char === "/" && next === "/") {
      while (at < source.length && source[at] !== "\n") {
        at += 1;
      }
    } else if (char === "/" && next === "*") {
      const end = source.indexOf("*/", at + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(at, stop).replace(/[^\n]/g, " ");
      at = stop;
    } else if (char === "'" || char === '"' || char === "`") {
      let end = at + 1;
      while (end < source.length && source[end] !== char) {
        if (source[end] === "\\") {
          end += 1;
        } else if (source[end] === "\n" && char !== "`") {
          break;
        }
        end += 1;
      }
      out += source.slice(at, end + 1);
      at = end + 1;
    } else {
      out += char;
      at += 1;
    }
  }
  return out;
}

function withoutHtmlComments(source: string): string {
  return source.replace(/<!--[\s\S]*?-->/g, (match) =>
    match.replace(/[^\n]/g, " "),
  );
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

/**
 * Every non-test source under `src/`, repo-relative, comments removed. The
 * renderer's test support (`ui/testing/`) is test code, never shipped, and holds
 * the very words and patterns the audit looks for in what is drawn.
 */
const code = new Map<string, string>(
  filesUnder(SRC)
    .map((path) => relative(ROOT, path))
    .filter(
      (path) =>
        !/\.test\.tsx?$/.test(path) &&
        !path.endsWith(".d.ts") &&
        !path.startsWith("src/renderer/ui/testing/"),
    )
    .map((path) => {
      const text = readFileSync(join(ROOT, path), "utf8");
      if (path.endsWith(".css")) {
        return [path, withoutComments(text)];
      }
      return [
        path,
        path.endsWith(".html")
          ? withoutHtmlComments(text)
          : withoutCodeComments(text),
      ];
    }),
);

/** The cases a sweep reads: the paths under a prefix with one of the extensions. */
function sources(
  prefix: string,
  extensions: string[] = [".ts", ".tsx", ".html"],
): string[] {
  return [...code.keys()].filter(
    (path) =>
      path.startsWith(prefix) &&
      extensions.some((extension) => path.endsWith(extension)),
  );
}

/** Every path whose code matches, so a failure names files and not a count. */
function offenders(paths: string[], pattern: RegExp): string[] {
  return paths.flatMap((path) => {
    const hit = (code.get(path) ?? "").match(pattern);
    return hit === null ? [] : [`${path}: ${hit[0]}`];
  });
}

const RENDERER = "src/renderer/";
const MAIN = "src/main/";
const RENDERER_CODE = sources(RENDERER);
const RENDERER_ALL = sources(RENDERER, [".ts", ".tsx", ".html", ".css"]);
const MAIN_CODE = sources(MAIN, [".ts"]);
const ALL_CODE = sources("src/", [".ts", ".tsx", ".html"]);

it("reads the sources it claims to sweep", () => {
  // A sweep over an empty set passes for ever; this is what stops a moved
  // directory from silently emptying every one of them.
  expect(RENDERER_CODE.length).toBeGreaterThan(40);
  expect(MAIN_CODE.length).toBeGreaterThan(15);
  expect(RENDERER_ALL.filter((path) => path.endsWith(".css")).length).toBe(
    allStylesheets().length,
  );
});

describe("no palette, no launcher, no global skills list", () => {
  // The three surfaces with keys of their own: the roving lists and the shared
  // roving implementation. Nothing else in the renderer takes a keystroke.
  const KEY_SURFACES = [
    "src/renderer/ui/team/",
    "src/renderer/ui/outputs/",
    "src/renderer/ui/a11y/",
    // The Welcome's recent list is a roving list of its own page (Story 5.1), and
    // takes its arrows from the shared roving code like the other two.
    "src/renderer/ui/welcome/",
    // A side panel's splitter takes the keys that move its edge (Story 5.5): its own surface, not a list's.
    "src/renderer/ui/layout/",
    // The composer's `/` list takes the keys it answers to (Story 7.3): the arrows through the shared roving
    // code, `Enter` and `Tab` to choose a row, `Esc` to close. Its own directory, and no other file of the
    // composer's is given a key by it.
    "src/renderer/ui/skills/",
  ];
  // The composer is the one component that takes a keystroke of its own
  // (Story 2.3): Enter sends and Shift+Enter is a newline. It is exempt from
  // the key sweep as a file, not as a directory, and nothing else in chat/ is.
  const COMPOSER = "src/renderer/ui/chat/composer.tsx";
  // The one chord in the product (Story 6.3): `g` then `b`, one `keydown` listener on the document, in
  // this one file. Exempt as a file, like the composer, and nothing else in shell/ is.
  const CHORD = "src/renderer/ui/shell/use-board-chord.ts";
  const KEY_PATTERN =
    /\bonKey(?:Down|Up|Press)(?:Capture)?\b|\bonkey(?:down|up|press)\s*=|\baddEventListener\(\s*['"]key|\bkey(?:down|up|press)\b|\.key\s*===?|\b(?:event|evt|ev|e)\.code\b|\bKeyboardEvent\b|\b(?:meta|ctrl)Key\b/;

  it("handles no key outside the team, the outputs and the shared roving code", () => {
    const outside = RENDERER_CODE.filter(
      (path) =>
        path !== COMPOSER &&
        path !== CHORD &&
        !KEY_SURFACES.some((root) => path.startsWith(root)),
    );

    expect(offenders(outside, KEY_PATTERN)).toEqual([]);
  });

  it("has no ⌘K or `k` chord anywhere", () => {
    expect(
      offenders(
        ALL_CODE,
        /\bkey(?:\.to(?:Lower|Upper)Case\(\))?\s*===?\s*['"][kK]['"]|['"][kK]['"]\s*===?\s*\w+(?:\.\w+)*\.key\b|['"]Key[Kk]['"]|(?:Meta|Cmd|Command|Ctrl|Control|CommandOrControl)\s*\+\s*[kK]\b|⌘\s*[kK]\b/,
      ),
    ).toEqual([]);
  });

  // The cast chooser (Story 4.1) is the one file with an input, and the input is a
  // checkbox: a roster agent ticked or not. Nothing else in the renderer takes one.
  const CAST_CHOOSER = "src/renderer/ui/party/cast-chooser.tsx";

  // The `/` list (Story 7.3) is the one `listbox` in the product: a list of the install's skills above a persona's
  // composer, in this one file. It is never a combobox, a dialog, a menu or a search.
  const SKILL_LIST = "src/renderer/ui/skills/skill-list.tsx";

  it("has no input, select, editable region, dialog, combobox or search role, and the `/` list's listbox in one file", () => {
    expect(
      offenders(
        RENDERER_CODE.filter((path) => path !== CAST_CHOOSER && path !== SKILL_LIST),
        /<(?:input|select|dialog)\b|contentEditable|role=["'](?:dialog|combobox|search|searchbox|menu|listbox)|role:\s*["'](?:dialog|combobox|search|searchbox)|aria-modal|type=["']search/,
      ),
    ).toEqual([]);
    expect(
      offenders(
        [SKILL_LIST],
        /<(?:input|select|dialog)\b|contentEditable|role=["'](?:dialog|combobox|search|searchbox|menu)|aria-modal|type=["']search/,
      ),
    ).toEqual([]);
    expect(offenders(RENDERER_CODE, /role=["']listbox/).map((hit) => hit.split(":")[0])).toEqual([SKILL_LIST]);
  });

  it("has an input in the cast chooser, a checkbox, and nowhere else", () => {
    const chooser = code.get(CAST_CHOOSER) ?? "";
    expect(
      RENDERER_CODE.filter((path) => /<input\b/.test(code.get(path) ?? "")),
    ).toEqual([CAST_CHOOSER]);
    expect([...chooser.matchAll(/<input\b[^>]*>/g)].map(([tag]) => tag)).toHaveLength(1);
    expect(chooser).toMatch(/<input[^>]*type="checkbox"/);
    expect(chooser).not.toMatch(/<(?:select|dialog|textarea)\b|contentEditable|role=/);
  });

  it("has a textarea in the composer and nowhere else", () => {
    expect(
      RENDERER_CODE.filter((path) => /<textarea\b/.test(code.get(path) ?? "")),
    ).toEqual([COMPOSER]);
  });

  it("registers no global shortcut, and spends `accelerator` and input events in one file each", () => {
    expect(
      offenders(MAIN_CODE, /\bglobalShortcut\b|\bregisterShortcut\b/),
    ).toEqual([]);
    expect(
      offenders(
        MAIN_CODE.filter((path) => !path.endsWith("windows/app-menu.ts")),
        /\baccelerator\b/,
      ),
    ).toEqual([]);
    expect(
      offenders(
        MAIN_CODE.filter((path) => !path.endsWith("windows/doc-window.ts")),
        /before-input-event/,
      ),
    ).toEqual([]);
  });

  it("sets the application menu in the one place that builds it", () => {
    expect(
      offenders(
        MAIN_CODE.filter((path) => !path.endsWith("windows/app-menu.ts")),
        /\bsetApplicationMenu\b|\bMenu\.build/,
      ),
    ).toEqual([]);
    const index = code.get("src/main/index.ts") ?? "";
    const chain = index.slice(index.indexOf("whenReady()"));

    // Story 5.1: the menu is handed what the Welcome's `⌘O` runs, and is still first.
    expect(chain).toContain("installApplicationMenu(app.isPackaged,");
    expect(
      chain.indexOf("installApplicationMenu(app.isPackaged,"),
    ).toBeLessThan(chain.indexOf("openFirstWindow()"));
  });

  it("draws no skill list: no menu descriptions beside their codes in a component", () => {
    // The tile's hint carries codes only. A line that prints `code · description`
    // is a global skills list when it is mounted anywhere but under one persona.
    expect(
      offenders(
        sources(RENDERER, [".tsx"]),
        /\.description\b[^\n]*\bcode\b|\bcode\b[^\n]*\.description\b/,
      ),
    ).toEqual([]);
    // Only the shell hands the menus on and only the team draws them, as codes.
    const elsewhere = sources(RENDERER, [".tsx"]).filter(
      (path) =>
        path !== "src/renderer/ui/shell/shell.tsx" &&
        !path.startsWith("src/renderer/ui/team/"),
    );
    expect(offenders(elsewhere, /\bmenus\b/)).toEqual([]);
  });
});

describe("no badge, unread count, quest marker, sort or recommendation", () => {
  const BADGE =
    /(?<![A-Za-z])(?:badge|unread|quest)s?(?![a-z])|(?:Badge|Unread|Quest)(?:Count|Marker|Dot)?\b/i;

  it("names no badge, unread or quest in a component or a stylesheet outside the tokens", () => {
    const files = RENDERER_ALL.filter(
      (path) =>
        path.endsWith(".tsx") ||
        (path.endsWith(".css") && !path.endsWith("tokens.css")),
    );

    expect(offenders(files, BADGE)).toEqual([]);
  });

  it("sets no dock or taskbar badge", () => {
    expect(
      offenders(MAIN_CODE, /\bsetBadgeCount\b|\bapp\.dock\b|\bdock\./),
    ).toEqual([]);
  });

  it("orders rows and tiles by nothing but code-unit name: no sort in team, chat, shell or the feed", () => {
    for (const root of [
      "src/renderer/ui/team/",
      "src/renderer/ui/chat/",
      "src/renderer/ui/shell/",
      "src/renderer/ui/feed/",
    ]) {
      expect(
        offenders(sources(root, [".ts", ".tsx"]), /\.sort\(|\btoSorted\(/),
        root,
      ).toEqual([]);
    }
  });

  it("has no sort anywhere but the two code-unit orderings of paths", () => {
    const sorts = ALL_CODE.flatMap((path) =>
      [...(code.get(path) ?? "").matchAll(/\.sort\(|\btoSorted\(/g)].map(
        (match) => ({
          path,
          call: (code.get(path) ?? "").slice(match.index, match.index + 120),
        }),
      ),
    );

    expect(sorts.map(({ path }) => path).sort()).toEqual([
      "src/main/fold/rail-rows.ts",
      // Story 6.7: the Recent activity feed is newest-first by the event's own time (a log, not a sort by priority, owner or age).
      "src/renderer/ui/board/board-activity.ts",
      "src/renderer/ui/outputs/row-groups.ts",
      "src/renderer/ui/outputs/row-groups.ts",
    ]);
    for (const { path, call } of sorts) {
      // The feed's own time order is the one other comparator, and it lives in one file: pinned to the event's time, newest first.
      if (path === "src/renderer/ui/board/board-activity.ts") {
        expect(call, path).toMatch(/^\.sort\(\(a, b\) => b\.row\.at - a\.row\.at \|\|/);
        continue;
      }
      // The comparator is `byCodeUnit` on a path or a name, and nothing else.
      expect(
        call.slice(0, call.indexOf("byCodeUnit") + "byCodeUnit".length),
        path,
      ).toMatch(/^\.sort\(\s*(?:\(a, b\)\s*=>\s*)?byCodeUnit$/);
    }
  });
});

describe("no spinner, skeleton or stand-in sentence", () => {
  const LOADING =
    /\b(?:loading|resolving|scanning|fetching|connecting|initiali[sz]ing|please wait|spinner|skeleton|shimmer)\b/i;

  it("has no loading-like word in any renderer source or stylesheet", () => {
    expect(offenders(RENDERER_ALL, LOADING)).toEqual([]);
    // Story 3.1: the run card carries `aria-busy` while its run is in flight, as
    // its spec requires; Story 3.5's collapsed line is the same state and carries it
    // too. Those two are the whole of it, and each is an attribute, not a spinner.
    expect(
      offenders(RENDERER_CODE, /aria-busy|role=["']progressbar|<progress\b/i).sort(),
    ).toEqual([
      "src/renderer/ui/chat/run-card-line.tsx: aria-busy",
      "src/renderer/ui/chat/run-card.tsx: aria-busy",
    ]);
    for (const path of [
      "src/renderer/ui/chat/run-card.tsx",
      "src/renderer/ui/chat/run-card-line.tsx",
    ]) {
      expect((code.get(path) ?? "").match(/aria-busy/g), path).toHaveLength(1);
    }
  });

  it("defines no rotation and exactly the three keyframes the inventory names", () => {
    const css = RENDERER_ALL.filter((path) => path.endsWith(".css"));

    expect(offenders(css, /\brotate\b|rotate[XYZ3d]*\(|\bspin\b/)).toEqual([]);
    const names = css.flatMap((path) =>
      [...(code.get(path) ?? "").matchAll(/@keyframes\s+([\w-]+)/g)].map(
        ([, name]) => name,
      ),
    );
    expect(names.sort()).toEqual(["blink", "eq", "pulse"]);
  });
});

describe("the document window has no refresh, edit or save", () => {
  // Story 2.7 gives main one store: the conversation's transcript under
  // `userData`. It is the only file allowed to write, and what it may write is
  // held by tests/persistence-contract.test.ts; everything else in main still
  // writes nothing.
  const TRANSCRIPT_STORE = "src/main/sources/persistence/transcript-file.ts";
  // Story 5.1 adds the one other file main writes: the recent list, a path and a
  // time per project under `userData`. It is held by the Welcome's own contract.
  const RECENT_STORE = "src/main/sources/persistence/recent-file.ts";
  // Story 5.2 adds the last: the theme choice, one word under `userData`.
  const THEME_STORE = "src/main/sources/persistence/theme-file.ts";
  // Story 5.4 adds the fourth: each project's output folder choice, a relative path per project under `userData`.
  const FOLDER_STORE = "src/main/sources/persistence/output-folder-file.ts";
  // Story 5.5 adds the fifth: the two panel widths and each project's folded directories, under `userData`.
  const LAYOUT_STORE = "src/main/sources/persistence/layout-file.ts";

  it("forces no reload, saves and writes nothing in main but the transcript store, the recent list, the theme choice, the output folder choice and the layout", () => {
    expect(
      offenders(
        MAIN_CODE.filter((path) => !path.endsWith(TRANSCRIPT_STORE) && !path.endsWith(RECENT_STORE) && !path.endsWith(THEME_STORE) && !path.endsWith(FOLDER_STORE) && !path.endsWith(LAYOUT_STORE)),
        /\bforceReload\b|\breloadIgnoringCache\b|\.reload\(|CommandOrControl|\bsaveAs\b|\bshowSaveDialog\b|\bsave\b|\bwriteFile(?:Sync)?\b|\bappendFile(?:Sync)?\b|\bcreateWriteStream\b/,
      ),
    ).toEqual([]);
  });

  it("lets the transcript store write a file and nothing else do any of the rest", () => {
    expect(
      offenders(
        MAIN_CODE.filter((path) => path.endsWith(TRANSCRIPT_STORE)),
        /\bforceReload\b|\breloadIgnoringCache\b|\.reload\(|CommandOrControl|\bsaveAs\b|\bshowSaveDialog\b|\bsave\b|\bappendFile(?:Sync)?\b|\bcreateWriteStream\b/,
      ),
    ).toEqual([]);
  });

  it("spends the one reload role in the application menu, and only for the project window", () => {
    // The project window may be reloaded; the document window may not. The role
    // is named in exactly one file, and there only behind the project focus, so
    // the document window's menu has no reload entry at all.
    expect(
      offenders(MAIN_CODE, /role:\s*['"]reload['"]/).map((hit) =>
        hit.split(":")[0],
      ),
    ).toEqual(["src/main/windows/app-menu.ts"]);

    const menu = code.get("src/main/windows/app-menu.ts") ?? "";
    const guard = menu.match(
      /if\s*\(\s*focus\s*===\s*['"]project['"]\s*\)\s*\{[^}]*role:\s*['"]reload['"][^}]*\}/,
    );

    expect(guard).not.toBeNull();
    expect(menu.match(/role:\s*['"]reload['"]/g)).toHaveLength(1);
  });

  it("has no save, refresh, reload or edit channel on either preload or in the shared contract", () => {
    const files = [
      ...sources("src/preload/"),
      ...sources("src/shared/"),
      ...sources("src/main/", [".ts"]).filter((path) =>
        path.endsWith("-bridge.ts"),
      ),
    ];

    expect(
      offenders(
        files,
        /(['"`])[^'"`\n]*\b(?:save|refresh|reload|edit)\b[^'"`\n]*\1/i,
      ),
    ).toEqual([]);
  });

  it("has no save, refresh, reload or edit word in the document window renderer", () => {
    expect(
      offenders(
        sources("src/renderer/ui/doc/"),
        /\b(?:save|refresh|reload|edit)\b/i,
      ),
    ).toEqual([]);
  });

  it("opens an editor only through the one default-text-editor command", () => {
    expect(code.get("src/main/windows/macos-escapes.ts")).toContain(
      "args: ['-t', fullPath]",
    );
  });
});

describe("the end-session control is a lifecycle control and nothing more", () => {
  const COMPONENT = "src/renderer/ui/shell/end-session.tsx";
  const STYLESHEET = "src/renderer/ui/shell/shell.css";

  it("is one native button with no title, tooltip, confirm step, count or pressed state", () => {
    const text = code.get(COMPONENT) ?? "";

    expect(text).toMatch(/<button type="button" className="end-session" onClick=\{onEnd\}>/);
    expect(text).toContain("End session");
    expect(offenders([COMPONENT], /\btitle=|aria-describedby|aria-label|aria-pressed|aria-live|tabIndex|role=|disabled|style=/)).toEqual([]);
    expect(offenders([COMPONENT], /\b(?:tooltip|confirm|dialog|badge|count|undo)\b/i)).toEqual([]);
  });

  it("takes no accent, highlight or state colour in its stylesheet rule", () => {
    const css = code.get(STYLESHEET) ?? "";
    const rule = [...css.matchAll(/\.end-session[^{]*\{[^}]*\}/g)].map(([text]) => text).join("\n");

    expect(rule).toContain(".end-session");
    expect(rule).not.toMatch(/accent|amber|warn|danger|error|red|green|animation|transition|box-shadow|::(?:before|after)/i);
    expect(rule).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|\d+px/i);
  });

  it("is mounted by the topbar alone, and told what to do by the app alone", () => {
    expect(sources(RENDERER, [".tsx"]).filter((path) => /<EndSession\b/.test(code.get(path) ?? ""))).toEqual([
      "src/renderer/ui/shell/topbar.tsx",
    ]);
    expect(sources(RENDERER, [".tsx"]).filter((path) => /\.end\(/.test(code.get(path) ?? ""))).toEqual([
      "src/renderer/ui/app.tsx",
    ]);
  });
});

describe("the product is silent", () => {
  // Story 3.10's one native banner is silent and lives in this one file; it is the
  // one place the API may be named, and the one place its name may be imported from.
  const NOTIFIER = "src/main/windows/run-notification.ts";

  it("names no audio element, API or flag in any source", () => {
    expect(
      offenders(
        ALL_CODE,
        /<audio|<video|\bnew Audio\b|\bAudioContext\b|webkitAudioContext|\.play\(|\bshell\.beep\b|\bbeep\b|speechSynthesis|\bappendSwitch\b|\bautoplay\b/i,
      ),
    ).toEqual([]);
    // The banner API, in any case, nowhere but the notifier: an import of the
    // notifier names its file, so import lines are read apart from the code.
    const withoutImports = (text: string): string => text.replace(/^import\b[^\n]*$/gm, "");
    expect(
      ALL_CODE.filter((path) => path !== NOTIFIER && /\bnotification\b/i.test(withoutImports(code.get(path) ?? ""))),
    ).toEqual([]);
    expect(ALL_CODE.filter((path) => /run-notification['"]/.test(code.get(path) ?? ""))).toEqual(["src/main/index.ts"]);
  });

  it("carries no audio flag in the build or window configuration", () => {
    for (const file of [
      "electron.vite.config.ts",
      "electron-builder.yml",
      "package.json",
    ]) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).not.toMatch(
        /appendSwitch|autoplay|--mute-audio|--enable-audio/i,
      );
    }
  });

  it("ships no audio file anywhere in the repository", () => {
    const SKIP = new Set(["node_modules", "out", "dist", ".git"]);
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        SKIP.has(entry.name)
          ? []
          : entry.isDirectory()
            ? walk(join(dir, entry.name))
            : [relative(ROOT, join(dir, entry.name))],
      );

    expect(
      walk(ROOT).filter((path) =>
        /\.(?:mp3|wav|ogg|oga|m4a|aac|flac|aiff?|opus|wma|mid|midi|webm|mp4|caf)$/i.test(
          path,
        ),
      ),
    ).toEqual([]);
  });
});

describe("no legend footer ships", () => {
  it("has no footer element, legend rule or prototype copy", () => {
    expect(offenders(RENDERER_CODE, /<footer\b/i)).toEqual([]);
    expect(
      offenders(
        RENDERER_ALL.filter((path) => path.endsWith(".css")),
        /\.legend\b/,
      ),
    ).toEqual([]);
    expect(
      offenders(
        RENDERER_ALL,
        /design prototype|fictional|are clickable|esc closes/i,
      ),
    ).toEqual([]);
  });

  it("keeps the legend tokens, which the token table requires and no rule consumes", () => {
    const consumers = RENDERER_ALL.filter(
      (path) => !path.endsWith("tokens.css"),
    );

    expect(offenders(consumers, /--legend-badge/)).toEqual([]);
  });
});

describe("motion", () => {
  /** Every rule in a stylesheet as `{ selector, body }`, at any nesting depth. */
  const rulesOf = (css: string): { selector: string; body: string }[] =>
    [...css.matchAll(/([^{};]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
      selector: selector.replace(/\s+/g, " ").trim(),
      body,
    }));
  const MOTION = /(?<![\w-])(?:animation|transition)(?:-[a-z-]+)?\s*:/;

  const stylesheets = RENDERER_ALL.filter((path) => path.endsWith(".css"));

  it("has exactly three consumers: the working dot pulses, the tile hint reveals and the caret blinks", () => {
    const consumers = stylesheets.flatMap((path) =>
      rulesOf(code.get(path) ?? "")
        .filter(({ body }) => MOTION.test(body))
        .map(
          ({ selector }) => `${path.replace("src/renderer/", "")}: ${selector}`,
        ),
    );

    // The one block that switches motion off is the sole other mention, and it
    // is not a consumer: it names both properties in order to cancel them.
    expect(consumers.sort()).toEqual([
      "design/tokens.css: *,*::before,*::after",
      // Story 3.1: the caret, at the tail of words being written: one class, shared by the run
      // card's prose and a persona's turn in flight.
      "ui/chat/caret.css: .caret",
      // Story 4.2: the cast card's transition when the speaker changes, and the equaliser's three bars.
      "ui/party/cast-strip.css: .cast-card",
      "ui/party/cast-strip.css: .cast-eq-bar",
      "ui/party/cast-strip.css: .cast-eq-bar:nth-child(1)",
      "ui/party/cast-strip.css: .cast-eq-bar:nth-child(2)",
      "ui/party/cast-strip.css: .cast-eq-bar:nth-child(3)",
      // Story 6.7: Recent activity stills the dot of any row that is not a run in flight (`animation: none`); it adds no motion.
      "ui/shell/shell.css: .board-activity-still .status-dot",
      "ui/status/status-dot.css: .status-dot--work",
      "ui/team/team.css: .menu-hint",
    ]);
  });

  it("puts none on a pseudo-element and none behind `!important`, the reset apart", () => {
    for (const path of stylesheets) {
      for (const { selector, body } of rulesOf(code.get(path) ?? "")) {
        if (
          !MOTION.test(body) ||
          (path.endsWith("tokens.css") && selector === "*,*::before,*::after")
        ) {
          continue;
        }
        expect(selector, path).not.toMatch(
          /::?(?:before|after|first-letter|first-line|marker|placeholder)/,
        );
        expect(body, `${path} ${selector}`).not.toContain("!important");
      }
    }
  });

  it("has one reduced-motion block, and it reaches pseudo-elements", () => {
    const blocks = stylesheets.flatMap((path) =>
      [
        ...(code.get(path) ?? "").matchAll(
          /@media[^{]*prefers-reduced-motion[^{]*\{\s*([^{}]*\{[^{}]*\})/g,
        ),
      ].map(([, body]) => `${path}: ${body.replace(/\s+/g, "")}`),
    );

    expect(blocks).toEqual([
      "src/renderer/design/tokens.css: *,*::before,*::after{animation:none!important;transition:none!important}",
    ]);
  });

  it("scrolls, frames and animates by no script and no smooth-scroll rule", () => {
    // Story 3.1: the prose store paints a run's text at most once a frame, and
    // the frame is injected in one place. It animates and scrolls nothing. Story
    // 3.10's reveal hook is the renderer's one scrollIntoView, instant, never smooth, and
    // Story 7.3's `/` list is the other: it keeps the current row in view, `block: 'nearest'`, instant too;
    // Story 5.3's follow hook is the one place a scroll position is set.
    expect(
      offenders(
        RENDERER_CODE,
        /\brequestAnimationFrame\b|\.animate\(|\bscrollIntoView\b|behavior:\s*['"]smooth/,
      ).sort(),
    ).toEqual([
      "src/renderer/ui/chat/use-conversation.ts: requestAnimationFrame",
      "src/renderer/ui/chat/use-reveal.ts: scrollIntoView",
      "src/renderer/ui/skills/skill-list.tsx: scrollIntoView",
    ]);
    expect(
      (code.get("src/renderer/ui/chat/use-conversation.ts") ?? "").match(/\brequestAnimationFrame\b/g),
    ).toHaveLength(1);
    expect(
      offenders(RENDERER_CODE, /\.scroll(?:Top|To|By)\b/),
    ).toEqual(["src/renderer/ui/follow/use-follow.ts: .scrollTop"]);
    expect(offenders(RENDERER_CODE, /behavior:\s*['"]smooth|\bsmooth\b/)).toEqual([]);
    expect(offenders(stylesheets, /scroll-behavior/)).toEqual([]);
  });
});

describe("the text ramp", () => {
  /**
   * The faint tier is `--faint`, `--meta`, `--ink-doc-mute` and `--topbar-sep`.
   * Each rule that spends one is classified here, in a closed list:
   *
   * - `label`: its absence costs nothing — a group heading or a quiet sub-line
   *   whose content is named again on every row beneath or beside it.
   * - `restated`: the same fact is legible at `--dim` or above elsewhere.
   * - `decoration`: carries no fact at all.
   *
   * A selector that uses a faint token and is not here fails the suite until
   * someone says which of the three it is. A fact that has no other carrier
   * does not belong in the tier, whatever it is called.
   */
  const FAINT = /var\(\s*--(?:faint|meta|ink-doc-mute|topbar-sep)\b/;
  type Kind = "label" | "restated" | "decoration";
  const ALLOWED: Record<string, { kind: Kind; why: string }> = {
    "ui/chat/chat-header.css: .chat-head-sub": {
      kind: "label",
      why: "the persona’s own description; the tile and the header name them, and its absence costs nothing",
    },
    "ui/shell/shell.css: .board-column-head": {
      kind: "label",
      why: "a Board column's status word, as the file writes it; the cards beneath are at --text and carry the stories the word names",
    },
    "ui/shell/shell.css: .board-agents-head": {
      kind: "label",
      why: "the Agents panel's head word; each row beneath names its persona and its state at --text or --dim",
    },
    "ui/shell/shell.css: .board-activity-head": {
      kind: "label",
      why: "the Recent activity panel's head word; each row beneath names its persona, what it did and when at --text, --dim or the time's own column",
    },
    "ui/shell/shell.css: .board-epics-head": {
      kind: "label",
      why: "the Epics panel's head word; each row beneath names its epic and its count at --dim or above",
    },
    "ui/shell/shell.css: .crumbs-sep": {
      kind: "decoration",
      why: "the bar’s separator glyph",
    },
    "ui/shell/shell.css: .rail-group": {
      kind: "label",
      why: "a group heading; each row beneath carries its own name and the document window’s title bar carries the full path",
    },
    "ui/status/status-dot.css: .status-dot": {
      kind: "decoration",
      why: "the idle dot is aria-hidden; the state word beside it is at --dim",
    },
    "ui/outputs/outputs.css: .file-icon": {
      kind: "decoration",
      why: "the glyph before a file name",
    },
    "ui/chat/turn.css: .turn-role": {
      kind: "label",
      why: "the persona’s title under their name; the name and the portrait’s own label carry who is speaking, and its absence costs nothing",
    },
    "ui/chat/turn.css: .turn-time": {
      kind: "label",
      why: "the clock time of a turn; the thread is in time order, so position carries the sequence and the time only refines it",
    },
    "ui/chat/sysline.css: .sysline": {
      kind: "restated",
      why: "the handoff is announced once through the live region in the same words, and the header, the tile and aria-current already name who the work moved to",
    },
    "ui/party/cast-strip.css: .cast-status": {
      kind: "restated",
      why: "a cast card's `in the room` line; the card being there at all says it, and the speaking card turns the line to the accent",
    },
    "ui/party/room-panel.css: .room-panel-key": {
      kind: "label",
      why: "the name of a Room row (topic, opened, context, writes to); the value beside it is at --text and reads as the fact it names",
    },
    "ui/chat/composer.css: .composer-hint": {
      kind: "restated",
      why: "the two keys the field answers to; Enter sending is how every message field behaves and nothing is lost by missing the line",
    },
    "ui/outputs/outputs.css: .outputs-empty-path": {
      kind: "restated",
      why: "the empty-state sentence names _bmad/ at --dim and the topbar carries the project path at --dim",
    },
    "ui/chat/run-card.css: .run-card-elapsed": {
      kind: "restated",
      why: "the run's elapsed time; the persona's own state line counts the same turn at --dim, and the status string beside it carries the state",
    },
    "ui/chat/run-list.css: .run-step-elapsed": {
      kind: "restated",
      why: "a finished step's duration; its mark and its label say what became of the call, and a running step reads `now` at --dim, so no state rests on this figure",
    },
    "ui/chat/run-card-line.css: .run-card-line-sep": {
      kind: "decoration",
      why: "the `·` between the collapsed line's fields: aria-hidden, a glyph that carries no fact, since each field names itself",
    },
    "ui/chat/run-card.css: .run-card-foot": {
      kind: "restated",
      why: "the `also written` line naming the run's other files; each is a row of the rail under its own name at --dim or above, and the card follows one document, never these",
    },
    "ui/chat/skill-row.css: .skill-row-label": {
      kind: "label",
      why: "the row's `<Persona> can` lead-in; the composer and the header name the persona, and each button carries its own words at --text",
    },
    "ui/welcome/welcome.css: .welcome-topbar-state": {
      kind: "restated",
      why: "`no project open`, on the window that is itself the choice of one: nothing on the Welcome reads a project, and a project window's own topbar names the project it holds",
    },
    "ui/welcome/welcome.css: .welcome-topbar-sep": {
      kind: "decoration",
      why: "the bar's separator glyph, aria-hidden, between the brand and the state line",
    },
    "ui/welcome/welcome.css: .welcome-open-chord": {
      kind: "restated",
      why: "the chord beside the open button; the application menu's File item states the same key, and the button works without it",
    },
    "ui/welcome/welcome.css: .welcome-label": {
      kind: "label",
      why: "a section or lane heading (`recent`, `the team`, a phase); each row and card under it names itself, and the lane's cards carry their own titles",
    },
    "ui/welcome/welcome.css: .welcome-recent-age": {
      kind: "label",
      why: "a recent row's age; the list is newest first, so position carries recency and the age only refines it, and a row whose folder is gone says so at --dim",
    },
    "ui/welcome/welcome.css: .welcome-lane-number": {
      kind: "decoration",
      why: "the lane's ordinal at the end of its rule; the four lanes are in the method's order and each is named by its label",
    },
    "ui/team/team.css: .team-strip-label": {
      kind: "label",
      why: "the word under a state strip count (Working, Idle, Error, Changed); the figure above it is at --text-strong, and the tiles below state each persona's own state in words at --dim",
    },
  };

  /** `file: selector` for every rule under `src/renderer/` that spends a faint token. */
  function spenders(): string[] {
    return RENDERER_ALL.filter(
      (path) => path.endsWith(".css") && !path.endsWith("tokens.css"),
    ).flatMap((path) =>
      [...(code.get(path) ?? "").matchAll(/([^{};]+)\{([^{}]*)\}/g)]
        .filter(([, , body]) => FAINT.test(body))
        .map(
          ([, selector]) =>
            `${path.replace("src/renderer/", "")}: ${selector.replace(/\s+/g, " ").trim()}`,
        ),
    );
  }

  it("classifies every rule that spends a faint token, and lists no rule that does not", () => {
    expect(spenders().sort()).toEqual(Object.keys(ALLOWED).sort());
  });

  it("classifies each entry as exactly one of the three kinds, with a reason", () => {
    for (const [selector, { kind, why }] of Object.entries(ALLOWED)) {
      expect(["label", "restated", "decoration"], selector).toContain(kind);
      expect(why.length, selector).toBeGreaterThan(20);
    }
  });

  it("spends a faint token nowhere but a stylesheet rule", () => {
    expect(
      offenders(RENDERER_CODE, /--(?:faint|meta|ink-doc-mute|topbar-sep)\b/),
    ).toEqual([]);
  });

  it("keeps every sole carrier of a fact at --dim", () => {
    const SOLE_CARRIERS: [file: string, selector: string][] = [
      ["src/renderer/ui/status/status-dot.css", ".state-line"],
      ["src/renderer/ui/doc/doc-window.css", ".doc-foot"],
      ["src/renderer/ui/outputs/outputs.css", ".output-row-owner"],
      ["src/renderer/ui/feed/run-note.css", ".run-note-time"],
    ];

    for (const [file, selector] of SOLE_CARRIERS) {
      const rule = [
        ...(code.get(file) ?? "").matchAll(/([^{};]+)\{([^{}]*)\}/g),
      ].find(([, name]) => name.replace(/\s+/g, " ").trim() === selector);

      expect(rule, `${file} ${selector}`).toBeDefined();
      expect(rule?.[2], `${file} ${selector}`).toMatch(
        /(?<![\w-])color:\s*var\(--dim\)/,
      );
    }
  });
});

describe("no configuration path and none of the four cut strings", () => {
  // The two strings the mockup shows that the architecture made stale, as the
  // four sentences that carry them: the rail footer (two) and the composer
  // hint (two). Neither is replaced.
  const CUT_STRINGS = [
    "Read from each agent's",
    "Hover a tile for its skill codes",
    "skills read from",
    "click to continue the session with them",
  ];
  const PATHS =
    /\btoml\b|\.toml\b|\bcustomize\b|\.claude\/skills|\bconfig\.(?:user\.)?toml/i;

  // The renderer's static copy, and everything that crosses the bridge as an
  // envelope: the preload, the shared contract, the bridges and the projections
  // that write the messages. Dynamic project data (a file named `config.toml`)
  // is not copy and is not swept as such.
  const COPY = [
    ...RENDERER_ALL,
    ...sources("src/preload/"),
    ...sources("src/shared/"),
    ...sources("src/main/", [".ts"]).filter(
      (path) =>
        path.endsWith("-bridge.ts") || path.startsWith("src/main/projections/"),
    ),
  ];

  it("has no path to a configuration file in static copy or an envelope", () => {
    expect(offenders(COPY, PATHS)).toEqual([]);
  });

  it("has none of the four cut strings in any source", () => {
    // Curly quotes read straight and a line wrapped in JSX reads as one line.
    const plain = (text: string): string =>
      text
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201c\u201d]/g, '"')
        .replace(/\s+/g, " ")
        .toLowerCase();

    for (const text of CUT_STRINGS) {
      expect(
        ALL_CODE.concat(RENDERER_ALL).filter((path) =>
          plain(code.get(path) ?? "").includes(plain(text)),
        ),
        text,
      ).toEqual([]);
    }
  });
});

describe("the handoff says only what is true and parses no skill (Story 2.9)", () => {
  const PARSER = "src/renderer/ui/chat/handoff-target.ts";
  const BRIDGE = "src/main/session-bridge.ts";

  it("parses `@<name>` against the roster's display names alone: no skill, menu, code, description or id match", () => {
    const parser = code.get(PARSER) ?? "";

    expect(parser).toMatch(/\.name\b/);
    expect(parser).not.toMatch(
      /skill|\bmenus?\b|\bcode\b|description|\.title\b|\.module\b|toml/i,
    );
    expect(parser).not.toMatch(/\.id\s*===?|===?\s*\w+\.id\b/);
  });

  it("puts no `@` code in the composer, and leaves its hint as the two keys it answers to", () => {
    const composer = code.get("src/renderer/ui/chat/composer.tsx") ?? "";

    expect(composer).not.toMatch(/['"`]@|handoff|\bagents?\b/i);
    expect(composer).toContain("<span>enter sends</span>");
    expect(composer).toContain("<span>shift+enter adds a line</span>");
    expect(offenders(RENDERER_CODE, /autocomplete|typeahead|suggest(?:ion)?s?\b|popup/i)).toEqual([]);
  });

  it("keeps the typed `@name` out of the words: the chip is its own element, the user's text still goes through `Words` unparsed, and only the parser reads an `@` (Story 2.15)", () => {
    const turn = code.get("src/renderer/ui/chat/turn.tsx") ?? "";
    const user = turn.slice(turn.indexOf("export function UserTurn"));

    expect(user).toContain("<Words text={text} />");
    expect(user).toContain('<span className="turn-mention">{mention}</span>');
    // The turn names `mention` and parses nothing: no `@` test, split, match or slice anywhere in it.
    expect(turn).not.toMatch(/['"`]@|\\@|startsWith|\.match\(|\.exec\(|\.split\(['"`]@/);
    // Beyond the parser, the only reader of an `@` is main's check of what the renderer says it typed.
    expect(offenders(RENDERER_CODE, /\^@|startsWith\(\s*['"`]@/).map((hit) => hit.split(":")[0])).toEqual([PARSER]);
    expect(code.get("src/main/mention.ts") ?? "").toContain("/^@(\\S+)$/");
    // The persona is handed the text alone.
    const bridge = code.get(BRIDGE) ?? "";
    expect(bridge.slice(bridge.indexOf("function sendTurn"))).not.toMatch(/write\w*\([^)]*mention/);
  });

  it("has no producer of `handed to` in main: a switch writes nothing, and the handoff composer and its memory are gone (Story 7.4)", () => {
    expect(offenders(MAIN_CODE, /handed to|handoffFor|createHandoffComposer|lastOpened/)).toEqual([]);
    expect(existsSync(join(ROOT, "src/main/session-handoff.ts"))).toBe(false);
  });

  it("orders the written files by when they were written: no sort in the fold or the bridge that keeps them", () => {
    expect(
      offenders(
        ["src/main/fold/written-paths.ts", BRIDGE],
        /\.sort\(|\.toSorted\(|localeCompare/,
      ),
    ).toEqual([]);
  });

  it("styles and builds the sysline as nothing a persona is: no turn, portrait, initials, agent or name in it", () => {
    for (const path of [
      "src/renderer/ui/chat/sysline.tsx",
      "src/renderer/ui/chat/sysline.css",
    ]) {
      expect(code.get(path) ?? "", path).not.toMatch(
        /\.turn|turn-|portrait|initials|agent|persona|\bname\b|formatTurnTime/i,
      );
    }
  });

  it("adds no event, command or bridge method for it: the open's reply carries the line", () => {
    const preload = code.get("src/preload/index.ts") ?? "";

    // Thirteen before Story 2.11, whose one new method is closeSession, Story 3.1's
    // dispatchMenu, Story 3.7's stopRun, Story 3.10's onRunRevealed and Story 5.4's chooseOutputFolder;
    // none is the handoff's. Story 5.5 added the layout's three: getLayout, setPanelWidth and setFolded.
    expect([...preload.matchAll(/^ {2}([a-zA-Z]+): (?:async )?\(/gm)]).toHaveLength(24);
    expect(code.get("src/shared/commands.ts") ?? "").not.toMatch(/handoff|sysline/i);
    expect(code.get("src/shared/events.ts") ?? "").not.toMatch(/handoff|sysline/i);
  });
});

describe("the decision block marks and decides nothing (Story 2.10)", () => {
  const BLOCK = [
    "src/renderer/ui/chat/decision.ts",
    "src/renderer/ui/chat/decision-block.tsx",
    "src/renderer/ui/chat/decision-block.css",
  ];

  it("reads the block's own sources", () => {
    for (const path of BLOCK) {
      expect(code.get(path), path).toBeDefined();
    }
  });

  it("has no chosen, selected, disabled, hover, default, recommended or sorted state, and no pressed, selected or disabled aria", () => {
    for (const path of BLOCK) {
      expect(code.get(path) ?? "", path).not.toMatch(
        /aria-(?:pressed|selected|disabled|checked|current)|\bdisabled\b|\bchosen\b|\bselected\b|\brecommend|\bdefault\b|:active|\.sort\(|\btoSorted\(|\.reverse\(|\blean\b|\bpreferred\b|\bbest\b/i,
      );
    }
  });

  it("lifts an option under the pointer and in no other state: the one `:hover` is the mockup's, on the option's own border and ground", () => {
    for (const path of BLOCK) {
      const text = code.get(path) ?? "";
      expect(text.match(/:hover/g)?.length ?? 0, path).toBe(path.endsWith(".css") ? 1 : 0);
    }
    expect(code.get("src/renderer/ui/chat/decision-block.css") ?? "").toMatch(/\.decision-option:hover\s*\{/);
  });

  it("takes no key, owns no focus rule and no outline, and adds no live region, animation or sound", () => {
    for (const path of BLOCK) {
      expect(code.get(path) ?? "", path).not.toMatch(
        /onKey|keydown|keyup|keypress|\.key\b|:focus|outline|aria-live|role=["']status|animation|transition|transform|new Audio|\.play\(/,
      );
    }
  });

  it("is built of native buttons and draws no tab stop of its own", () => {
    const block = code.get("src/renderer/ui/chat/decision-block.tsx") ?? "";

    expect(block).toMatch(/<button\s+key=\{index\}\s+type="button"/);
    expect(block).not.toMatch(/tabIndex|role="button"|<(?:a|div|span)[^>]*onClick/);
  });

  it("reads only the persona's own words and imports nothing: no skill name, menu, roster or bridge", () => {
    const parser = code.get("src/renderer/ui/chat/decision.ts") ?? "";

    expect(parser).not.toMatch(/^import\b|require\(/m);
    expect(parser).not.toMatch(/skill|\bmenus?\b|agent|window\./i);
  });

  it("adds no event, command, bridge method, persisted field or record kind for it", () => {
    for (const path of [
      "src/shared/commands.ts",
      "src/shared/events.ts",
      "src/shared/conversation.ts",
      "src/preload/index.ts",
    ]) {
      // The output folder's one request (Story 5.4) is a folder chooser's, which is no decision: its two names are
      // the only place the word is spelled, and they are taken out before the rest is read.
      const own = (code.get(path) ?? "").replace(/\bchooseOutputFolder\b|\bOUTPUT_FOLDER_CHOOSE_CHANNEL\b/g, "");
      expect(own, path).not.toMatch(/decision|choose|answer/i);
    }
    expect(code.get("src/renderer/ui/chat/transcript-entry.ts") ?? "").not.toMatch(
      /decision/i,
    );
    expect(code.get("src/renderer/ui/chat/conversation-state.ts") ?? "").not.toMatch(
      /decisionOf|chosen|Decision\b/,
    );
    expect(offenders(MAIN_CODE, /decision/i)).toEqual([]);
  });

  it("leaves the persona's words as they were: `Words` never sees the decision and is handed the text whole", () => {
    const turn = code.get("src/renderer/ui/chat/turn.tsx") ?? "";
    const words = turn.slice(turn.indexOf("function Words"), turn.indexOf("function Head"));

    expect(words).not.toMatch(/decision/i);
    // The persona's turn hands `PersonaWords` its text whole, with the block drawn after it (Story 7.2).
    expect(turn).toContain("<PersonaWords text={text} writing={writing} />");
  });
});

describe("an orphaned session has one header and one control, and nothing else (Story 2.11)", () => {
  const HEADER = [
    "src/renderer/ui/chat/orphan-header.tsx",
    "src/renderer/ui/chat/orphan-header.css",
  ];

  it("reads the header's own sources", () => {
    for (const path of HEADER) {
      expect(code.get(path), path).toBeDefined();
    }
  });

  it("has no tile, tooltip, title, badge, count, sound, animation, confirm step or live region", () => {
    for (const path of HEADER) {
      expect(code.get(path) ?? "", path).not.toMatch(
        /persona-tile|\btitle=|tooltip|badge|confirm|aria-live|role=["'](?:status|alert|dialog|alertdialog)|animation|transition|transform|new Audio|\.play\(|window\.(?:confirm|alert)|<dialog/i,
      );
    }
  });

  it("is a native button with no key code, tab index, outline or focus rule of its own", () => {
    const component = code.get("src/renderer/ui/chat/orphan-header.tsx") ?? "";

    expect(component).toMatch(/<button\s+type="button"/);
    expect(component).not.toMatch(/tabIndex|onKey|role="button"|\.key\b|aria-disabled|\bdisabled\b/);
    expect(code.get("src/renderer/ui/chat/orphan-header.css") ?? "").not.toMatch(
      /outline|:focus|:active/,
    );
  });

  it("is derived at render and never stored: no orphan field in the state, the transcript or the contract", () => {
    for (const path of [
      "src/renderer/ui/chat/transcript-entry.ts",
      "src/shared/commands.ts",
      "src/shared/events.ts",
      "src/shared/conversation.ts",
    ]) {
      expect(code.get(path) ?? "", path).not.toMatch(/orphan/i);
    }
    const state = code.get("src/renderer/ui/chat/conversation-state.ts") ?? "";
    expect(state).toMatch(/export function orphansOf/);
    expect(state).not.toMatch(/^ {2}orphans\??:/m);
    expect(offenders(MAIN_CODE, /orphan/i)).toEqual([]);
    expect(offenders(sources("src/preload/"), /orphan/i)).toEqual([]);
  });

  it("closes through the declared session.close, and the orphan's header builds no stop control or document card (the stop is the run card's, Story 3.7)", () => {
    for (const path of HEADER) {
      expect(code.get(path) ?? "", path).not.toMatch(
        /\bstop\b|run\.stop|runId|document-card|doc-card|run:started/i,
      );
    }
    expect(code.get("src/shared/commands.ts") ?? "").toContain("'session.close'");
  });

  it("never closes, reopens or resumes by itself: the renderer closes only from the button's handler", () => {
    const app = code.get("src/renderer/ui/app.tsx") ?? "";
    const hook = code.get("src/renderer/ui/chat/use-conversation.ts") ?? "";
    const closers = RENDERER_CODE.filter((path) => /conversation\.close\(|\.closeSession\(/.test(code.get(path) ?? ""));

    expect(closers.sort()).toEqual([
      "src/renderer/ui/app.tsx",
      "src/renderer/ui/chat/use-conversation.ts",
    ]);
    expect(app.match(/conversation\.close\(/g)).toHaveLength(1);
    // One handler closes a session, whether it is an orphan's or the current persona's, and only a button calls it.
    expect(app).toMatch(/const closeSession = \(agentId: string\): void => \{\s*void conversation\.close\(/);
    expect(app).toMatch(/onCloseOrphan=\{closeSession\}/);
    expect(app).toMatch(/onCloseSession=\{closeSession\}/);
    // The persona's close, the room's own stop (Story 4.5) and a skill-first session's end (Story 7.5), which only a button's handler calls.
    expect(hook.match(/bridge\.closeSession\(/g)).toHaveLength(3);
    expect(app.match(/conversation\.stopRoom\(/g)).toHaveLength(1);
    expect(app.match(/conversation\.closeSkill\(/g)).toHaveLength(1);
    expect(app).toMatch(/onCloseSkill=\{closeSkill\}/);
    expect(hook).not.toMatch(/useEffect\([^)]*close\(/);
  });
});

describe("Epic 2's conversational surface asserts the rest of its prohibitions (Story 2.13)", () => {
  // Epic 2's prohibitions (UX-DR38) are all of the form "this is not there", so
  // each is pinned as a sweep over the sources, and the rendered half lives in
  // `src/renderer/ui/chat/negative-surface.test.tsx`. Where Stories 1.14 and
  // 2.9-2.11 already pin a surface, these widen the pattern; none narrows one.
  const CHAT = "src/renderer/ui/chat/";
  const CHAT_CODE = sources(CHAT, [".ts", ".tsx"]);
  const CHAT_ALL = sources(CHAT, [".ts", ".tsx", ".css"]);
  const PARSER = "src/renderer/ui/chat/handoff-target.ts";
  const BRIDGE = "src/main/session-bridge.ts";
  const APP = "src/renderer/ui/app.tsx";
  const TURN = "src/renderer/ui/chat/turn.tsx";
  const TRANSCRIPT = "src/renderer/ui/chat/transcript.tsx";
  const SYSLINE = "src/renderer/ui/chat/sysline.tsx";
  const BLOCK_COMPONENT = "src/renderer/ui/chat/decision-block.tsx";

  /**
   * The only spellings of the word `skill` a chat source may hold besides the skill row
   * (Story 3.18): the run's recorded `skill`, which the card's head draws as text. Each is the
   * whole of what its file does with it, so any other use is left in the sweep and fails it.
   * Story 7.5 adds the spelling of a skill-first session's imports and its record's kind, each said once.
   */
  const RECORDED_SKILL_SPELLINGS: Record<string, RegExp> = {
    // Story 7.5: and the kind of what a skill said in a skill-first session, spelled once.
    "src/renderer/ui/chat/transcript-entry.ts": /^  skill\?: string$|^  kind: 'skill'$/gm,
    "src/renderer/ui/chat/conversation-state.ts":
      /\.\.\.\((?:card\.)?skill === undefined \? \{\} : \{ skill(?:: card\.skill)? \}\),|const \{ runId, sessionId, agentId, (?:code, )?skill, plan, at \}|^import [^\n]* from '(?:\.\.\/status\/skill-seat|\.\/skill-session-state)'$|record\.kind === 'skill'/gm,
    "src/renderer/ui/chat/run-card.tsx":
      /<RunHeadName skill=\{entry\.skill\} \/>|function RunHeadName\(\{ skill \}: \{ skill: string \| undefined \}\)|if \(skill === undefined\)|className="run-card-skill">\{skill\}/g
  };

  /**
   * Story 7.5: the files of chat/ that draw a skill-first session, whose speaker is the skill it was started with.
   * They say `skill` for that and for nothing a persona's menu says.
   */
  const SKILL_FIRST_CHAT = [
    "src/renderer/ui/chat/chat-header.tsx",
    "src/renderer/ui/chat/skill-session-state.ts",
    "src/renderer/ui/chat/transcript.tsx",
    "src/renderer/ui/chat/use-conversation.ts",
  ];

  /**
   * What a source says to a person: the contents of its string and template
   * literals, and the text between JSX tags. Identifiers are not copy, so a
   * variable named `opening` is not a sentence that says so.
   */
  function copyOf(path: string): string[] {
    const text = code.get(path) ?? "";
    const literals = [...text.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)].map(
      ([, , body]) => body,
    );
    // Text beside an expression is copy too: `<p>Opening {name}</p>` reads as
    // "Opening", so the braces are blanked first and the rest is swept.
    const jsx = path.endsWith(".tsx")
      ? [...text.replace(/\{[^{}]*\}/g, " ").matchAll(/(?<![=-])>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map(
          ([, body]) => body,
        )
      : [];
    return [...literals, ...jsx]
      .map((line) => line.trim())
      .filter((line) => /[A-Za-z]/.test(line));
  }

  /** Every file whose copy matches, naming the string and not the file's whole text. */
  function copyOffenders(paths: string[], pattern: RegExp): string[] {
    return paths.flatMap((path) =>
      copyOf(path)
        .filter((line) => pattern.test(line))
        .map((line) => `${path}: ${line}`),
    );
  }

  it("reads the chat column's own sources", () => {
    expect(CHAT_CODE.length).toBeGreaterThan(10);
    for (const path of [PARSER, BRIDGE, APP, TURN, TRANSCRIPT, SYSLINE, BLOCK_COMPONENT]) {
      expect(code.get(path), path).toBeDefined();
    }
    // The extractor finds the copy it is meant to sweep, or every copy sweep is empty.
    expect(copyOf(TURN)).toContain("cancel");
    expect(copyOf(TURN).join("\n")).toContain("queued · sends when");
    expect(copyOf("src/renderer/ui/status/persona-state.ts")).toContain("working");
    // Copy written beside an expression is found: this is the commonest way to write a status sentence in JSX.
    expect(copyOf("src/renderer/ui/chat/orphan-header.tsx")).toContain("close session");
    expect(copyOf("src/renderer/ui/app.tsx").length).toBeGreaterThan(0);
  });

  it("finds a stand-in sentence written beside an expression, and a bare ellipsis", () => {
    const probe = "src/renderer/ui/chat/__probe__.tsx";
    code.set(probe, "const a = <p>Opening {name}</p>;\nconst b = <p>{x} loading</p>;\nconst c = '…';");
    try {
      expect(copyOf(probe)).toEqual(expect.arrayContaining(["Opening", "loading"]));
    } finally {
      code.delete(probe);
    }
  });

  describe("the composer parses no skill and offers no completion", () => {
    it("parses `@` in exactly one file, which reads the roster's display name and nothing else", () => {
      expect(
        offenders(
          RENDERER_CODE,
          /(['"`])@|\^@|\[@\]|startsWith\(\s*['"`]@|\bcharAt\(\s*0\s*\)\s*===?\s*['"`]@|\[\s*0\s*\]\s*===?\s*['"`]@/,
        ).map((hit) => hit.split(":")[0]),
      ).toEqual([PARSER]);
      expect(
        RENDERER_CODE.filter((path) => /\bhandoffTarget\b/.test(code.get(path) ?? "")),
      ).toEqual([APP, PARSER]);

      const parser = code.get(PARSER) ?? "";
      expect(parser.match(/\.name\b/g)).toHaveLength(1);
      expect(parser).not.toMatch(/\.(?:id|title|module|description|icon)\s*===?|===?\s*\w+\.(?:id|title|module|description|icon)\b/);
      // The one id comparison is the current persona's exclusion, never a match.
      expect(parser.match(/\.id\b/g)).toHaveLength(1);
      expect(parser).toContain("agent.id !== currentId");
    });

    it("reads no menu, skill, code or description anywhere in chat/", () => {
      // Story 3.1 puts the skill row in chat/ on purpose: it draws a persona's
      // codes and descriptions above the composer and hands a code to main. It is
      // swept for what it may not do in its own describe below; here it is set
      // apart, and the code it hands on passes through the conversation's one
      // `runSkill(agentId, code)` and the bridge's `dispatchMenu(sessionId, code)`.
      const ROW = "src/renderer/ui/chat/skill-row.tsx";
      expect(CHAT_CODE).toContain(ROW);
      // Story 3.18: the run card's own files hold the one recorded field `skill`
      // (a fact about a run already started, AD-24) and nothing else of the word.
      // They are swept below with that spelling taken out; every other file is
      // swept whole.
      const RECORDED = Object.keys(RECORDED_SKILL_SPELLINGS);
      const rest = CHAT_CODE.filter((path) => path !== ROW && !RECORDED.includes(path));
      // Story 7.5: a skill-first session's thread names the skill it was started with, as its speaker and in its own
      // state. These files say that and nothing of a persona's menu: the sweep takes out the word `skill` for them
      // alone and keeps every other word of it, and `skills` (the install's list) stays out of them.
      const SKILL_FIRST = SKILL_FIRST_CHAT;
      // Story 7.3: the composer is handed the `/` list's rows and imports its hook from `../skills/`, so the
      // directory's name is in its two import lines. Those two lines are taken out and the rest of the file is
      // swept whole, as is every other file: the composer still reads no skill, menu, code or description itself.
      const COMPOSER_PATH = "src/renderer/ui/chat/composer.tsx";
      const SLASH_IMPORTS = /^import [^\n]* from '\.\.\/skills\/(?:use-slash-list|slash-query)'\n/gm;
      expect((code.get(COMPOSER_PATH) ?? "").match(SLASH_IMPORTS)).toHaveLength(2);
      expect(
        offenders(
          rest.filter((path) => path !== COMPOSER_PATH && !SKILL_FIRST.includes(path)),
          /\bmenus?\b|\bskills?\b|\bMenuEntry\b|\bcodes\b/i,
        ),
      ).toEqual([]);
      expect(offenders(SKILL_FIRST, /\bmenus?\b|\bskills\b|\bMenuEntry\b|\bcodes\b/i)).toEqual([]);
      expect((code.get(COMPOSER_PATH) ?? "").replace(SLASH_IMPORTS, "")).not.toMatch(
        /\bmenus?\b|\bskills?\b|\bMenuEntry\b|\bcodes\b/i,
      );
      for (const path of RECORDED) {
        expect(CHAT_CODE, path).toContain(path);
        const left = (code.get(path) ?? "").replace(RECORDED_SKILL_SPELLINGS[path], "");
        expect(left, path).not.toMatch(/\bmenus?\b|\bskills?\b|\bMenuEntry\b|\bcodes\b/i);
      }
      expect(
        rest.flatMap((path) =>
          [...(code.get(path) ?? "").matchAll(/^.*\bcode\s*:.*$/gm)].map(([line]) => `${path}: ${line.trim()}`),
        ),
      ).toEqual([
        "src/renderer/ui/chat/use-conversation.ts: dispatchMenu(sessionId: string, code: string): Promise<string>",
        "src/renderer/ui/chat/use-conversation.ts: runSkill(agentId: string, code: string): void",
        // Story 8.3: a button pressed on an empty chat starts the seat with the code, which main resolves.
        "src/renderer/ui/chat/use-conversation.ts: function startSeatWithSkill(agentId: string, code: string): void {",
        "src/renderer/ui/chat/use-conversation.ts: runSkill: (agentId: string, code: string) => void",
        "src/renderer/ui/chat/use-conversation.ts: (agentId: string, code: string) => conversation.current?.runSkill(agentId, code),",
      ]);
      // The `.code` in chat/ outside the row is the error code of a refused send, dispatch or stop, never a menu's.
      expect(
        rest.flatMap((path) =>
          [...(code.get(path) ?? "").matchAll(/\w[\w.()]*\.code\b/g)].map(([hit]) => `${path}: ${hit}`),
        ),
      ).toEqual([
        "src/renderer/ui/chat/use-conversation.ts: asHarnessError(reason).code",
        "src/renderer/ui/chat/use-conversation.ts: asHarnessError(reason).code",
        // Story 7.5: a first message is refused as naming no skill, or not.
        "src/renderer/ui/chat/use-conversation.ts: error.code",
        // Story 8.3: a first message and a button press that start a seat are refused as busy (main holds the seat) or not.
        "src/renderer/ui/chat/use-conversation.ts: asHarnessError(reason).code",
        "src/renderer/ui/chat/use-conversation.ts: asHarnessError(reason).code",
        // Story 7.5: a send to a skill-first session is refused as ended, or not.
        "src/renderer/ui/chat/use-conversation.ts: asHarnessError(reason).code",
        "src/renderer/ui/chat/use-conversation.ts: asHarnessError(reason).code",
        "src/renderer/ui/chat/use-conversation.ts: asHarnessError(reason).code",
        // Story 4.2: the room's send is refused as busy or not, as a persona's is.
        "src/renderer/ui/chat/use-conversation.ts: asHarnessError(reason).code",
        // Story 3.19: the header's stop is refused as not-found or not, as a run's is.
        "src/renderer/ui/chat/use-conversation.ts: asHarnessError(reason).code",
        // Story 8.5: a close by agent id is refused as not-found (nothing held there) or not.
        "src/renderer/ui/chat/use-conversation.ts: asHarnessError(reason).code",
      ]);
      const descriptions = rest.flatMap((path) =>
        [...(code.get(path) ?? "").matchAll(/[\w.]*\.description\b/g)].map(
          ([hit]) => `${path}: ${hit}`,
        ),
      );
      // The chat header's second line is gone (2026-10-09): nothing in chat/ draws a description.
      expect(descriptions).toEqual([]);
    });

    it("parses no leading `/` and no other prefix anywhere between the composer and the session", () => {
      const SLASH =
        /\/\^\\\/|startsWith\(\s*['"`]\/|\bcharAt\(\s*0\s*\)\s*===?\s*['"`]\/|\[\s*0\s*\]\s*===?\s*['"`]\/|\^\/[a-z]/;
      const PROCESS = "src/main/sources/session/session-process.ts";
      expect(code.has(PROCESS), PROCESS).toBe(true);
      const BETWEEN = [...CHAT_CODE, APP, BRIDGE, PROCESS];

      // Story 7.5: the one reader of a leading `/` between the composer and the session is main's reading of a
      // first message typed in the New session chat (`openFirst`), matched against the install's own skill list.
      expect(offenders(BETWEEN, SLASH)).toEqual(["src/main/session-bridge.ts: startsWith('/"]);
      const composer = code.get("src/renderer/ui/chat/composer.tsx") ?? "";
      // The composer hands the trimmed draft on and looks at no character of it.
      expect(composer).toContain("onSend(text.trim())");
      expect(composer).not.toMatch(/\.(?:startsWith|charAt|match|test|split|replace|slice|indexOf)\(/);
      // Story 7.3: the one reader of a leading `/` is the `/` list's pure query, which only prefix-filters the rows
      // main gave it; nothing in `skills/` reaches the session, and the composer's text is sent as typed.
      expect(
        offenders(
          RENDERER_CODE.filter((path) => path.startsWith("src/renderer/ui/skills/")),
          SLASH,
        ).map((hit) => hit.split(":")[0]),
      ).toEqual(["src/renderer/ui/skills/slash-query.ts"]);
      expect(
        offenders(
          RENDERER_CODE.filter((path) => path.startsWith("src/renderer/ui/skills/")),
          /\bipcRenderer\b|\bwindow\.api\b|\bsendTurn\b|\bonSend\b|\bdispatchMenu\b|\brunSkill\b|\bopenSession\b/,
        ),
      ).toEqual([]);
    });

    it("writes the user's text into the session as given: `turn.send` hands `text` to `write` untouched", () => {
      const bridge = code.get(BRIDGE) ?? "";
      const bodyOf = (name: string): string => {
        const handler = bridge.slice(bridge.indexOf(`function ${name}`));
        return handler.slice(0, handler.indexOf("\n}\n"));
      };
      // Story 3.1: the write is `writeTurn`'s, shared with the menu dispatch; the
      // send hands it the checked argument as it came, and records that same text.
      const send = bodyOf("sendTurn");
      const write = bodyOf("writeTurn");
      const checked = bodyOf("writableSession");

      expect(send).toContain("writeTurn(entry, target.arg)");
      // The user's own words are what is recorded; a validated mention rides beside them (AD-25), and a room's never.
      expect(send).toContain("recordUserTurn(target.arg, at, undefined, named, undefined, entry.agentId)");
      expect(send).toContain("recordUserTurn(target.arg, at, true)");
      // Story 7.5: a skill-first session's turn is recorded as typed, flagged as its own thread's.
      expect(send).toContain("recordUserTurn(target.arg, at, undefined, undefined, entry.sessionId)");
      expect(send).toContain("validMention(mention, ctx.nameOf(sender.id, entry.agentId))");
      // What the persona is handed is the text alone: the mention never reaches a write.
      expect(send).not.toMatch(/writeTurn\([^)]*mention/);
      expect(checked).toContain("return { ok: true, service, entry, arg }");
      expect(write).toContain("entry.session?.write(text)");
      for (const body of [send, write, checked]) {
        expect(body).not.toMatch(/\b(?:text|arg)\s*(?:=[^=]|\.(?:replace|trim|slice|split|startsWith|match))/);
      }
    });

    it("draws no completion surface: no listbox, datalist, autocomplete, active descendant or popup", () => {
      // A folder heading (Story 5.5) names the rows it folds with `aria-controls`: the one place, and not a completion.
      const FOLDER_HEADING = "src/renderer/ui/outputs/folder-heading.tsx";
      // Story 7.3's `/` list is the one completion surface, by design, and is exempt by directory: its listbox, the
      // `aria-controls` and `aria-activedescendant` the textarea carries while it is open. It is still no datalist,
      // autocomplete attribute, popup or suggestion, and the two attributes are spelled in its hook alone.
      const SLASH_LIST = RENDERER_CODE.filter((path) => path.startsWith("src/renderer/ui/skills/"));
      expect(SLASH_LIST.length).toBeGreaterThan(2);
      expect(
        offenders(
          RENDERER_CODE.filter((path) => path !== FOLDER_HEADING && !SLASH_LIST.includes(path)),
          /\blistbox\b|<datalist\b|\blist=["{]|aria-autocomplete|aria-activedescendant|aria-haspopup|aria-controls|aria-owns|autoComplete|\bcompletions?\b|\bsuggest/i,
        ),
      ).toEqual([]);
      expect(
        offenders(
          [FOLDER_HEADING],
          /\blistbox\b|<datalist\b|\blist=["{]|aria-autocomplete|aria-activedescendant|aria-haspopup|aria-owns|autoComplete|\bcompletions?\b|\bsuggest/i,
        ),
      ).toEqual([]);
      expect(
        offenders(SLASH_LIST, /<datalist\b|\blist=["{]|aria-autocomplete|aria-haspopup|aria-owns|autoComplete|\bcompletions?\b|\bsuggest/i),
      ).toEqual([]);
      expect(
        offenders(RENDERER_CODE, /aria-activedescendant/).map((hit) => hit.split(":")[0]),
      ).toEqual(["src/renderer/ui/skills/use-slash-list.ts"]);
    });
  });

  describe("a persona's turn carries no tooltip and no chrome derived from a skill", () => {
    it("has no `title=`, `data-*`, `aria-describedby`, tooltip, popover or CSS `attr(` anywhere in the renderer", () => {
      // `tokens.css` alone names an attribute: the light theme's `data-theme` (Story 5.2), which is
      // written by the preload and read by no component.
      expect(
        offenders(
          RENDERER_ALL.filter((path) => path !== "src/renderer/design/tokens.css"),
          /(?<![\w-])title\s*=|(?<![\w-])data-[a-z]|aria-describedby|role=["']tooltip|\btooltip\b|\bpopover\b|\battr\(|\bdataset\b|\bsetAttribute\(/i,
        ),
      ).toEqual([]);
    });

    it("draws the run's recorded skill as text only: no tooltip, data or aria from it, no list, and no dispatch by it (Story 3.18, FR27)", () => {
      for (const path of Object.keys(RECORDED_SKILL_SPELLINGS)) {
        // A skill-first session's own lines (Story 7.5) are not the card's recorded field: they name the session.
        const lines = (code.get(path) ?? "").split("\n").filter((line) => /\bskill\b/.test(line) && !/skillSession|SkillSession/.test(line));
        expect(lines.length, path).toBeGreaterThan(0);
        for (const line of lines) {
          expect(line, path).not.toMatch(/\btitle\b|data-|aria-|\bdispatch|runSkill|\.map\(|\.filter\(|\.find\(|\.includes\(|onClick|href|menu/i);
        }
      }
      // The head's name reaches nothing but the text of its own span.
      const card = code.get("src/renderer/ui/chat/run-card.tsx") ?? "";
      expect(card.match(/entry\.skill\b/g)).toHaveLength(1);
      expect(card.match(/\{skill\}/g)).toHaveLength(1);
      // Nothing else in the window reads a card's skill, and what dispatches takes a code.
      expect(
        offenders(
          CHAT_CODE.filter((path) => !Object.keys(RECORDED_SKILL_SPELLINGS).includes(path)),
          /\b(?:entry|card|run)\.skill\b/,
        ),
      ).toEqual([]);
      expect(code.get(BRIDGE)).toContain("async (event: IpcMainInvokeEvent, sessionId: unknown, code: unknown): Promise<MenuDispatchReply>");
      // Story 7.5: the conversation hook now speaks of a skill-first session, which is no menu's skill.
      expect(offenders(["src/shared/commands.ts", "src/shared/channels.ts"], /\bskill\b/i)).toEqual([]);
      const css = CHAT_ALL.filter((path) => path.endsWith(".css")).map((path) => code.get(path) ?? "").join("\n");
      expect(css).not.toMatch(/\[class[*^$~|]?=[^\]]*skill|\[data-/);
    });

    it("styles the run's recorded skill from tokens alone: the name strong in text-strong, run in dim (Story 3.18)", () => {
      const css = code.get("src/renderer/ui/chat/run-card.css") ?? "";
      const rule = (selector: string): string =>
        css.match(new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
      expect(rule(".run-card-skill")).toMatch(/font-weight:\s*var\(--weight-strong\)/);
      expect(rule(".run-card-skill")).toMatch(/color:\s*var\(--text-strong\)/);
      expect(rule(".run-card-run")).toMatch(/color:\s*var\(--dim\)/);
      for (const selector of [".run-card-skill", ".run-card-run"]) {
        expect(rule(selector), selector).not.toMatch(/#[0-9a-f]{3,8}\b|\d+px|rgb|hsl|font-weight:\s*\d/i);
      }
    });

    it("builds the turn, the transcript, the sysline and the decision block from no menu entry", () => {
      for (const path of [TURN, TRANSCRIPT, SYSLINE, BLOCK_COMPONENT]) {
        const text = code.get(path) ?? "";
        const imports = [...text.matchAll(/^import\b[^;]*?from\s+['"]([^'"]+)['"]/gm)].map(
          ([, from]) => from,
        );

        expect(imports.filter((from) => /team|menu|skill|install-state|use-install/.test(from)), path).toEqual([]);
        // Story 7.5: the transcript tells what a skill said in a skill-first session by its entry's kind, spelled once.
        expect(text.replace("entry.kind === 'skill'", ""), path).not.toMatch(/\bmenus?\b|\bskills?\b|\bMenuEntry\b|\.code\b|\.description\b/i);
      }
    });

    it("styles a turn by its speaker alone: no class or rule is built from an agent id, a code or a name", () => {
      expect(offenders([TURN, TRANSCRIPT, SYSLINE, BLOCK_COMPONENT], /className=\{\s*`|className=\{[^}]*\+|\bclassName=\{[^}]*(?:agent|name|id)\b/)).toEqual([]);
      expect(offenders(CHAT_ALL.filter((path) => path.endsWith(".css")), /\[class[*^$~|]?=|\[aria-label|\[data-/)).toEqual([]);
    });
  });

  describe("nothing offers a handoff: it is the user's, by tile or `@name`", () => {
    it("has no refusal, deflection or handoff-offer copy in any source", () => {
      expect(
        copyOffenders(
          ALL_CODE,
          /\b(?:can(?:'|’)?t|cannot|unable to|not able to|won(?:'|’)?t) (?:help|do|answer|assist)|\boutside (?:of )?(?:my|their|this|the) (?:scope|speciality|specialty|expertise|remit|area)|\bnot my (?:area|job|speciality|specialty)|\bbetter (?:suited|placed|handled|asked)|\bask \w+ (?:instead|about)|\b(?:hand|handing|handoff|hand-off|switch|switching|talk|speak|turn|pass)\b[^"'`]*\b(?:to|over to|with) (?:@|\w+ (?:instead|for that))|\byou (?:may|might|could|should|can) (?:want to )?(?:ask|try|talk|switch|hand)|\bwould you like|\bwant me to\b|\btry @|\bsuggest/i,
        ),
      ).toEqual([]);
    });

    it("resolves a handoff in `App` alone, and opens a session for it from the user's send only", () => {
      const app = code.get(APP) ?? "";
      expect(app.match(/\bhandoffTarget\(/g)).toHaveLength(1);
      // The call sits inside the composer's `onSend`, which only the user's send runs.
      const send = app.slice(app.indexOf("onSend={"));
      expect(send.indexOf("handoffTarget(")).toBeGreaterThan(-1);
      expect(app.slice(0, app.indexOf("onSend={"))).not.toContain("handoffTarget(");
      // `activate` is called by nothing in the renderer's views: a tile and an `@` only turn the chat, and the
      // first message starts the seat (Stories 8.2, 8.3, 8.6).
      expect(app.match(/conversation\.activate\(/g)).toBeNull();
      for (const path of RENDERER_CODE.filter((p) => p !== APP && p !== "src/renderer/ui/chat/use-conversation.ts")) {
        expect(code.get(path) ?? "", path).not.toMatch(/\.activate\(/);
      }
    });

    it("writes no sysline when a session opens: the open handler holds no `say` or `recordSysline`, and `recordSysline` is called only by the voice and the transcript (Story 7.4)", () => {
      const bridge = code.get(BRIDGE) ?? "";
      const open = bridge.slice(bridge.indexOf("function openSession"), bridge.indexOf("function sendTurn"));

      expect(open).not.toMatch(/\.say\(|recordSysline|handoff/);
      expect(
        offenders(MAIN_CODE.filter((path) => path !== BRIDGE), /\brecordSysline/).map((hit) => hit.split(":")[0]),
      ).toEqual(["src/main/projections/transcript.ts", "src/main/session-voice.ts"]);
      // The persona's words are never read for a handoff: no fold parses `said` text for a name.
      expect(offenders(MAIN_CODE, /\bpersona:said\b[^\n]*(?:handoff|handed)/)).toEqual([]);
    });

    it("has no button in the turn, the transcript or the sysline but the queued message's cancel", () => {
      expect(code.get(TURN)?.match(/<button\b/g)).toHaveLength(1);
      expect(code.get(TURN)).toMatch(/<button\s+type="button"\s+className="turn-cancel"/);
      expect(offenders([TRANSCRIPT, SYSLINE], /<button\b|role=["']button|onClick/)).toEqual([]);
    });
  });

  describe("nothing stands in for a spinner, while a session opens or at any other time", () => {
    const STAND_IN =
      /\b(?:loading|resolving|scanning|fetching|connecting|initiali[sz]ing|please wait|spinner|skeleton|shimmer|opening|starting|thinking|typing|waiting|processing|preparing|booting|launching|warming|getting ready|in progress|one moment|just a moment|hold on|stand by|working)\b|\.\.\.|…/i;

    it("has no stand-in word in any string or JSX text, and `working` only where the state words live", () => {
      const swept = [...ALL_CODE, ...RENDERER_ALL.filter((path) => path.endsWith(".css"))];
      const hits = copyOffenders(swept, STAND_IN);

      // Three strings of the Welcome (Story 5.1) are what the story's text spells and are no stand-in
      // for progress: the `…` that marks a command which opens the native chooser, as on every Mac
      // (the menu item and the button, the same words), and Mary's description, whose noun is `thinking`.
      // `working` is the state word of a persona, and the head's status word of a run that writes no document (Story 3.17).
      const WORKING = ["src/renderer/ui/status/persona-state.ts: working", "src/renderer/ui/chat/run-card.tsx: working"];
      // Story 6.5: the Board's overview label `stories in progress` is the BMad status word the file itself writes, no stand-in.
      const BOARD = ["src/renderer/ui/board/board-view.tsx: stories in progress"];
      const WELCOME = [
        "src/main/windows/app-menu.ts: Open Project Folder…",
        "src/renderer/ui/welcome/personas.ts: Market and competitive research and requirements — the thinking done before a project is committed to.",
        "src/renderer/ui/welcome/welcome-app.tsx: open project folder…",
        // Story 5.4: the same mark on the commands that open the native folder chooser, the head's link and the menu's item.
        "src/main/windows/app-menu.ts: Output Folder…",
        "src/renderer/ui/outputs/outputs-head.tsx: change…",
      ];
      expect(
        hits.filter(
          (hit) => !WORKING.includes(hit) && !WELCOME.includes(hit) && !BOARD.includes(hit),
        ),
      ).toEqual([]);
      expect(hits.filter((hit) => WELCOME.includes(hit)).sort()).toEqual([...WELCOME].sort());
      expect(hits.filter((hit) => !WELCOME.includes(hit) && !BOARD.includes(hit)).sort()).toEqual([...WORKING].sort());
      expect(hits.filter((hit) => BOARD.includes(hit))).toEqual(BOARD);
      // The word is rendered through the state text, and by the head of a run that writes no document, and written nowhere else.
      expect(
        offenders(RENDERER_CODE, /\bworking\b/).map((hit) => hit.split(":")[0]).sort(),
      ).toEqual(["src/renderer/ui/chat/run-card.tsx", "src/renderer/ui/status/persona-state.ts"]);
    });

    it("has the queued mark in `turn.tsx` and nowhere else, and no other status line beside the persona's state", () => {
      expect([...new Set(ALL_CODE.concat(RENDERER_ALL))].filter((path) => /queued\s*·/.test(code.get(path) ?? ""))).toEqual([TURN]);
      expect(copyOf(TURN).filter((line) => /^queued\b/i.test(line))).toEqual([
        "queued · sends when ${queuedFor} finishes",
      ]);
      // A stylesheet rule has no generated content to put a word there either.
      expect(offenders(RENDERER_ALL.filter((path) => path.endsWith(".css")), /(?<![\w-])content\s*:(?!\s*(?:none\b|normal\b|''|""))/)).toEqual([]);
    });

    it("has no progress, busy, status or alert element, and no live region of its own, in chat/", () => {
      expect(
        offenders(
          CHAT_CODE,
          /<progress\b|<meter\b|aria-busy|aria-live|aria-valuenow|role=["'](?:progressbar|status|alert|log|marquee|timer)|<output\b|<svg\b[^>]*\banimate|<animate/i,
        ).sort(),
        // Story 3.1: the run card's `aria-busy` while its run is in flight is the one; Story 3.5's line is the other.
      ).toEqual([
        "src/renderer/ui/chat/run-card-line.tsx: aria-busy",
        "src/renderer/ui/chat/run-card.tsx: aria-busy",
      ].sort());
      expect(offenders(RENDERER_ALL.filter((path) => path.endsWith(".css")), /@keyframes\s+(?!blink\b|eq\b|pulse\b)/)).toEqual([]);
    });

    it("keeps no opening, pending or starting state in the conversation: a session that is not up is a queued message", () => {
      const state = code.get("src/renderer/ui/chat/conversation-state.ts") ?? "";
      const start = state.indexOf("export type ConversationState = {");
      const type = state.slice(start, state.indexOf("\n}", start));

      expect(start).toBeGreaterThan(-1);
      expect([...type.matchAll(/^ {2}(\w+)\??:/gm)].map(([, field]) => field)).toEqual([
        "entries",
        "sessions",
        "busy",
        "queue",
        "personas",
        "room",
        "roomCast",
        "roomOpenedAt",
        "roomTopic",
        "roomReturned",
        // Story 7.5: the skill-first sessions, live or ended: a seat each, and no state for a wait.
        "skillSessions",
        "nextId",
      ]);
      for (const path of [
        "src/renderer/ui/chat/conversation-state.ts",
        "src/renderer/ui/chat/transcript-entry.ts",
        "src/shared/conversation.ts",
      ]) {
        expect(code.get(path) ?? "", path).not.toMatch(
          /\b(?:opening|pending|starting|connecting|loading|booting|launching)\s*\??:|kind:\s*['"](?:opening|pending|status|progress|placeholder)/i,
        );
      }
      // A transcript entry is a persona's, the user's, the harness's sysline or, from
      // Story 3.1, a run's card, born on `run:started`: no fifth kind, and no kind for a wait.
      // Story 7.5 adds the fifth, a skill's words in a skill-first session; none is a kind for a wait.
      expect([...(code.get("src/renderer/ui/chat/transcript-entry.ts") ?? "").matchAll(/kind:\s*'(\w+)'/g)].map(([, kind]) => kind)).toEqual([
        "persona",
        "skill",
        "user",
        "sysline",
        "run",
      ]);
    });
  });

  describe("the whole epic is silent and badge-free", () => {
    // Story 3.10 added the one native banner, in one file: that file alone may name
    // the API, and is swept for everything else in the list all the same.
    const NOTIFIER = "src/main/windows/run-notification.ts";
    const SILENT =
      /\bflashFrame\b|\brequestUserAttention\b|\bsetProgressBar\b|\bsetOverlayIcon\b|\bsetBadgeCount\b|\bbadgeCount\b|\bBadgeCount\b|\bapp\.dock\b|\bdock\b|\bbounce\b|\bsetBadge\b|\bsetTrayTitle\b|\bnew Tray\b|\bTray\b|\bshowNotification\b|\bshell\.beep\b|\bbeep\b|\bsystemPreferences\.(?:setUserDefault|postNotification|subscribeNotification)|\bsetWindowButtonVisibility\b|\bsetDocumentEdited\b|\bsetRepresentedFilename\b|\bnew Audio\b|\bAudioContext\b|<audio|<video|\.play\(/;

    it("names no sound, Dock, badge, bounce, progress, attention or notification API in any source but the notifier, preload and shared included", () => {
      expect(
        offenders(
          ALL_CODE.filter((path) => path !== NOTIFIER),
          new RegExp(`${SILENT.source}|\\bNotification\\b`),
        ),
      ).toEqual([]);
      expect(ALL_CODE).toContain(NOTIFIER);
      expect(offenders([NOTIFIER], SILENT)).toEqual([]);
    });

    it("lets the preload and the shared contract carry no word for any of it", () => {
      expect(
        offenders(
          [...sources("src/preload/"), ...sources("src/shared/")],
          /\b(?:sound|audio|badge|dock|bounce|progress|attention|notif\w*|chime|ding|alert)\b/i,
        ),
      ).toEqual([]);
    });
  });

  describe("the decision block's marks are absent in the places the first pins did not look", () => {
    const BLOCK = [
      "src/renderer/ui/chat/decision.ts",
      "src/renderer/ui/chat/decision-block.tsx",
      "src/renderer/ui/chat/decision-block.css",
    ];

    it("has no focus, autofocus, default check, positional or reversed-order rule, and no index-dependent style", () => {
      for (const path of BLOCK) {
        expect(code.get(path) ?? "", path).not.toMatch(
          /\bautoFocus\b|\bautofocus\b|\bdefaultChecked\b|\bdefaultValue\b|\.focus\(|\bref=|useRef|:first-child|:last-child|:nth-|:first-of-type|:last-of-type|:only-child|:not\(|:is\(|:where\(|(?<![\w-])order\s*:|-reverse|[+~]\s*\.decision|\bfilter\b|\bopacity\b/,
        );
      }
      const block = code.get("src/renderer/ui/chat/decision-block.tsx") ?? "";
      // One class for every option, written as a literal: nothing about the index changes it.
      expect(block.match(/className=/g)).toHaveLength(5);
      expect(offenders([BLOCK_COMPONENT], /className=\{/)).toEqual([]);
      // The only thing the index becomes is the key badge's letter, in `keyOf`.
      const component = block.slice(block.indexOf("export function DecisionBlock"));
      expect(component).not.toMatch(/index\s*(?:===?|[<>]=?|%)|\bindex\s*\?|\?\s*[^:\n]*\bindex\b/);
      expect(component.match(/\bindex\b/g)).toHaveLength(3);
    });

    it("leaves no residue: no state, memory or storage in the block or its parser", () => {
      for (const path of BLOCK.slice(0, 2)) {
        expect(code.get(path) ?? "", path).not.toMatch(
          /\buse(?:State|Reducer|Effect|LayoutEffect|Ref|Memo|Callback|SyncExternalStore)\b|localStorage|sessionStorage|indexedDB|\bcookie\b|window\.|new Map|new Set|\blet\s+(?!end\b|first\b|pending\b|above\b|at\b)\w+\s*=\s*(?:true|false|null)/,
        );
      }
      expect(code.get(BLOCK_COMPONENT) ?? "").toMatch(/import \{ useId \} from 'react'/);
      // The transcript keeps no answered decision either: the block is a function of the last entry.
      expect(code.get(TRANSCRIPT) ?? "").not.toMatch(/\buse(?:State|Reducer|Ref|Effect)\b|answered|chosen|dismiss/i);
    });
  });
});

describe("the skill row knows nothing about what it runs (Story 3.1)", () => {
  const ROW = "src/renderer/ui/chat/skill-row.tsx";
  const CONVERSATION = "src/renderer/ui/chat/use-conversation.ts";
  const row = code.get(ROW) ?? "";

  it("reads its own source", () => {
    expect(row).toContain("export function SkillRow");
  });

  it("draws each entry's code and description, and hands its one callback the code alone", () => {
    expect(row.match(/\bonRun\(/g)).toHaveLength(1);
    expect(row).toContain("onClick={() => onRun(item.code)}");
    expect(row).toContain("{item.code}");
    expect(row).toContain("{item.description}");
    // No bridge, no conversation and no main-side vocabulary in the row itself.
    expect(row).not.toMatch(/window\.harness|dispatchMenu|use-conversation|\baction\b|\bprompt\b|\bkind\b/);
  });

  it("has no tooltip, title, preview or popup of any kind", () => {
    expect(row).not.toMatch(/\stitle=|tooltip|popover|aria-describedby|aria-haspopup|onMouseEnter|onFocus|onPointerEnter/i);
  });

  it("is told only `code` and `description`: whether an entry is a skill or a prompt never crosses the bridge", () => {
    const install = code.get("src/shared/install.ts") ?? "";
    const view = install.slice(install.indexOf("export type MenuEntryView"));
    expect(view.slice(0, view.indexOf("\n"))).toBe(
      "export type MenuEntryView = { code: string; description: string }",
    );
    // Story 7.5: `'skill'` is also the kind of what a skill said in a skill-first session and the name of a first
    // message's outcome; these files say it for that and for nothing a menu's action says.
    const SKILL_FIRST_KIND = [
      "src/renderer/ui/app.tsx",
      "src/renderer/ui/chat/conversation-state.ts",
      "src/renderer/ui/chat/skill-session-state.ts",
      "src/renderer/ui/chat/transcript-entry.ts",
      "src/renderer/ui/chat/transcript.tsx",
      "src/renderer/ui/chat/use-conversation.ts",
      "src/renderer/ui/shell/shell.tsx",
    ];
    expect(
      offenders(
        RENDERER_CODE.filter((path) => !SKILL_FIRST_KIND.includes(path)),
        /\.action\b|['"]prompt['"]|['"]skill['"]|ResolvedMenuEntry/,
      ),
    ).toEqual([]);
    expect(offenders(SKILL_FIRST_KIND, /\.action\b|['"]prompt['"]|ResolvedMenuEntry/)).toEqual([]);
  });

  it("owns one piece of local state and adds one interactive element, the toggle, which is no tooltip and no list", () => {
    expect(row.match(/\buseState\(/g)).toHaveLength(1);
    expect(row.match(/<button\b/g)).toHaveLength(2);
    expect(row).toContain('type="button" className="skill-more" aria-expanded={expanded}');
    // The toggle hands nothing to `onRun` and reaches no store, bridge or announcer.
    expect(row).not.toMatch(/useEffect|useRef|announce|dispatch|\bsend\b|localStorage/);
  });

  it("names `+N more` and `fewer` in the row alone, and no transcript entry carries them", () => {
    expect(offenders(RENDERER_CODE.filter((path) => path.endsWith(".tsx") && !path.endsWith(".test.tsx")), /\bfewer\b|\+\$\{[^}]*\}\s*more/)).toEqual([
      "src/renderer/ui/chat/skill-row.tsx: fewer",
    ]);
    expect(row).toMatch(/`\+\$\{[^}]*\} more`/);
    // The conversation never writes a menu into the thread, expanded or not.
    expect(code.get("src/renderer/ui/chat/use-conversation.ts") ?? "").not.toMatch(/\bmenus?\b|SkillRow|skill-row/);
    expect(code.get("src/renderer/ui/chat/conversation-state.ts") ?? "").not.toMatch(/\bmenus?\b|\bfewer\b/);
    expect(code.get("src/renderer/ui/chat/transcript-entry.ts") ?? "").not.toMatch(/\bmenus?\b|\bfewer\b/);
  });

  it("is mounted once, under the current persona, and nowhere else", () => {
    expect(
      RENDERER_CODE.filter(
        (path) => /<SkillRow\b/.test(code.get(path) ?? "") && !path.endsWith(".test.tsx"),
      ),
    ).toEqual(["src/renderer/ui/app.tsx"]);
  });

  it("styles the toggle with no animation, no literal value and no focus rule of its own", () => {
    const css = code.get("src/renderer/ui/chat/skill-row.css") ?? "";
    const rule = css.slice(css.indexOf(".skill-more {"));
    // The toggle is drawn as a skill button, as the mockup's rendering of it is: the text ink, not the faint tier.
    expect(rule).toContain("var(--text)");
    expect(rule).not.toContain("var(--faint)");
    expect(rule).not.toMatch(/animation|transition|@keyframes|#[0-9a-f]{3,8}\b|\d+px|rgb\(|:focus/i);
    expect(css).not.toMatch(/:focus/);
  });

  it("dispatches through the one conversation call, which sends the session and the code and nothing else", () => {
    const conversation = code.get(CONVERSATION) ?? "";
    expect(conversation.match(/\bbridge\.dispatchMenu\(/g)).toHaveLength(1);
    expect(conversation).toContain("bridge.dispatchMenu(sessionId, code)");
    // The transcript records no user turn for it: nothing is entered or queued.
    const runSkill = conversation.slice(conversation.indexOf("runSkill(agentId, code) {"));
    const body = runSkill.slice(0, runSkill.indexOf("\n    },"));
    expect(body).not.toMatch(/sendMessage|withEntry|queue/);
  });
});

describe("the pinned running card is a place, not a control (Story 3.14)", () => {
  const SHELL = "src/renderer/ui/shell/shell.tsx";
  const SHELL_CSS = "src/renderer/ui/shell/shell.css";
  const APP = "src/renderer/ui/app.tsx";

  it("has no jump-to-card control, badge, toast or label in the slot's sources", () => {
    const shell = code.get(SHELL) ?? "";
    const slot = shell.slice(shell.indexOf('className="pinned"') - 80, shell.indexOf('className="pinned"') + 160);
    expect(slot).toContain("pinnedNode");
    expect(slot).not.toMatch(/<button|onClick|jump|badge|toast/i);
    const app = code.get(APP) ?? "";
    const pinned = app.slice(app.indexOf("pinned={"), app.indexOf("composer={"));
    expect(pinned).not.toMatch(/<button|onClick|jump|badge|toast/i);
    expect(code.get("src/renderer/ui/chat/transcript.tsx") ?? "").not.toMatch(/jump|badge|toast/i);
  });

  it("adds no scroll code, no animation and no stacking: the slot's rule and its token are plain layout", () => {
    const css = readFileSync(join(ROOT, SHELL_CSS), "utf8");
    const start = css.indexOf(".pinned {");
    const rule = css.slice(start, css.indexOf("}", start));
    expect(rule).not.toMatch(/z-index|position|animation|transition|scroll|overflow/);
    // The renderer's scroll code is the reveal hook's (Story 3.10), the follow hook's (Story 5.3) and the `/` list's
    // keeping of its current row in view (Story 7.3), and is no other.
    expect(offenders(RENDERER_CODE, /\.scroll(?:Top|To|By)\b|\bscrollIntoView\b|\.animate\(/)).toEqual([
      "src/renderer/ui/chat/use-reveal.ts: scrollIntoView",
      "src/renderer/ui/follow/use-follow.ts: .scrollTop",
      "src/renderer/ui/skills/skill-list.tsx: scrollIntoView",
    ]);
    expect(offenders(RENDERER_ALL.filter((path) => path.endsWith(".css")), /z-index/)).not.toContain(
      `${SHELL_CSS}: z-index`,
    );
  });

  it("leaves the card's own markup alone: it is drawn by `RunCard`, once, in the slot or in the thread", () => {
    const app = code.get(APP) ?? "";
    expect(app.match(/<RunCard\b/g)).toHaveLength(1);
    const transcript = code.get("src/renderer/ui/chat/transcript.tsx") ?? "";
    expect(transcript.match(/<RunCard\b/g)).toHaveLength(1);
  });
});

describe("progress against a plan has no denominator, bar, stagger or tick-through (Story 3.3)", () => {
  const CARD_SOURCES = [
    "src/renderer/ui/chat/run-card.tsx",
    "src/renderer/ui/chat/run-status.ts",
    "src/renderer/ui/chat/prose-store.ts",
    "src/shared/section-plan.ts",
  ];
  const CARD_CSS = "src/renderer/ui/chat/run-card.css";
  const CARET_CSS = "src/renderer/ui/chat/caret.css";

  it("reads the sources it claims to sweep", () => {
    for (const path of [...CARD_SOURCES, CARD_CSS, CARET_CSS]) {
      expect(code.get(path)?.length ?? 0, path).toBeGreaterThan(200);
    }
  });

  it("names no denominator: no `of M`, `/ M` or total in any word the head, foot or announcement is made of", () => {
    // Words are string and template literals and JSX text; `for … of` is code, not words.
    const WORDS = /(["'`])(?:(?!\1)[^\n\\]|\\.)*\1|>[^<>{}\n]+</g;
    const spoken = CARD_SOURCES.flatMap((path) =>
      [...(code.get(path) ?? "").matchAll(WORDS)].map(([text]) => `${path}: ${text}`),
    );
    expect(spoken.filter((text) => /\bof\b|\/\s*\$\{|\/\s*\d|\btotal\b|\bdenominator\b/i.test(text))).toEqual([]);
    expect(offenders(CARD_SOURCES, /\.length\s*\}?\s*(?:sections|\/)|\/\s*(?:plan|total)\b/)).toEqual([]);
  });

  it("draws no bar, meter or percentage for it", () => {
    expect(offenders(CARD_SOURCES, /<progress\b|<meter\b|role=["']progressbar|aria-valuenow|aria-valuemax|\bpercent|%\s*[`'"]/i)).toEqual([]);
    expect(offenders([CARD_CSS], /(?<![-\w])width\s*:\s*(?:calc|\d)|progress|meter|%/)).toEqual([]);
  });

  it("staggers, delays and ticks through nothing: no timer, frame or delay in the card's progress code", () => {
    expect(offenders(CARD_SOURCES, /\bsetTimeout\b|\bsetInterval\b|\bqueueMicrotask\b|\bstagger\b|\bdelay\b|\brequestAnimationFrame\b|\.animate\(/i)).toEqual([]);
    expect(offenders([CARD_CSS], /animation-delay|transition|stagger/)).toEqual([]);
  });

  it("styles the foot's list with no motion and no literal dimension", () => {
    const css = code.get(CARD_CSS) ?? "";
    const rules = [...css.matchAll(/\.run-card-foot[^{]*\{[^}]*\}/g)].map(([text]) => text).join("\n");
    expect(rules).toContain(".run-card-foot-count");
    expect(rules).not.toMatch(/animation|transition|@keyframes|#[0-9a-f]{3,8}\b|\d+px|rgba?\(/i);
  });

  it("adds no animation to the card beyond the caret's blink", () => {
    // The card's stylesheet animates nothing: its one moving part is the shared caret, which blinks and does nothing else.
    expect(code.get(CARD_CSS) ?? "").not.toMatch(/animation\s*:/);
    const caret = code.get(CARET_CSS) ?? "";
    expect(caret.match(/animation\s*:/g)).toHaveLength(1);
    expect(caret).toMatch(/\.caret\s*\{[^}]*animation\s*:\s*var\(--motion-blink\)/);
    expect(code.get(CARD_SOURCES[0]) ?? "").toContain("<Caret />");
  });
});

describe("the card is never empty, and says nothing in place of what has not happened (Story 3.4)", () => {
  const CARD = "src/renderer/ui/chat/run-card.tsx";
  const STATUS = "src/renderer/ui/chat/run-status.ts";
  const CARD_CSS = "src/renderer/ui/chat/run-card.css";

  it("reads the sources it claims to sweep", () => {
    for (const path of [CARD, STATUS, CARD_CSS]) {
      expect(code.get(path)?.length ?? 0, path).toBeGreaterThan(200);
    }
  });

  it("holds no waiting sentence, spinner, skeleton or bar in the words the card is made of", () => {
    const WORDS = /(["'`])(?:(?!\1)[^\n\\]|\\.)*\1|>[^<>{}\n]+</g;
    const spoken = [CARD, STATUS].flatMap((path) =>
      [...(code.get(path) ?? "").matchAll(WORDS)].map(([text]) => `${path}: ${text}`),
    );
    expect(
      spoken.filter((text) =>
        /\b(?:loading|waiting|awaiting|pending|thinking|preparing|processing|nothing written|opens when|not yet|spinner|skeleton|shimmer)\b|\.\.\.|…/i.test(text),
      ),
    ).toEqual([]);
    expect(offenders([CARD, STATUS], /<progress\b|<meter\b|role=["']progressbar|skeleton|spinner|shimmer/i)).toEqual([]);
    expect(offenders([CARD_CSS], /skeleton|spinner|shimmer|progress|meter/i)).toEqual([]);
  });

  it("puts nothing between the notes and the prose: the flow holds the feed and the prose and no other element", () => {
    const card = code.get(CARD) ?? "";
    const flow = card.slice(card.indexOf('<div className="run-card-flow">'), card.indexOf("</div>\n        </div>\n      </div>"));
    expect(flow).toContain("<RunList");
    expect(flow).toContain('<div className="run-card-prose"');
    expect(flow).not.toMatch(/<hr\b|<legend\b|<label\b|<h\d\b|role=["']separator|divider/);
    expect(offenders([CARD_CSS], /\.run-card-(?:flow|divider|separator|notes)[^{]*\{[^}]*(?:border|background)/)).toEqual([]);
  });

  it("keeps the two dead-air phrases in the foot and in no live region", () => {
    const card = code.get(CARD) ?? "";
    expect(card).toContain("0 words on disk");
    expect(card).toContain("autosave on");
    expect(offenders([CARD, STATUS], /aria-live|role=["'](?:status|alert)/)).toEqual([]);
  });
});

describe("the run list adds one pulse and nothing else: no bar, denominator, pending step, tab stop or announcement (Story 3.17)", () => {
  const LIST = "src/renderer/ui/chat/run-list.tsx";
  const LIST_CSS = "src/renderer/ui/chat/run-list.css";
  const STEP_ELAPSED = "src/renderer/ui/chat/format-step-elapsed.ts";

  it("reads the sources it claims to sweep", () => {
    for (const path of [LIST, LIST_CSS, STEP_ELAPSED]) {
      expect(code.get(path)?.length ?? 0, path).toBeGreaterThan(200);
    }
  });

  it("animates, transitions and reads a media query in none of its CSS: the only motion is the work dot's own pulse", () => {
    expect(offenders([LIST_CSS], /animation|transition|@keyframes|@media|skeleton|spinner|shimmer|progress|meter/i)).toEqual([]);
    expect(code.get(LIST) ?? "").toContain('<StatusDot state="work" />');
    expect(offenders([LIST], /matchMedia|setInterval|setTimeout|requestAnimationFrame|useNow/)).toEqual([]);
  });

  it("draws no bar, count, denominator, placeholder or pending row, and no sentence about earlier steps", () => {
    const WORDS = /(["'`])(?:(?!\1)[^\n\\]|\\.)*\1|>[^<>{}\n]+</g;
    const spoken = [LIST, STEP_ELAPSED].flatMap((path) => [...(code.get(path) ?? "").matchAll(WORDS)].map(([text]) => text));
    expect(spoken.filter((text) => /\bof\b|\btotal\b|\bpending\b|\bplanned\b|\bnext\b|\bearlier\b|\bmore\b|\.\.\.|…|%/i.test(text))).toEqual([]);
    expect(offenders([LIST], /<progress\b|<meter\b|role=["']progressbar|aria-valuenow|skeleton|spinner|shimmer/i)).toEqual([]);
  });

  it("gives a step row no tab stop, role, label or live region, and no handler", () => {
    expect(offenders([LIST], /tabIndex|role=|aria-|onClick|onKey|<button\b|<a\b|<input\b/)).toEqual([]);
  });
});

describe("the collapsed run card is one line, one expanding button and the stop beside it, and offers nothing it cannot do (Stories 3.5 and 3.7)", () => {
  const LINE = "src/renderer/ui/chat/run-card-line.tsx";
  const LINE_CSS = "src/renderer/ui/chat/run-card-line.css";
  const CARD = "src/renderer/ui/chat/run-card.tsx";
  const STATUS = "src/renderer/ui/chat/run-status.ts";
  const TRANSCRIPT = "src/renderer/ui/chat/transcript.tsx";
  const APP = "src/renderer/ui/app.tsx";
  const TOKENS = "src/renderer/design/tokens.css";
  const WORDS = /(["'`])(?:(?!\1)[^\n\\]|\\.)*\1|>[^<>{}\n]+</g;

  it("reads the sources it claims to sweep", () => {
    for (const path of [LINE, LINE_CSS, CARD, STATUS, TRANSCRIPT, APP]) {
      expect(code.get(path)?.length ?? 0, path).toBeGreaterThan(200);
    }
  });

  it("keeps the stop in run-stop.tsx: the transcript draws no button and says nothing of a stop but the prop it hands on", () => {
    const STOP = "src/renderer/ui/chat/run-stop.tsx";
    // The line's stylesheet, the transcript and the window hold no stop copy, no `run.stop` and no `stopRun`
    // of their own: the transcript only passes `onStop` on, and the window hands the conversation's one `stopRun` down.
    expect(offenders([TRANSCRIPT], /<button\b|\brun\.stop\b|\bstopRun\b/)).toEqual([]);
    const stopLines = (path: string): string[] =>
      (code.get(path) ?? "").split("\n").filter((line) => /stop/i.test(line)).map((line) => line.trim());
    // The line's stylesheet gives the control its right inset, and that is all it says of it.
    expect(stopLines(LINE_CSS).filter((line) => !/\.run-stop\b|--run-stop-inset/.test(line))).toEqual([]);
    expect(stopLines(TRANSCRIPT).filter((line) => !/\bonStop\b/.test(line))).toEqual([]);
    expect(stopLines(TRANSCRIPT)).toHaveLength(4);
    expect(offenders([APP], /\brun\.stop\b/)).toEqual([]);
    // The room's own stop (Story 4.5) is a different control, handed to the party view and not to the run card.
    expect(
      stopLines(APP).filter(
        (line) =>
          !line.includes("onStop={conversation.stopRun}") &&
          !line.includes("onStop={() => void conversation.stopRoom()}") &&
          // The chat header's own Stop (Story 3.19): it stops the turn of a session, which the card's does not.
          !line.includes("onStopTurn={(agentId) => void conversation.stopTurn(agentId)}") &&
          // And a skill-first session's own (Story 7.5): the same control, for that session's turn.
          !line.includes("onStopSkill={(sessionId) => void conversation.stopSkill(sessionId)}"),
      ),
    ).toEqual([]);
    expect(stopLines(APP).length).toBeGreaterThanOrEqual(2);
    // The one place the control is drawn is `run-stop.tsx`, as one native button; main names the declared
    // command once, to type the handler's reply, and answers it on its channel.
    expect((code.get(STOP) ?? "").match(/<button\b/g)).toHaveLength(1);
    expect(offenders(sources("src/main/", [".ts"]), /["']run\.stop["']/)).toEqual(["src/main/session-bridge.ts: 'run.stop'"]);
  });

  it("is one expanding button and one stop beside it: a click, `Enter` and `Space` expand it, and nothing else does", () => {
    const line = code.get(LINE) ?? "";
    // One native button, and the stop is a component of its own after it: a button inside a button is invalid.
    expect(line.match(/<button\b/g)).toHaveLength(1);
    expect(line.match(/<RunStop\b/g)).toHaveLength(1);
    expect(line.indexOf("<RunStop")).toBeGreaterThan(line.indexOf("</button>"));
    expect(line.match(/\bon[A-Z]\w*=/g)).toEqual(["onClick=", "onStop="]);
    expect(line).toContain('type="button"');
    expect(line).toContain("aria-expanded={false}");
    expect(line).not.toMatch(/role=|tabIndex|onKey|\.key\b|\.focus\(|autoFocus|aria-live/);
    // The window draws one line per collapsed card, in `Turns` alone, and draws it nowhere else.
    expect((code.get(TRANSCRIPT) ?? "").match(/<RunCardLine\b/g)).toHaveLength(1);
    expect(offenders(RENDERER_CODE.filter((path) => path !== TRANSCRIPT && path !== LINE), /<RunCardLine\b/)).toEqual([]);
  });

  it("is never a spinner: no bar, meter, percentage, denominator, tooltip or motion on the line", () => {
    expect(offenders([LINE], /<progress\b|<meter\b|role=["']progressbar|aria-valuenow|spinner|skeleton|shimmer|(?<![\w-])title\s*=|tooltip|\bpopover\b/i)).toEqual([]);
    expect(offenders([LINE_CSS], /animation|transition|@keyframes|progress|meter|spinner|skeleton|%/i)).toEqual([]);
    // An import's path is not words the line speaks; the stop control's own word is `run-stop.tsx`'s alone.
    const spoken = [LINE, STATUS].flatMap((path) =>
      [...(code.get(path) ?? "").replace(/^import .*$/gm, "").matchAll(WORDS)].map(([text]) => `${path}: ${text}`),
    );
    expect(spoken.filter((text) => /\bof\b|\/\s*\$\{|\/\s*\d|\btotal\b|\bdenominator\b|\bstop\b/i.test(text))).toEqual([]);
    expect(offenders([LINE], /\bsetTimeout\b|\bsetInterval\b|\brequestAnimationFrame\b|\.animate\(|\.scroll(?:Top|To|By)\b|\bscrollIntoView\b/)).toEqual([]);
  });

  it("makes its reason from a note or a section the text has shown, and stands nothing in for either", () => {
    const status = code.get(STATUS) ?? "";
    const reason = status.slice(status.indexOf("export function collapsedReason"), status.indexOf("export function isCollapsed"));
    expect(reason).toContain("noteOf(last.text, last.at).reason");
    // The section is spelled by the one shared definition, so the line and the head cannot disagree.
    expect(reason).toContain("reachedLabel(progress.section)");
    // No third source: a string literal is the empty string and the section's own words, and no sentence.
    expect([...reason.matchAll(WORDS)].map(([text]) => text).filter((text) => /[A-Za-z]{3}/.test(text.replace(/\$\{[^}]*\}/g, "")))).toEqual([]);
  });

  it("spends only tokens: no literal colour, dimension, radius or font stack, and the card's own padding token", () => {
    expect(literalsIn(LINE_CSS, readFileSync(join(ROOT, LINE_CSS), "utf8"))).toEqual([]);
    // The padding is the button's, so the whole visible line is its target; the section keeps the ground, border and flex.
    const rule = (selector: string): string => {
      const css = code.get(LINE_CSS) ?? "";
      const start = css.indexOf(`${selector} {`);
      return css.slice(start, css.indexOf("}", start));
    };
    expect(rule(".run-card-line-button")).toContain("padding: var(--card-line-padding)");
    expect(rule(".run-card-line")).not.toMatch(/padding/);
    expect(rule(".run-card-line")).toContain("display: flex");
    // The name gives way as the reason does: one line, an ellipsis, and no `flex: none`.
    expect(rule(".run-card-line-name")).toMatch(/flex:\s*0 1 auto/);
    expect(rule(".run-card-line-name")).toMatch(/min-width:\s*0/);
    expect(rule(".run-card-line-name")).toMatch(/text-overflow:\s*ellipsis/);
    expect(readFileSync(join(ROOT, TOKENS), "utf8")).toMatch(/--card-line-padding:7px 11px;/);
  });

  it("truncates the reason to one line in CSS, and nowhere in script: no ellipsis character or slice in the words", () => {
    const css = code.get(LINE_CSS) ?? "";
    const rule = css.slice(css.indexOf(".run-card-line-reason"));
    expect(rule).toMatch(/overflow:\s*hidden/);
    expect(rule).toMatch(/text-overflow:\s*ellipsis/);
    expect(rule).toMatch(/white-space:\s*nowrap/);
    const status = code.get(STATUS) ?? "";
    const reason = status.slice(status.indexOf("export function collapsedReason"), status.indexOf("export function isCollapsed"));
    expect(offenders([LINE], /\.slice\(|\.substring\(|\.substr\(|…|\.\.\./)).toEqual([]);
    expect(reason).not.toMatch(/\.slice\(|\.substring\(|\.substr\(|…|\.\.\./);
  });

  it("moves focus in one place only: the card's expansion effect, never a control inside it", () => {
    const card = code.get(CARD) ?? "";
    expect(card.match(/\.focus\(/g)).toHaveLength(1);
    expect(card).toContain("container.current?.focus()");
    expect(card).toContain("const container = useRef<HTMLElement>(null)");
    expect(card).toContain("ref={container}");
    for (const path of [LINE, TRANSCRIPT, APP, STATUS]) {
      expect(code.get(path) ?? "", path).not.toMatch(/\.focus\(|autoFocus/);
    }
  });
});

describe("the rail's annotation says who is writing and where, with no total, bar, tooltip or invented state (Story 3.6)", () => {
  const PROGRESS = "src/shared/section-progress.ts";
  const FOLD = "src/main/fold/rail-annotations.ts";
  const ANNOTATOR = "src/main/projections/rail-annotator.ts";
  const HOLDER = "src/main/rail-annotations.ts";
  const OUTPUTS = "src/renderer/ui/outputs/outputs.tsx";
  const ROW = "src/renderer/ui/outputs/output-row.tsx";
  const OUTPUTS_STYLES = "src/renderer/ui/outputs/outputs.css";
  const PROSE_STORE = "src/renderer/ui/chat/prose-store.ts";
  const STATUS = "src/renderer/ui/chat/run-status.ts";
  const WORDS = /(["'`])(?:(?!\1)[^\n\\]|\\.)*\1|>[^<>{}\n]+</g;
  const WORDS_OF = [PROGRESS, FOLD, ANNOTATOR, HOLDER, OUTPUTS, ROW];

  it("reads the sources it claims to sweep", () => {
    for (const path of [...WORDS_OF, OUTPUTS_STYLES, PROSE_STORE, STATUS]) {
      expect(code.get(path)?.length ?? 0, path).toBeGreaterThan(200);
    }
  });

  it("names no denominator in any word it is made of: no `of M`, `/ M`, total or count", () => {
    const spoken = WORDS_OF.flatMap((path) =>
      [...(code.get(path) ?? "").matchAll(WORDS)].map(([text]) => `${path}: ${text}`),
    );

    expect(spoken.length).toBeGreaterThan(0);
    expect(spoken.filter((text) => /\bof\b|\/\s*\$\{|\/\s*\d|\btotal\b|\bdenominator\b|\bcount\b/i.test(text))).toEqual([]);
    expect(offenders([PROGRESS, FOLD], /\.length\s*\}?\s*(?:sections|\/)|\/\s*(?:plan|total|seen)\b|\bseen\.length\b/)).toEqual([]);
  });

  it("says `writing`, `revising` and `§` in one place, which the card's head and the rail both call", () => {
    expect(offenders(ALL_CODE, /["'`](?:writing|revising)\b/).map((hit) => hit.split(":")[0])).toEqual([PROGRESS]);
    expect(offenders(ALL_CODE, /§/).map((hit) => hit.split(":")[0]).filter((path) => path !== PROGRESS && path !== "src/renderer/ui/chat/run-status.ts")).toEqual([]);
    expect(code.get(FOLD)).toMatch(/\bprogressLabel\(/);
    expect(code.get(STATUS)).toMatch(/\bprogressLabel\(/);
    // The section is read in one function, called by the card's prose store and by the rail's fold, and by nothing else.
    expect(
      offenders(ALL_CODE, /\bsectionProgress\(/)
        .map((hit) => hit.split(":")[0])
        .sort(),
    ).toEqual([FOLD, PROSE_STORE, PROGRESS].sort());
  });

  it("makes a rail annotation of nothing but the stream's words, the one terminal word and the one word for two writers: no notification, denominator or stand-in", () => {
    // Story 3.8 put `stopped` on the row, and it is the whole of the terminal vocabulary; Story 3.9 added `contention`,
    // which the block below holds to one spelling. Notifications are 3.10, and a conflict is never a word the rail uses.
    expect(offenders([FOLD, ANNOTATOR, HOLDER, PROGRESS], /contend|Notification|\bconflict\b|\bboth owners\b/i)).toEqual([]);
    // The terminal word is spelled where `writing` and `revising` are, and nowhere else the rail can reach:
    // every word any of these four files is made of is swept, so a template or a concatenation is caught too.
    const said = [FOLD, ANNOTATOR, HOLDER, PROGRESS].flatMap((path) =>
      [...(code.get(path) ?? "").matchAll(WORDS)]
        .map(([text]) => `${path}: ${text}`)
        // `run:stopped` is the contract event's name, not the word on the row.
        .filter((hit) => /\bstopped\b/i.test(hit) && !/(["'`])run:stopped\1/.test(hit)),
    );
    expect(said).toEqual([`${PROGRESS}: 'stopped'`]);
    expect(code.get(FOLD)).toMatch(/\bSTOPPED\b/);
    expect(offenders([FOLD, ANNOTATOR, HOLDER], /\bsetTimeout\b|\bsetInterval\b|\bDate\.now\b|new Date\b|performance\.now/)).toEqual([]);
  });

  it("draws the tag with no bar, spinner, badge, tooltip, title or motion, and a width from a token", () => {
    expect(offenders([OUTPUTS, ROW], /<progress\b|<meter\b|role=["']progressbar|aria-valuenow|(?<![\w-])title\s*=|tooltip|\bpopover\b|\bspinner\b|\bbadge\b|\.animate\(/i)).toEqual([]);
    const css = code.get(OUTPUTS_STYLES) ?? "";
    const rule = css.match(/\.output-row-annotation\s*\{[^}]*\}/)?.[0] ?? "";

    expect(rule).toContain("max-width: var(--rail-annotation-max)");
    expect(rule).not.toMatch(/animation|transition|%|progress|meter|spinner|width:\s*\d/i);
    // Nothing new moves in the rail: the rail's stylesheet has no animation at all.
    expect(css).not.toMatch(/animation|transition|@keyframes/);
  });

  it("is told to the window by the rail's own push and by no new event, command, channel or bridge method", () => {
    for (const path of ["src/shared/events.ts", "src/shared/commands.ts", "src/shared/channels.ts", "src/preload/index.ts"]) {
      expect(code.get(path) ?? "", path).not.toMatch(/annotat/i);
    }
    expect(offenders(MAIN_CODE, /ipcMain\.handle\(\s*["'`][^"'`]*annotat/i)).toEqual([]);
  });

  it("makes, removes and settles no row: nothing the stream folds reaches the rail's disk fields", () => {
    expect(offenders([FOLD, ANNOTATOR, HOLDER], /\bobserve\(|\bsettle\(|\bsavedAt\b|\bobservedAt\b|\bmtimeMs\b|artifact:(?:found|written|removed)/)).toEqual([]);
    // The persona fold, the rail's push rule and the row component read no annotation from the stream.
    expect(offenders(["src/main/fold/persona-state.ts", "src/main/fold/artifact-owner.ts"], /annotation/)).toEqual([]);
    expect(offenders([ROW], /annotation\??\.owner|agentId/)).toEqual([]);
  });
});

describe("two writers, one file: the rail reports it and nothing arbitrates (Story 3.9)", () => {
  const PROGRESS = "src/shared/section-progress.ts";
  const RAIL_CONTRACT = "src/shared/rail.ts";
  const FOLD = "src/main/fold/rail-annotations.ts";
  const ROWS = "src/main/fold/rail-rows.ts";
  const ANNOTATOR = "src/main/projections/rail-annotator.ts";
  const HOLDER = "src/main/rail-annotations.ts";
  const OUTPUTS = "src/renderer/ui/outputs/outputs.tsx";
  const ROW = "src/renderer/ui/outputs/output-row.tsx";
  const OWNER_LABEL = "src/renderer/ui/outputs/owner-label.ts";
  const COMMANDS = "src/shared/commands.ts";
  const EVENTS = "src/shared/events.ts";
  const CHANNELS = "src/shared/channels.ts";
  const PRELOAD = "src/preload/index.ts";
  const TRANSCRIPT_STORE = "src/main/sources/persistence/transcript-file.ts";
  const RECENT_STORE = "src/main/sources/persistence/recent-file.ts";
  const CHOOSER = "src/main/windows/choose-project.ts";
  const WORDS = /(["'`])(?:(?!\1)[^\n\\]|\\.)*\1|>[^<>{}\n]+</g;
  const CONTRACT = [COMMANDS, EVENTS, CHANNELS, PRELOAD];
  const SPOKEN = [PROGRESS, FOLD, ROWS, ANNOTATOR, HOLDER, OUTPUTS, ROW, OWNER_LABEL];

  it("reads the sources it claims to sweep", () => {
    for (const path of [...SPOKEN, ...CONTRACT, TRANSCRIPT_STORE, CHOOSER, RAIL_CONTRACT]) {
      expect(code.get(path)?.length ?? 0, path).toBeGreaterThan(100);
    }
  });

  it("spells the word once, beside the terminal word, and every other file takes it from there", () => {
    expect(offenders(ALL_CODE, /["'`]contention["'`]/).map((hit) => hit.split(":")[0])).toEqual([PROGRESS]);
    const progress = code.get(PROGRESS) ?? "";
    expect(progress).toMatch(/export const CONTENTION = 'contention'/);
    expect(progress.indexOf("export const STOPPED")).toBeGreaterThan(-1);
    expect(progress.indexOf("export const STOPPED")).toBeLessThan(progress.indexOf("export const CONTENTION"));
    // The fold names it by the constant; nothing else the rail reaches, in main or in the window, names it at all.
    expect([...new Set((code.get(FOLD) ?? "").match(/contention/gi))]).toEqual(["CONTENTION"]);
    expect(offenders([ROWS, ANNOTATOR, HOLDER, OUTPUTS, ROW, OWNER_LABEL], /contention/i)).toEqual([]);
  });

  it("carries the owners on the annotation beside the owner, and on no row field of its own", () => {
    const contract = code.get(RAIL_CONTRACT) ?? "";

    expect(contract.match(/\bowners\b/g)).toHaveLength(1);
    expect(contract).toContain("owners?: readonly RailOwner[]");
    expect(contract).toContain("owner?: RailOwner");
    // The row has the class's `owner` and the stream's `annotation`, and no field that merges them.
    expect(contract).toMatch(/owner\?: RailOwner\n\s*annotation\?: RailAnnotation/);
    expect(contract).not.toMatch(/\bstatus\b|\bcontended\b|\bwinner\b/);
  });

  it("says who is writing and never who wrote last: no word of recency, victory or loss in anything the rail says", () => {
    const spoken = SPOKEN.flatMap((path) =>
      [...(code.get(path) ?? "").matchAll(WORDS)].map(([text]) => `${path}: ${text}`),
    );

    expect(spoken.length).toBeGreaterThan(0);
    expect(
      spoken.filter((text) => /\b(?:last|latest|newest|newer|older|overwr\w*|winner|wins?|won|lost|loses?|losing|clobber\w*|stale|conflict\w*|race|raced)\b/i.test(text)),
    ).toEqual([]);
    // The fold reads no clock and holds no time: which run wrote last is not a thing it could know.
    expect(offenders([FOLD, OWNER_LABEL], /\bsetTimeout\b|\bsetInterval\b|\bDate\.now\b|new Date\b|performance\.now|\bmtimeMs\b|\bat\b\s*[<>]/)).toEqual([]);
  });

  it("names no section, count or denominator in the report", () => {
    const fold = code.get(FOLD) ?? "";
    const report = fold.slice(fold.indexOf("export function annotationsOf"));

    // The report is the one word and the owners: its own text is the constant, never a template.
    expect(report).toContain("text: CONTENTION");
    expect(report).not.toMatch(/`[^`]*\$\{[^}]*\}[^`]*`[^;\n]*CONTENTION|CONTENTION\s*\+|CONTENTION\s*,\s*\.\.\./);
    expect(offenders([OWNER_LABEL], /§|\bof\b|\btotal\b|\bcount\b/)).toEqual([]);
  });

  it("adds no command, event, channel or bridge method: the counts stay eight, seventeen, thirty-six and twenty-four", () => {
    const commands = [...(code.get(COMMANDS) ?? "").matchAll(/^\s+'([a-z]+\.[a-z]+)':\s*CommandSpec/gm)].map(([, name]) => name);
    const events = [...(code.get(EVENTS) ?? "").matchAll(/^\s+'([a-z]+:[a-z-]+)':\s*EventSpec/gm)].map(([, name]) => name);
    const channels = [...(code.get(CHANNELS) ?? "").matchAll(/^export const (\w+) = '/gm)].map(([, name]) => name);
    const preload = code.get(PRELOAD) ?? "";
    const methods = [...preload.slice(preload.indexOf("const harness: HarnessApi = {"), preload.indexOf("contextBridge.exposeInMainWorld")).matchAll(/^ {2}(\w+):/gm)].map(
      ([, name]) => name,
    );

    // Story 3.16 added `run:step` (sixteen events). Story 3.9 left the counts at seven, fifteen, twenty-one and sixteen; Story 3.10 added
    // the one channel and the one method a window hears a revealed run on, and no event.
    // Story 5.1 added the Welcome's four channels (twenty-six) and no method to the shell's;
    // Story 5.2 added the theme's three (twenty-nine) and none to the shell's; Story 5.4 added the
    // output folder's one channel (thirty) and the one method that asks for its chooser (eighteen);
    // Story 5.5 added the layout's three channels (thirty-three) and its three methods (twenty-one);
    // Story 3.19 added `turn.stop` (eight commands), its channel (thirty-four) and `stopTurn` (twenty-two).
    // Story 6.2 added `board:changed` (seventeen events), the Board's two channels (thirty-six) and its two methods (twenty-four).
    expect(commands).toHaveLength(8);
    expect(events).toHaveLength(17);
    expect(channels).toHaveLength(36);
    expect(methods).toHaveLength(24);
    // And none of them is named for it.
    expect(offenders(CONTRACT, /contend|contention|\bowners\b|arbitrat/i)).toEqual([]);
    expect(offenders(MAIN_CODE, /ipcMain\.handle\(\s*["'`][^"'`]*(?:contend|contention|owners|arbitrat)/i)).toEqual([]);
  });

  describe("offers nothing to resolve it", () => {
    /** The words a name is made of: split on anything that is not a letter and between a lower-case letter and a capital. */
    const wordsOf = (name: string): string[] =>
      name
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .split(/[^A-Za-z]+/)
        .filter((word) => word !== "")
        .map((word) => word.toLowerCase());
    const BANNED = new Set(["resolve", "resolved", "resolving", "resolution", "merge", "merged", "merging", "revert", "reverted", "lock", "locked", "unlock", "restore", "restored", "undo", "undone", "patch", "patched", "edit", "edited", "pipeline", "arbitrate", "arbitration"]);
    const stringsIn = (path: string): string[] => [...(code.get(path) ?? "").matchAll(/(["'`])([^"'`\n]*)\1/g)].map(([, , text]) => text);

    it("names no command, event, channel or bridge method for resolving, merging, reverting, locking, restoring, undoing, patching, editing or a pipeline", () => {
      const preload = code.get(PRELOAD) ?? "";
      const methods = [...preload.slice(preload.indexOf("const harness: HarnessApi = {")).matchAll(/^ {2}(\w+):/gm)].map(([, name]) => name);
      const handled = MAIN_CODE.flatMap((path) =>
        [...(code.get(path) ?? "").matchAll(/ipcMain\.handle\(\s*(["'`])([^"'`]+)\1/g)].map(([, , channel]) => channel),
      );
      const names = [...stringsIn(COMMANDS), ...stringsIn(EVENTS), ...stringsIn(CHANNELS), ...methods, ...handled];

      // The sweep sees the names it is meant to: the channel that opens a document in the user's own editor is `editor`, not `edit`.
      expect(names).toContain("doc:open-in-editor");
      expect(methods).toContain("stopRun");
      expect(names.length).toBeGreaterThan(60);
      expect(names.filter((name) => wordsOf(name).some((word) => BANNED.has(word)))).toEqual([]);
    });

    it("draws no dialog, confirm or alert in the window, and no Electron dialog in main outside the folder chooser", () => {
      expect(
        offenders(
          RENDERER_CODE,
          /\bwindow\.(?:confirm|alert|prompt)\b|(?<![\w.])(?:confirm|alert|prompt)\(|<dialog\b|role=["'](?:dialog|alertdialog)|aria-modal|\.showModal\(|\bshowMessageBox\b|\bshowErrorBox\b|\bshowOpenDialog\b|\bshowSaveDialog\b/,
        ),
      ).toEqual([]);
      expect(offenders(MAIN_CODE.filter((path) => path !== CHOOSER), /\bdialog\b|\bshowMessageBox|\bshowErrorBox|\bshowOpenDialog|\bshowSaveDialog/)).toEqual([]);
      // The one dialog main has chooses a folder to open, and says nothing about a file.
      const chooser = code.get(CHOOSER) ?? "";
      // Story 5.4's output folder chooser is its sibling, a sheet on the project's window or a plain dialog, and the same call.
      expect(chooser.match(/\bdialog\./g)).toHaveLength(3);
      expect(chooser.match(/dialog\.(\w+)/g)?.every((call) => call === "dialog.showOpenDialog")).toBe(true);
      expect(chooser).toContain("dialog.showOpenDialog");
      expect(chooser).not.toMatch(/showMessageBox|showErrorBox|showSaveDialog/);
    });

    it("has no control for it in the rail: the rows and the owner label hold no button of their own, no handler beyond the one that opens the file", () => {
      expect((code.get(ROW) ?? "").match(/<button\b/g)).toHaveLength(1);
      expect((code.get(ROW) ?? "").match(/\bon[A-Z]\w*=/g)?.sort()).toEqual(["onClick=", "onKeyDown="]);
      // The label is a function of a row and a roster, not a component: a `.ts` file, with no markup, state, effect or bridge.
      expect(OWNER_LABEL.endsWith(".ts")).toBe(true);
      expect(offenders([OWNER_LABEL], /from ["']react|\bon[A-Z]\w*=|\buseState\b|\buseEffect\b|ipcRenderer|\bwindow\b/)).toEqual([]);
      expect(offenders(RENDERER_CODE.filter((path) => path.startsWith("src/renderer/ui/outputs/")), /\b(?:resolve|merge|revert|restore|undo|patch|arbitrate)\w*\(|\block\w*\(/i)).toEqual([]);
    });
  });

  it("writes nothing to the project: no write-capable filesystem call in main outside the harness's own transcript, which refuses the project", () => {
    const THEME_STORE = "src/main/sources/persistence/theme-file.ts";
    const FOLDER_STORE = "src/main/sources/persistence/output-folder-file.ts";
    const LAYOUT_STORE = "src/main/sources/persistence/layout-file.ts";
    const others = MAIN_CODE.filter((path) => path !== TRANSCRIPT_STORE && path !== RECENT_STORE && path !== THEME_STORE && path !== FOLDER_STORE && path !== LAYOUT_STORE);
    const WRITES = /^(?:write|append|mkdir|mkdtemp|rename|unlink|rm|rmdir|copy|cp|truncate|ftruncate|symlink|link|chmod|chown|utimes|lutimes|createWriteStream)/;

    // What main takes from the filesystem is read-only: every name imported from `node:fs` outside the store.
    const imported = others.flatMap((path) =>
      [...(code.get(path) ?? "").matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']node:fs(?:\/promises)?["']/g)].flatMap(([, names]) =>
        names.split(",").map((name) => name.trim().split(/\s+as\s+/)[0]).filter((name) => name !== ""),
      ),
    );
    expect(imported.length).toBeGreaterThan(5);
    expect(imported.filter((name) => WRITES.test(name))).toEqual([]);
    expect(offenders(others, /import\s+(?:\*\s+as\s+\w+|\w+)\s+from\s*["']node:fs|\brequire\(\s*["'](?:node:)?fs/)).toEqual([]);
    expect(
      offenders(
        others,
        /\b(?:writeFile|appendFile|mkdir|mkdtemp|rename|unlink|rm|rmdir|copyFile|cp|truncate|ftruncate|symlink|link|chmod|chown|utimes|lutimes)(?:Sync)?\s*\(|\bcreateWriteStream\b|\bopen(?:Sync)?\([^)]*,\s*["'`](?:[wa]x?\+?|r\+)["'`]/,
      ),
    ).toEqual([]);
    // What the store writes is its own file, and never inside the project the window was opened for.
    const store = code.get(TRANSCRIPT_STORE) ?? "";
    expect(store).toMatch(/isInsideProject\(projectPath, filePath\)/);
    expect(store).toContain("inside-project");
    // The recent list (Story 5.1) is the only other, and it is given a path under `userData` and no project at all.
    const recent = code.get(RECENT_STORE) ?? "";
    expect(recent).toMatch(/export function recentFilePath\(userDataDir: string\)/);
    expect(recent).not.toMatch(/projectPath|projectRoot/);
    // So is the theme choice (Story 5.2): one word, given a path under `userData` and no project at all.
    const theme = code.get(THEME_STORE) ?? "";
    expect(theme).toMatch(/export function themeFilePath\(userDataDir: string\)/);
    expect(theme).not.toMatch(/projectPath|projectRoot/);
    // So is the output folder choice (Story 5.4): a path per project under `userData`, keyed by a name the store is
    // handed and never a project it could write into.
    const folders = code.get(FOLDER_STORE) ?? "";
    expect(folders).toMatch(/export function outputFoldersFilePath\(userDataDir: string\)/);
    expect(folders).not.toMatch(/projectPath|projectRoot/);
    expect(offenders(MAIN_CODE, /outputFoldersFilePath\(/).map((hit) => hit.split(":")[0]).sort()).toEqual([
      "src/main/output-folder-bridge.ts",
      "src/main/sources/persistence/output-folder-file.ts",
    ]);
    expect(code.get("src/main/output-folder-bridge.ts")).toMatch(/outputFoldersFilePath\(deps\.userDataPath\(\)\)/);
    // So is the layout (Story 5.5): two widths per user and each project's folded directories under `userData`, keyed
    // by a name the bridge hands it and never a project it could write into.
    const layout = code.get(LAYOUT_STORE) ?? "";
    expect(layout).toMatch(/export function layoutFilePath\(userDataDir: string\)/);
    expect(layout).not.toMatch(/projectPath|projectRoot/);
    expect(offenders(MAIN_CODE, /layoutFilePath\(/).map((hit) => hit.split(":")[0]).sort()).toEqual([
      "src/main/layout-bridge.ts",
      "src/main/sources/persistence/layout-file.ts",
    ]);
    expect(code.get("src/main/layout-bridge.ts")).toMatch(/layoutFilePath\(deps\.userDataPath\(\)\)/);
    // The layout's own fold names its key `projectKey` and no path of a project's.
    expect(code.get("src/main/fold/layout.ts") ?? "").not.toMatch(/projectPath|projectRoot/);
    expect(offenders(MAIN_CODE, /themeFilePath\(/).map((hit) => hit.split(":")[0]).sort()).toEqual([
      "src/main/sources/persistence/theme-file.ts",
      "src/main/theme-bridge.ts",
    ]);
    expect(offenders(MAIN_CODE, /recentFilePath\(/).map((hit) => hit.split(":")[0]).sort()).toEqual([
      "src/main/sources/persistence/recent-file.ts",
      "src/main/welcome-bridge.ts",
    ]);
    expect(code.get("src/main/welcome-bridge.ts")).toMatch(/recentFilePath\(userDataPath\(\)\)/);
    // Contention is a report: nothing in the fold, the row table or the annotator reaches a file or a process.
    expect(offenders([FOLD, ROWS, ANNOTATOR, HOLDER, OWNER_LABEL], /node:fs|node:child_process|\bspawn\b|\bkill\b|\binterrupt\b|\bwriteTurn\b|\.write\(/)).toEqual([]);
  });
});

describe("told once, quietly, when you are elsewhere: one silent banner, one scroll, and nothing else (Story 3.10)", () => {
  const NOTIFIER = "src/main/windows/run-notification.ts";
  const REVEAL = "src/renderer/ui/chat/use-reveal.ts";
  const COMMANDS = "src/shared/commands.ts";
  const EVENTS = "src/shared/events.ts";
  const CHANNELS = "src/shared/channels.ts";
  const PRELOAD = "src/preload/index.ts";
  const notifier = (): string => code.get(NOTIFIER) ?? "";
  const reveal = (): string => code.get(REVEAL) ?? "";
  /** The string and template literals of a file's code. */
  const literalsOf = (text: string): string[] => [...text.matchAll(/(["'`])((?:(?!\1)[^\n\\]|\\.)*)\1/g)].map(([, , body]) => body);

  it("reads the sources it claims to sweep", () => {
    expect(notifier().length).toBeGreaterThan(500);
    expect(reveal().length).toBeGreaterThan(200);
  });

  it("names the banner API in the notifier alone, constructs it silent, and gives it no sound, reply, action, urgency, timeout or icon", () => {
    expect(offenders(ALL_CODE, /\bNotification\b/).map((hit) => hit.split(":")[0])).toEqual([NOTIFIER]);
    expect(notifier()).toMatch(/silent:\s*true/);
    expect(notifier()).toMatch(/new Notification\(/);
    expect(notifier()).toMatch(/Notification\.isSupported\(\)/);
    expect(notifier()).not.toMatch(/\bsound\b|\bhasReply\b|\bactions\b|\burgency\b|\btimeoutType\b|\bicon\b|\btitle\b|\bsubtitle\b|\breplyPlaceholder\b|\bcloseButtonText\b|\btoastXml\b/);
    // Shown once, by the one call, and the OS's refusal is one line to the developer and nothing else.
    expect(notifier().match(/posted\.show\(\)/g)).toHaveLength(1);
    expect(notifier().match(/\.show\(\)/g)).toEqual([".show()", ".show()"]);
    expect(notifier()).toContain("run/completion · ");
  });

  it("asks no permission anywhere in src: macOS asks once on its own and the harness never asks again", () => {
    expect(offenders(ALL_CODE, /\brequestPermission\b|\bsystemPreferences\b|\baskFor\w*/)).toEqual([]);
  });

  it("holds no timer, queue, debounce, digest or batch, touches no `app.` and sets no badge: nothing is held across a quit", () => {
    expect(
      offenders(
        [NOTIFIER],
        /\bapp\.|\bsetTimeout\b|\bsetInterval\b|\bqueueMicrotask\b|\bqueue\w*\b|\bdebounce\w*\b|\bdigest\w*\b|\bbatch\w*\b|\bcoalesce\w*\b|\bsetBadge\w*\b|\bdock\b|\bflashFrame\b|\brequestUserAttention\b/i,
      ),
    ).toEqual([]);
    // Nothing of a run is kept between events: no map held at module or notifier scope, and the one
    // `Set` is the three event names.
    expect(notifier()).not.toMatch(/\bnew (?:Map|WeakMap|WeakSet)\b|\bpending\b|\bheld\b/);
    expect(notifier().match(/\bnew Set\b/g)).toHaveLength(1);
    expect(notifier()).toMatch(/new Set\(\['run:finished', 'run:stopped', 'run:failed'\]\)/);
  });

  it("names exactly the three terminal events, and no other event, command or channel but the one it pushes", () => {
    // Import specifiers (`node:path`) are read apart from the code.
    const body = notifier().replace(/^import\b[^\n]*$/gm, "");
    const names = literalsOf(body).filter((text) => /^[a-z]+:[a-z-]+$/.test(text));
    expect(names.sort()).toEqual(["run:failed", "run:finished", "run:stopped"]);
    // The push rides the channel constant, never a literal of its own.
    expect(notifier()).toContain("RUN_REVEALED_CHANNEL");
    expect(notifier()).not.toMatch(/ipcMain|ipcRenderer|contextBridge|\.handle\(/);
  });

  it("states and never guides: the notifier's literals are the three event names, the separator, the diagnostic prefix and the API's own event word", () => {
    // Import specifiers, the window type's picked keys and the event type's indexed key are read apart
    // from the code: none is a word anyone sees.
    const body = notifier()
      .replace(/^import\b[^\n]*$/gm, "")
      .replace(/^export type RunWindow = Pick<[^\n]*$/gm, "")
      .replace(/ContractEvent\['name'\]/g, "ContractEventName")
      .replace(/RunKit\['told'\]/g, "RunKitTold");
    // The words themselves, with a template's interpolations taken out.
    const literals = literalsOf(body).map((text) => text.replace(/\$\{[^}]*\}/g, ""));
    // `running` is the one status word it names, twice: the type that leaves it out of a line, and the check that does.
    expect([...literals].sort()).toEqual([" · ", "click", "click", "run/completion · ", "run:failed", "run:finished", "run:stopped", "running", "running"].sort());
    // `click` is Electron's name for the event the banner raises when activated, the one word of the
    // API's that is not copy: it is spelled where the posted line's type declares it and where it is heard.
    expect(notifier()).toMatch(/on\(event: 'click', listener: \(\) => void\): unknown/);
    expect(notifier()).toMatch(/posted\.on\('click', \(\) => \{/);
    const copy = literals.filter((text) => text !== "click");
    expect(copy.filter((text) => /\b(?:ready|review|next|open|click|see|check|please|should|your|done|complete|finish(?:ed)? up|congrat\w*|great|nice)\b/i.test(text))).toEqual([]);
    expect(copy.filter((text) => /[.!?]$/.test(text))).toEqual([]);
    expect(copy.filter((text) => /[A-Z]/.test(text))).toEqual([]);
    // The count is the shared spelling, not a second one here.
    expect(notifier()).toMatch(/import \{ sectionCount \} from '\.\.\/\.\.\/shared\/section-progress'/);
    expect(notifier()).not.toMatch(/["'`]sections?["'`]/);
  });

  it("reads the window's own focus at the moment it is told, and raises it on activation by restore, show and focus alone", () => {
    expect(notifier()).toMatch(/BrowserWindow\.fromWebContents\(/);
    expect(notifier()).toMatch(/\.isFocused\(\)/);
    expect(notifier()).toMatch(/isMinimized\(\)\) window\.restore\(\)/);
    expect(notifier()).toMatch(/window\.show\(\)\s*\n\s*window\.focus\(\)/);
    expect(notifier()).not.toMatch(/\bsetAlwaysOnTop\b|\bmoveTop\b|\bopenDocWindow\b|\bcreateProjectWindow\b|\bnew BrowserWindow\b|\bloadURL\b|\bloadFile\b/);
  });

  it("scrolls in the reveal hook, the follow hook and the `/` list's current row alone, instantly, and moves no focus, opens nothing and sends no command there", () => {
    expect(offenders(RENDERER_CODE, /\bscrollIntoView\b|\.scroll(?:Top|To|By)\b/).map((hit) => hit.split(":")[0])).toEqual([REVEAL, "src/renderer/ui/follow/use-follow.ts", "src/renderer/ui/skills/skill-list.tsx"]);
    expect(reveal()).toMatch(/scrollIntoView\(\{ block: 'start' \}\)/);
    expect(reveal()).not.toMatch(/smooth|behavior|\.focus\(|\bfocus\(|setCurrentId|openDoc|dispatchMenu|sendTurn|openSession|stopRun|closeSession|ipcRenderer/);
    // The target is the card's own ref: no attribute, no query.
    expect(reveal()).not.toMatch(/querySelector|getElementById|data-|dataset|setAttribute|\bdocument\./);
    // The hook is the card's: it is mounted in `RunCard` and nowhere else.
    expect(RENDERER_CODE.filter((path) => /\buseReveal\(/.test(code.get(path) ?? "") && path !== REVEAL)).toEqual(["src/renderer/ui/chat/run-card.tsx"]);
    // The window spends the request as it spends a focus request, by run id, and turns to the persona of a persona's run (Story 8.4) and touches the composer on no path of it.
    const app = code.get("src/renderer/ui/app.tsx") ?? "";
    const revealing = app.slice(app.indexOf("const [revealRunId"), app.indexOf("const revealed = useCallback"));
    expect(revealing).toContain("connectRunRevealed(window.harness");
    expect(revealing).toContain("setCurrentId(");
    expect(revealing).toContain("setChat('persona')");
    expect(revealing).toContain("setShowView(");
    expect(revealing).not.toMatch(/setComposerFocus|openDoc|activate\(|send\(|runSkill|stopRun|close\(/);
  });

  it("gives the preload and the shared contract no word of it, and no new command or event: eight, seventeen, thirty-six channels, twenty-four methods", () => {
    expect(
      offenders(
        [...sources("src/preload/"), ...sources("src/shared/")],
        /\b(?:sound|audio|badge|dock|bounce|progress|attention|notif\w*|chime|ding|alert|banner|toast)\b/i,
      ),
    ).toEqual([]);
    const commands = [...(code.get(COMMANDS) ?? "").matchAll(/^\s+'([a-z]+\.[a-z]+)':\s*CommandSpec/gm)].map(([, name]) => name);
    const events = [...(code.get(EVENTS) ?? "").matchAll(/^\s+'([a-z]+:[a-z-]+)':\s*EventSpec/gm)].map(([, name]) => name);
    const channels = [...(code.get(CHANNELS) ?? "").matchAll(/^export const (\w+) = '/gm)].map(([, name]) => name);
    const preload = code.get(PRELOAD) ?? "";
    const methods = [...preload.slice(preload.indexOf("const harness: HarnessApi = {"), preload.indexOf("contextBridge.exposeInMainWorld")).matchAll(/^ {2}(\w+):/gm)].map(
      ([, name]) => name,
    );
    expect(commands).toHaveLength(8);
    expect(events).toHaveLength(17);
    expect(channels).toHaveLength(36);
    expect(channels).toContain("RUN_REVEALED_CHANNEL");
    expect(methods).toHaveLength(24);
    expect(methods).toContain("onRunRevealed");
    // The channel is a push to a window and nothing answers on it: no handler, no invoke.
    expect(offenders(MAIN_CODE, /ipcMain\.handle\(\s*RUN_REVEALED_CHANNEL/)).toEqual([]);
    expect(preload).not.toMatch(/invoke\(RUN_REVEALED_CHANNEL/);
  });

  it("changes nothing of the card's markup, the rail, the fold, the projections or the live region", () => {
    for (const path of [
      "src/main/fold/run-card.ts",
      "src/main/projections/runs.ts",
      "src/main/fold/rail-annotations.ts",
      "src/main/projections/rail-annotator.ts",
      "src/renderer/ui/a11y/live-region.tsx",
      "src/renderer/ui/chat/run-card-line.tsx",
      "src/renderer/ui/outputs/outputs.tsx",
    ]) {
      expect(code.get(path) ?? "", path).not.toMatch(/reveal|RUN_REVEALED|scrollIntoView|RunNotifier|completionLine|run-notification/i);
    }
    // The card gained two props and one hook call, and no element, class or attribute.
    const card = code.get("src/renderer/ui/chat/run-card.tsx") ?? "";
    expect(card.match(/useReveal\(/g)).toHaveLength(1);
    expect(card).not.toMatch(/className="[^"]*reveal|\breveal\w*=["{]|aria-\w*reveal|data-reveal/i);
  });
});

describe("nothing this epic promised not to do: the audit's static half (Story 3.11, UX-DR35, UX-DR38)", () => {
  const CARD = "src/renderer/ui/chat/run-card.tsx";
  const LINE = "src/renderer/ui/chat/run-card-line.tsx";
  const STATUS = "src/renderer/ui/chat/run-status.ts";
  const STOP = "src/renderer/ui/chat/run-stop.tsx";
  const USE_NOW = "src/renderer/ui/outputs/use-now.ts";
  const DOT = "src/renderer/ui/status/status-dot.tsx";
  const ROW = "src/renderer/ui/outputs/output-row.tsx";
  const PROGRESS = "src/shared/section-progress.ts";
  const FOLD = "src/main/fold/rail-annotations.ts";
  const ANNOTATOR = "src/main/projections/rail-annotator.ts";
  const LIVE = "src/renderer/ui/a11y/live-region.tsx";
  const ANNOUNCER = "src/renderer/ui/a11y/announcer.ts";
  const CONVERSATION = "src/renderer/ui/chat/use-conversation.ts";
  const CARD_CSS = "src/renderer/ui/chat/run-card.css";
  const CARET = "src/renderer/ui/chat/caret.tsx";
  const CARET_CSS = "src/renderer/ui/chat/caret.css";
  const TURN_CSS = "src/renderer/ui/chat/turn.css";
  const PARTY_CSS = "src/renderer/ui/party/party-view.css";
  const TOKENS = "src/renderer/design/tokens.css";
  const COMMANDS = "src/shared/commands.ts";
  const EVENTS = "src/shared/events.ts";
  const CHANNELS = "src/shared/channels.ts";
  const PRELOAD = "src/preload/index.ts";
  // Words are string and template literals and JSX text, including the text a `{expression}` sits beside (`{n} of {m}`).
  const WORDS = /(["'`])(?:(?!\1)[^\n\\]|\\.)*\1|[>}][^<>{}\n]+[<{]/g;
  const css = (path: string): string => (code.get(path) ?? "").replace(/\s+/g, " ");
  /** The body of the first rule whose selector is exactly `selector`. */
  const ruleBody = (path: string, selector: string): string | undefined => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return css(path).match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[1];
  };

  it("reads the sources it claims to sweep", () => {
    for (const path of [CARD, LINE, STATUS, STOP, USE_NOW, DOT, ROW, PROGRESS, FOLD, ANNOTATOR, LIVE, ANNOUNCER, CONVERSATION, CARD_CSS, TOKENS]) {
      expect(code.get(path)?.length ?? 0, path).toBeGreaterThan(200);
    }
  });

  it("styles the caret on at rest: one rule, and no opacity, visibility or `display: none` in it or anywhere that reaches it", () => {
    // The caret is one shared class (the run card's prose and a persona's turn in flight), in its own stylesheet.
    const body = ruleBody(CARET_CSS, ".caret") ?? "";
    expect(body).toContain("animation: var(--motion-blink)");
    // At rest it is a solid box in the accent, of a size the tokens give it, and nothing above it hides it.
    expect(body).toMatch(/background: var\(--accent\)/);
    expect(body).toMatch(/width: var\(--caret-width\)/);
    expect(body).toMatch(/height: var\(--caret-height\)/);
    for (const ancestor of [".run-card", ".run-card-body", ".run-card-flow", ".run-card-prose", ".run-card-text"]) {
      expect(ruleBody(CARD_CSS, ancestor) ?? "", ancestor).not.toMatch(/\b(?:opacity|visibility|clip|clip-path|transform)\b/);
    }
    // In a turn it sits in the words of a persona's turn, which nothing dims (only a queued message of the user's is).
    for (const ancestor of [".turn", ".turn--persona", ".turn-body", ".turn-words", ".turn-words p", ".turn--party-live"]) {
      expect(ruleBody(TURN_CSS, ancestor) ?? ruleBody(PARTY_CSS, ancestor) ?? "", ancestor).not.toMatch(/\b(?:opacity|visibility|clip|clip-path|transform)\b/);
    }
    expect(body).not.toMatch(/\b(?:opacity|visibility|content|clip|clip-path|transform|transition|animation-fill-mode|animation-play-state)\b/);
    // `display` appears once, to give the empty span its box, and never takes the caret off the page.
    expect(body.match(/\bdisplay\s*:\s*([\w-]+)/g)).toEqual(["display: inline-block"]);
    // Nothing else in any stylesheet names the caret: no later rule can turn it off.
    expect(RENDERER_ALL.filter((path) => path.endsWith(".css") && /\.caret\b/.test(code.get(path) ?? ""))).toEqual([CARET_CSS]);
    expect(css(CARET_CSS).match(/\.caret\b/g)).toHaveLength(1);
    // The markup hides it from a reader and from nothing else: no hidden attribute, no style; one component draws it.
    expect(code.get(CARET) ?? "").toContain('<span className="caret" aria-hidden="true" />');
    expect(RENDERER_CODE.filter((path) => /className="caret"/.test(code.get(path) ?? ""))).toEqual([CARET]);
    const card = code.get(CARD) ?? "";
    expect(card).toContain("{running && hasText && <Caret />}");
  });

  it("keeps `blink` a hard on/off that dips once, so taking the animation away leaves the caret on", () => {
    const tokens = css(TOKENS);
    expect(tokens).toMatch(/--motion-blink:\s*blink [\d.]+s steps\(1\) infinite;/);
    expect(tokens.match(/@keyframes blink\s*\{([^@]*?\}\s*)\}/)?.[1].replace(/\s+/g, "")).toBe("50%{opacity:0}");
    expect(tokens.match(/@keyframes blink/g)).toHaveLength(1);
    // The caret never reads the blink through a timing function other than `steps(1)`: no `ease`, no `linear`, no fade.
    expect(tokens).not.toMatch(/--motion-blink:[^;]*(?:ease|linear|cubic-bezier|forwards|backwards|both)/);
  });

  it("has one reduced-motion rule, global, that turns animation off and carves nothing out and hides nothing", () => {
    const blocks = RENDERER_ALL.filter((path) => path.endsWith(".css")).flatMap((path) =>
      [...css(path).matchAll(/@media[^{]*prefers-reduced-motion[^{]*\{(.*?\})\s*\}/g)].map(([, body]) => ({ path, body: body.replace(/\s+/g, "") })),
    );
    expect(blocks).toEqual([{ path: TOKENS, body: "*,*::before,*::after{animation:none!important;transition:none!important}" }]);
    // Nothing else is conditioned on the setting: no stylesheet carries it twice and none names a card selector under it.
    expect(blocks[0].body).not.toMatch(/opacity|visibility|display|caret|run-card|elapsed|status/);
    expect(RENDERER_ALL.filter((path) => path.endsWith(".css") && /prefers-reduced-motion/.test(code.get(path) ?? ""))).toEqual([TOKENS]);
  });

  it("reads no media query in script: the card, its line, the clock and the dot behave one way however motion is set", () => {
    expect(offenders([CARD, LINE, USE_NOW, DOT], /matchMedia|prefers-reduced-motion|reducedMotion|useReducedMotion/)).toEqual([]);
    expect(offenders(RENDERER_CODE, /matchMedia|prefers-reduced-motion|reducedMotion|useReducedMotion/)).toEqual([]);
    // The elapsed counter is the one thing that carries liveness once the pulse and blink are off, and it ticks on a plain interval.
    expect(code.get(USE_NOW) ?? "").toMatch(/setInterval\(/);
  });

  it("says no denominator, spinner word, or undo, revert, restore, merge, lock or resolve in any word the card, rail or live region is made of", () => {
    const WORDS_OF = [CARD, LINE, STATUS, STOP, ROW, PROGRESS, FOLD, ANNOTATOR, LIVE, ANNOUNCER];
    const spoken = WORDS_OF.flatMap((path) => [...(code.get(path) ?? "").matchAll(WORDS)].map(([text]) => `${path}: ${text}`));
    expect(spoken.length).toBeGreaterThan(20);
    // The announcements are made in the conversation and read from the same words as the head's.
    const conversation = code.get(CONVERSATION) ?? "";
    const from = conversation.indexOf("function announceLifecycle");
    const announcing = conversation.slice(from, conversation.indexOf("\n  function ", from + 10));
    expect(from).toBeGreaterThan(0);
    const all = [...spoken, ...[...announcing.matchAll(WORDS)].map(([text]) => `${CONVERSATION}: ${text}`)];
    expect(all.filter((text) => /\b(?:undo|revert|restore|merge|lock|resolve)\w*/i.test(text))).toEqual([]);
    expect(all.filter((text) => /\bof\b\s*(?:\d|\$|[mn]\b)|\/\s*\$\{|\/\s*\d|\btotal\b|\bdenominator\b|%/i.test(text))).toEqual([]);
    expect(all.filter((text) => /\b(?:spinner|skeleton|shimmer|loading|waiting|thinking|processing|please wait|in progress)\b/i.test(text))).toEqual([]);
  });

  it("holds no card, rail or notification code that sounds, badges or toasts: no audio, Dock call, toast or badge anywhere in src", () => {
    expect(offenders(ALL_CODE, /\bnew Audio\b|<audio\b|\bAudioContext\b|\bshell\.beep\b|\bsetBadge\w*|\bdock\.|\bsetBadgeCount\b|\bbounce\(|\btoast\w*\b/i)).toEqual([]);
    expect(offenders(RENDERER_CODE, /[Bb]adge|[Ss]nackbar|(?<![a-z])undo|Undo/)).toEqual([]);
    expect(offenders([CARD_CSS, "src/renderer/ui/chat/run-card-line.css", "src/renderer/ui/outputs/outputs.css"], /\bbadge\b|\btoast\b|\bsnackbar\b/i)).toEqual([]);
  });

  it("draws the card's controls from one place: the head's stop, and no dialog, confirm or second button in the card or its line", () => {
    for (const path of [CARD, LINE, STOP, ROW]) {
      expect(code.get(path) ?? "", path).not.toMatch(/<dialog\b|role=["'](?:dialog|alertdialog)|aria-modal|\bwindow\.confirm\b|\bconfirm\(|\balert\(|showModal/);
    }
    expect((code.get(CARD) ?? "").match(/<button\b/g)).toBeNull();
    expect((code.get(LINE) ?? "").match(/<button\b/g)).toHaveLength(1);
    expect((code.get(STOP) ?? "").match(/<button\b/g)).toHaveLength(1);
    expect((code.get(ROW) ?? "").match(/<button\b/g)).toHaveLength(1);
  });

  it("holds the contract at eight commands, seventeen events, thirty-six channels and twenty-four bridge methods", () => {
    const commands = [...(code.get(COMMANDS) ?? "").matchAll(/^\s+'([a-z]+\.[a-z]+)':\s*CommandSpec/gm)];
    const events = [...(code.get(EVENTS) ?? "").matchAll(/^\s+'([a-z]+:[a-z-]+)':\s*EventSpec/gm)];
    const channels = [...(code.get(CHANNELS) ?? "").matchAll(/^export const (\w+) = '/gm)];
    const preload = code.get(PRELOAD) ?? "";
    const methods = [...preload.slice(preload.indexOf("const harness: HarnessApi = {"), preload.indexOf("contextBridge.exposeInMainWorld")).matchAll(/^ {2}(\w+):/gm)];
    expect([commands.length, events.length, channels.length, methods.length]).toEqual([8, 17, 36, 24]);
  });

  it("says what carried on after a stop in lower case, `·`-separated, unpunctuated, and offers nothing: no resume, continue, retry or guidance word", () => {
    const voice = code.get("src/main/session-voice.ts") ?? "";
    const line = voice.match(/carriedOn:\s*(['"`])((?:(?!\1).)*)\1/)?.[2];

    expect(line).toBe("carried on after the stop · a new run follows it");
    expect(line).toBe(line?.toLowerCase());
    expect(line).not.toMatch(/[.!?:;,]$/);
    expect(line).not.toMatch(/\b(?:resum\w*|continu\w*|retry|try|again|please|should|can|could|you|your|press|click|restore|undo|revert)\b/i);
    // One place says it: the registry, once, through the harness's own `say`.
    expect(offenders(MAIN_CODE, /\bLINES\.carriedOn\b/)).toEqual(["src/main/session-registry.ts: LINES.carriedOn"]);
    expect(code.get("src/main/session-registry.ts")?.match(/\bLINES\.carriedOn\b/g)).toHaveLength(1);
  });

  it("writes no interrupt of its own: `stopRun` asks the session for one and nothing else in main does, and a continuation is started, never resumed", () => {
    expect(offenders(MAIN_CODE, /\.interrupt\(/)).toEqual(["src/main/session-stop.ts: .interrupt("]);
    expect(code.get("src/main/session-stop.ts")?.match(/\.interrupt\(/g)).toHaveLength(1);
    expect(offenders(MAIN_CODE, /\binterruptLine\b/).map((hit) => hit.split(":")[0])).toEqual(["src/main/sources/session/session-process.ts"]);
    // No resume in any sentence main speaks: a stopped run's work is carried on by the CLI, and the harness only gives it a card.
    // (`'resumed'` alone is the turn fold's signal name, a word of code and no sentence.)
    const sentences = MAIN_CODE.filter((path) => path.startsWith("src/main/session-")).flatMap((path) =>
      [...(code.get(path) ?? "").matchAll(/(["'`])((?:(?!\1)[^\n\\])*)\1/g)].map(([, , text]) => `${path}: ${text}`),
    );
    expect(sentences.length).toBeGreaterThan(20);
    expect(sentences.filter((text) => /\bresum\w*\b/i.test(text) && /\s/.test(text.split(": ").slice(1).join(": ")))).toEqual([]);
  });
});

describe("nothing this epic promised not to do: the audit's static half (Story 4.6, UX-DR21, UX-DR36, UX-DR38)", () => {
  const PARTY = "src/renderer/ui/party/";
  const VIEW = `${PARTY}party-view.tsx`;
  const HEADER = `${PARTY}party-header.tsx`;
  const TURN = `${PARTY}party-turn.tsx`;
  const STRIP = `${PARTY}cast-strip.tsx`;
  const PANEL = `${PARTY}room-panel.tsx`;
  const CHOOSER = "src/renderer/ui/party/cast-chooser.tsx";
  const STRIP_CSS = `${PARTY}cast-strip.css`;
  const PANEL_CSS = `${PARTY}room-panel.css`;
  const SHELL_CSS = "src/renderer/ui/shell/shell.css";
  const TOKENS = "src/renderer/design/tokens.css";
  const COMPOSER = "src/renderer/ui/chat/composer.tsx";
  const TURN_SHARED = "src/renderer/ui/chat/turn.tsx";
  const VOICE = "src/main/session-voice.ts";
  const BRIDGE = "src/main/session-bridge.ts";
  const STATE = "src/renderer/ui/chat/conversation-state.ts";
  const FOLD = "src/main/fold/transcript.ts";
  const COMMANDS = "src/shared/commands.ts";
  const EVENTS = "src/shared/events.ts";
  const CHANNELS = "src/shared/channels.ts";
  const PRELOAD = "src/preload/index.ts";
  const PARTY_TSX = [VIEW, HEADER, TURN, STRIP, PANEL, CHOOSER];
  const PARTY_CSS = RENDERER_ALL.filter((path) => path.startsWith(PARTY) && path.endsWith(".css"));
  const PARTY_ALL = [...PARTY_TSX, ...PARTY_CSS];
  // Words are string and template literals and JSX text, including the text a `{expression}` sits beside.
  const WORDS = /(["'`])(?:(?!\1)[^\n\\]|\\.)*\1|[>}][^<>{}\n]+[<{]/g;
  const css = (path: string): string => (code.get(path) ?? "").replace(/\s+/g, " ");
  /** The body of the first rule whose selector is exactly `selector`. */
  const ruleBody = (path: string, selector: string): string | undefined => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return css(path).match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[1];
  };
  const wordsOf = (paths: string[]): string[] =>
    paths.flatMap((path) => [...(code.get(path) ?? "").matchAll(WORDS)].map(([text]) => `${path}: ${text}`));

  it("reads the sources it claims to sweep", () => {
    for (const path of [...PARTY_TSX, STRIP_CSS, PANEL_CSS, SHELL_CSS, TOKENS, COMPOSER, TURN_SHARED, "src/renderer/ui/chat/turn.css", "src/shared/room-summary.ts", VOICE, BRIDGE, STATE, FOLD, COMMANDS, EVENTS, CHANNELS, PRELOAD]) {
      expect(code.get(path)?.length ?? 0, path).toBeGreaterThan(200);
    }
    expect(PARTY_CSS.length).toBeGreaterThanOrEqual(5);
  });

  it("names no deferred section in any party source or stylesheet, and the panel reserves no slot for one", () => {
    expect(offenders(RENDERER_ALL, /Open disagreements|Decisions so far/i)).toEqual([]);
    expect(offenders(PARTY_ALL, /disagree|decision|unresolved|evidence|\bso far\b/i)).toEqual([]);
    const panel = code.get(PANEL) ?? "";
    // One aside, one heading, four rows: nothing is drawn, mapped or reserved beside them, not even behind a condition.
    expect(panel.match(/<aside\b/g)).toHaveLength(1);
    expect(panel.match(/<h[1-6]\b/g)).toHaveLength(1);
    expect(panel.match(/className="room-panel-row"/g)).toHaveLength(4);
    expect(panel).not.toMatch(/<(?:section|details|summary|ul|ol|li|button|a|input|textarea)\b|hidden|\bslot\b|placeholder|reserve|\.map\(\(?section|sections\b/i);
    expect(code.get(PANEL_CSS) ?? "").not.toMatch(/(?<![\w-])content\s*:|\bvisibility\s*:|\[hidden\]|(?:slot|reserve)/i);
    const sideRule = ruleBody(PANEL_CSS, ".party-side");
    expect(sideRule ?? "").not.toBe("");
    expect(sideRule).not.toMatch(/\bdisplay\s*:/);
    expect([...(code.get(PANEL) ?? "").matchAll(/>\s*([A-Za-z][^<>{}\n]*?)\s*</g)].map(([, text]) => text)).toEqual(["Room", "topic", "opened", "context", "writes to"]);
  });

  it("draws no tag, chip, quote or reply in a party turn, and none of those words anywhere a party turn is made", () => {
    for (const path of [VIEW, HEADER, TURN, STRIP, PANEL]) {
      expect(code.get(path) ?? "", path).not.toMatch(/disagrees|evidence|unresolved|<blockquote|<q\b|<cite|\bquot(?:e|ed|ing)\b|\breply\b|\bresponding[- ]to\b|\bin reply\b|\bre:/i);
    }
    // The party turn is the shared head and words around a portrait, and takes no decision, queue or cancel of its own.
    const turn = code.get(TURN) ?? "";
    expect(turn).toMatch(/import \{ Head, PersonaWords \} from '\.\.\/chat\/turn'/);
    expect(turn).not.toMatch(/DecisionBlock|PersonaTurn|queuedFor|onCancel|onChoose|<button|<a\b|onClick/);
    expect([...turn.matchAll(/<div className=\{?['"]?[^>]*>/g)].length).toBeGreaterThan(0);
    // No stylesheet gives a turn a tag or a quote: the shared turn and the party's own say none of those words.
    expect(offenders([TURN_SHARED, "src/renderer/ui/chat/turn.css", ...PARTY_ALL], /disagrees|evidence|unresolved|(?<!\.turn-md )blockquote|\.turn-(?:tag|quote|reply|chip)\b/i)).toEqual([]);
    // Neither friction nor failure is spent on party chrome: the party stylesheets read neither colour.
    expect(offenders(PARTY_CSS, /var\(--(?:disagree|red)\b/)).toEqual([]);
  });

  it("gives the room one stop and one summary button and no pause, gate, queue or speaker list", () => {
    expect(offenders(PARTY_ALL, /pause|resume|\bmute\b|\bskip\b|\bqueue\w*|\bspeakers?List\b|\bnextSpeaker\b|\bwhoIsNext\b|\bturnGate\b|\bgate\w*/i)).toEqual([]);
    expect(offenders(PARTY_TSX, /Pause room/i)).toEqual([]);
    expect(offenders(PARTY_TSX, /<(?:ol|li|table|select|dialog)\b|aria-modal|role=/)).toEqual([`${CHOOSER}: <li`]);
    expect((code.get(HEADER) ?? "").match(/<button\b/g)).toHaveLength(2);
    expect(code.get(HEADER) ?? "").toContain("stop room");
    // The button names the project's output folder, which the rail says (Story 5.4), and no literal one.
    expect(code.get(HEADER) ?? "").toContain("`Write summary to ${folder}`");
    expect(code.get(HEADER) ?? "").not.toContain("_bmad");
    // The composer is the room's only other control in a live room, and nothing the room does can switch it off.
    const view = code.get(VIEW) ?? "";
    expect(view.match(/<Composer\b[^>]*>/g)).toEqual(['<Composer agentName="the room" onSend={onSend} returned={returned} fieldRef={fieldRef} />']);
    expect(view).not.toMatch(/disabled|readOnly|aria-disabled|aria-busy/);
    expect(code.get(COMPOSER) ?? "").not.toMatch(/\bdisabled\b|readOnly|aria-disabled/);
    expect(offenders(PARTY_TSX.filter((path) => path !== CHOOSER && path !== HEADER), /\bdisabled\b/)).toEqual([]);
    // The only disabled controls in party code are the summary button without a handler, or before the rail has said
    // which folder it writes under (Story 5.4), and *Open the room* with nobody ticked.
    expect((code.get(HEADER) ?? "").match(/\bdisabled=\{[^}]*\}/g)).toEqual(["disabled={onWriteSummary === undefined || folder === undefined}"]);
    expect((code.get(CHOOSER) ?? "").match(/\bdisabled=\{[^}]*\}/g)).toEqual(["disabled={cast.length === 0}"]);
  });

  it("holds the panel at 240px, no 288 anywhere, and hides it at the shell's one 1180px rule and nowhere else", () => {
    expect(css(TOKENS)).toMatch(/--party-side:\s*240px;/);
    expect(css(TOKENS).match(/--party-side:/g)).toHaveLength(1);
    expect(offenders(sources("src/", [".ts", ".tsx", ".html", ".css"]), /(?<![\d.#a-fA-F_-])288(?![\d])/)).toEqual([]);
    expect(css(PANEL_CSS)).toMatch(/\.party-side \{[^}]*flex: 0 0 var\(--party-side\);[^}]*width: var\(--party-side\);/);
    // One rule at 1180px, in the shell, which hides the panel and does nothing else; the other breakpoint is 1000px; there are no more.
    const queries = RENDERER_ALL.filter((path) => path.endsWith(".css")).flatMap((path) =>
      [...css(path).matchAll(/@media\s*([^{]*)\{/g)].map(([, query]) => `${path}: ${query.trim()}`),
    );
    // The Welcome (Story 5.1) takes the second breakpoint only, in its own stylesheet.
    expect(queries.filter((query) => /width/.test(query))).toEqual([
      `${SHELL_CSS}: (max-width: 1180px)`,
      `${SHELL_CSS}: (max-width: 1000px)`,
      "src/renderer/ui/welcome/welcome.css: (max-width: 1000px)",
    ]);
    expect(css(SHELL_CSS)).toMatch(/@media \(max-width: 1180px\) \{ \.party-side, \.panel-splitter--room \{ display: none; \} \}/);
    expect(RENDERER_ALL.filter((path) => path.endsWith(".css") && /\.party-side\b/.test(code.get(path) ?? "")).sort()).toEqual([PANEL_CSS, SHELL_CSS]);
    expect(css(SHELL_CSS).match(/\.party-side/g)).toHaveLength(1);
    expect(css(SHELL_CSS).match(/1180px/g)).toHaveLength(1);
    expect(offenders([...PARTY_TSX, ...PARTY_CSS], /innerWidth|matchMedia|ResizeObserver|clientWidth/)).toEqual([]);
  });

  it("dims a card from the idle token and never hides one: tokens ordered, no display, visibility or hidden rule", () => {
    const tokens = css(TOKENS);
    const token = (name: string): number => Number(tokens.match(new RegExp(`--opacity-${name}:\\s*(\\.?\\d*\\.?\\d+)\\s*;`))?.[1]);
    expect(token("idle")).toBeGreaterThan(0);
    expect(token("idle")).toBeLessThan(token("hover"));
    expect(token("hover")).toBeLessThan(token("speaking"));
    expect(token("speaking")).toBe(1);
    const card = ruleBody(STRIP_CSS, ".cast-card") ?? "";
    expect(card).toMatch(/\bopacity: var\(--opacity-idle\);/);
    expect(ruleBody(STRIP_CSS, ".cast-card:hover")).toMatch(/\bopacity: var\(--opacity-hover\);/);
    expect(ruleBody(STRIP_CSS, ".cast-card--speaking, .cast-card--speaking:hover")).toMatch(/\bopacity: var\(--opacity-speaking\);/);
    // Nothing takes a card, its strip or its parts off the page: no `display: none`, visibility, zero opacity or hidden clip, anywhere.
    expect(css(STRIP_CSS)).not.toMatch(/display\s*:\s*none|visibility\s*:|\[hidden\]|\bopacity\s*:\s*(?:0(?:\.0*)?|\.0+)\s*[;}]|\bclip(?:-path)?\s*:|\bscale\(\s*0|(?<![-\w])width\s*:\s*0\b|(?<![-\w])height\s*:\s*0\b/);
    expect(offenders(RENDERER_ALL.filter((path) => path.endsWith(".css")).filter((path) => path !== STRIP_CSS), /\.cast-(?:card|strip|portrait|info|status)\b/)).toEqual([]);
    // The strip draws a card for each id of the cast and filters none, and the speaker only adds a class.
    const strip = code.get(STRIP) ?? "";
    expect(strip).toMatch(/\{cast\.map\(\(id\) => \{/);
    expect(strip).not.toMatch(/\.filter\(|\.slice\(|\.splice\(|\.pop\(|\.shift\(|\.sort\(|\.reverse\(|(?<![-\w])hidden\b|style=/);
    expect(strip).toContain("speaking ? 'cast-card cast-card--speaking' : 'cast-card'");
    // Only the speaker's card carries the equaliser, and only the strip's own stylesheet knows it.
    expect(strip.match(/<span className="cast-eq"/g)).toHaveLength(1);
    expect(strip).toContain("{speaking && (");
  });

  it("says nothing of the room that is guidance or a wait in any party word: no start another, try, next, you can, loading or progress", () => {
    const words = wordsOf(PARTY_TSX);
    expect(words.length).toBeGreaterThan(20);
    expect(words.filter((text) => /\b(?:start another|another room|try|next|you can|you could|you should|please|why not|loading|waiting|thinking|processing|spinner|skeleton|shimmer|progress|unread|new messages?)\b/i.test(text))).toEqual([]);
    expect(words.filter((text) => /\b(?:rank\w*|strongest|winner|agree\w*|conflict\w*|tension|consensus|majority|heated)\b/i.test(text))).toEqual([]);
    expect(words.filter((text) => /\bof\b\s*(?:\d|\$|[mn]\b)|\/\s*\$\{|\/\s*\d|\btotal\b|%/i.test(text))).toEqual([]);
    expect(offenders(PARTY_TSX, /aria-live|aria-busy|role=["']?(?:status|alert|log|progressbar)|<progress\b|<meter\b/)).toEqual([]);
  });

  it("holds the room's own harness lines to two, in the harness's register, and says them from one place each", () => {
    const voice = code.get(VOICE) ?? "";
    const rooms = [...voice.matchAll(/^\s+(room\w+):/gm)].map(([, name]) => name);
    expect(rooms).toEqual(["roomOpened", "roomStopped"]);
    const opened = voice.match(/roomOpened:[^\n`]*`([^`]*)`/)?.[1] ?? "";
    const stopped = voice.match(/roomStopped:\s*'([^']*)'/)?.[1] ?? "";
    expect(opened).toBe("room opened by you · present · ${names.join(' · ')}");
    expect(stopped).toBe("room stopped · session released");
    for (const line of [opened.replace("${names.join(' · ')}", "Mary"), stopped]) {
      expect(line.startsWith("room ")).toBe(true);
      expect(line).not.toMatch(/[.!?:;,]$/);
      // Facts and no guidance; the one name in the sample is the roster's, the rest is lower case.
      expect(line.replace("Mary", "")).toBe(line.replace("Mary", "").toLowerCase());
      expect(line).not.toMatch(/\b(?:try|next|again|another|please|should|can|could|press|click|resume|continue|restart|start|new)\b/);
    }
    // Said by the bridge, once each, through the registry's own `say`, and by nothing else in main.
    const bridge = code.get(BRIDGE) ?? "";
    // A persona's close writes no line (Story 8.5, which takes Story 7.4's seat ending away): the bridge says two.
    expect(bridge.match(/registry\.say\(/g)).toHaveLength(2);
    expect(bridge).toMatch(/registry\.say\(sender, entry, LINES\.roomOpened\(/);
    expect(bridge).toMatch(/registry\.say\(sender, entry, LINES\.roomStopped\)/);
    expect(offenders(MAIN_CODE, /\bLINES\.room(?:Opened|Stopped)\b/)).toEqual([`${BRIDGE}: LINES.roomOpened`]);
    expect(MAIN_CODE.reduce((count, path) => count + (code.get(path)?.match(/\bLINES\.roomOpened\b/g)?.length ?? 0), 0)).toBe(1);
    expect(MAIN_CODE.reduce((count, path) => count + (code.get(path)?.match(/\bLINES\.roomStopped\b/g)?.length ?? 0), 0)).toBe(1);
    // A persona's close deletes its thread and says nothing in its place (Story 8.5): no seat line is declared or said.
    expect(voice).not.toMatch(/seatEnded/);
    expect(MAIN_CODE.reduce((count, path) => count + (code.get(path)?.match(/\bLINES\.seatEnded\b/g)?.length ?? 0), 0)).toBe(0);
  });

  it("makes a persona's entry only from the session's own text: three constructors, each given the text the session sent", () => {
    const makers = ALL_CODE.flatMap((path) => [...(code.get(path) ?? "").matchAll(/kind:\s*'persona'/g)].map(() => path));
    expect(makers.sort()).toEqual([FOLD, STATE, STATE, "src/renderer/ui/chat/transcript-entry.ts", "src/shared/conversation.ts"].sort());
    // The renderer's two: the stored record's text, and the streamed delta's; the main fold's: the delta's. None writes a literal.
    const state = code.get(STATE) ?? "";
    expect([...state.matchAll(/kind:\s*'persona',[\s\S]{0,200}?\btext(?::\s*([\w.]+))?,/g)].map(([, from]) => from ?? "text")).toEqual(["record.text", "text"]);
    expect([...(code.get(FOLD) ?? "").matchAll(/kind:\s*'persona',[\s\S]{0,200}?\btext,/g)]).toHaveLength(1);
    // Nothing the room draws or sends is shaped as a persona's words: no entry is made in the party view, and the summary ask is a user's turn.
    expect(offenders(PARTY_TSX, /kind:\s*['"](?:persona|user)['"]/)).toEqual([]);
    expect(offenders(PARTY_TSX, /\.text\s*=|summar(?:y|ise|ize)\w*\(|classif\w*|\brank\w*|\bamplif\w*|\bstage\w*/i)).toEqual([]);
    const summary = code.get("src/shared/room-summary.ts") ?? "";
    expect(summary).not.toMatch(/kind:|persona|agentId/);
  });

  it("plays no sound, posts no notification or badge, and draws no toast, from any party code or the room's lines", () => {
    expect(offenders([...PARTY_ALL, COMPOSER], /\bnew Audio\b|<audio\b|\bAudioContext\b|\bNotification\b|\bnew Notification\b|\bsetBadge\w*|\btoast\w*|[Bb]adge|\bunread\w*|\bsnackbar\b|\.beep\(|\.play\(/)).toEqual([]);
    expect(offenders([VOICE, BRIDGE], /\bNotification\b|\bAudio\w*|\bbeep\b|\bsetBadge\w*|\bdock\./)).toEqual([]);
    expect(offenders(PARTY_TSX, /<(?:progress|meter|audio|video|canvas)\b|spinner|skeleton|shimmer|loader/i)).toEqual([]);
    expect(offenders(PARTY_CSS, /spinner|skeleton|shimmer|loader|badge|@keyframes\s+(?!eq\b)/i)).toEqual([]);
  });

  it("holds the contract at eight commands, seventeen events, thirty-six channels and twenty-four bridge methods", () => {
    const commands = [...(code.get(COMMANDS) ?? "").matchAll(/^\s+'([a-z]+\.[a-z]+)':\s*CommandSpec/gm)];
    const events = [...(code.get(EVENTS) ?? "").matchAll(/^\s+'([a-z]+:[a-z-]+)':\s*EventSpec/gm)];
    const channels = [...(code.get(CHANNELS) ?? "").matchAll(/^export const (\w+) = '/gm)];
    const preload = code.get(PRELOAD) ?? "";
    const methods = [...preload.slice(preload.indexOf("const harness: HarnessApi = {"), preload.indexOf("contextBridge.exposeInMainWorld")).matchAll(/^ {2}(\w+):/gm)];
    expect([commands.length, events.length, channels.length, methods.length]).toEqual([8, 17, 36, 24]);
  });

  it("says a refused message once, as a fact, in the window's own register, and never sends, queues or retries it (Story 4.8)", () => {
    const CONVERSATION = "src/renderer/ui/chat/use-conversation.ts";
    const state = code.get(STATE) ?? "";
    // One line, declared once, in the harness's register: lower case, `·`-separated, no terminal punctuation, no guidance.
    const declared = [...state.matchAll(/ROOM_REFUSED_LINE\s*=\s*'([^']*)'/g)].map(([, line]) => line);
    expect(declared).toEqual(["not sent · the room is still speaking"]);
    expect(declared[0]).toBe(declared[0].toLowerCase());
    expect(declared[0]).not.toMatch(/[.!?]$|retry|try again|resend|queue|\byou\b|\bplease\b/i);
    // The line is the window's own: main's code never says it, and writes nothing for a refused send.
    expect(offenders([VOICE, BRIDGE, "src/main/session-registry.ts"], /not sent|still speaking/)).toEqual([]);
    // Nothing is sent again: the room's refusal paths hold no second send, no timer and no retry word.
    const refusal = state.slice(state.indexOf("export function roomRefused"), state.indexOf("export function speakerOf"));
    expect(refusal.length).toBeGreaterThan(0);
    expect(refusal).not.toMatch(/sendTurn|setTimeout|retry|resend|queue|withQueue/i);
    const conversation = code.get(CONVERSATION) ?? "";
    // The room's send, a queued turn's and, from Story 7.5, a send to a skill-first session main no longer holds (its
    // refusal is the window's own line, `session ended`, drawn like the room's and never sent again).
    expect(conversation.match(/bridge\.sendTurn\(/g)).toHaveLength(3);
    expect(wordsOf([CONVERSATION, STATE, COMPOSER, ...PARTY_TSX]).filter((text) => /try again|retry|resend|re-send/i.test(text))).toEqual([]);
    // The text goes back to the field and nowhere else: the composer takes it into its own draft and calls no handler.
    const composer = code.get(COMPOSER) ?? "";
    expect(composer.match(/onSend\(/g)).toHaveLength(1);
  });

  it("says nothing of a reload: no restored or reconnected word, control, line or banner for a room that came back (Story 4.7)", () => {
    const CONVERSATION = ["src/renderer/ui/chat/use-conversation.ts", STATE, VOICE, BRIDGE, "src/main/session-registry.ts"];
    expect(wordsOf([...PARTY_TSX, ...CONVERSATION, COMPOSER]).filter((text) => /restor|reconnect|reload|rejoin|welcome back/i.test(text))).toEqual([]);
    expect(offenders(PARTY_CSS, /restor|reconnect|reload/i)).toEqual([]);
    // The room that comes back draws nothing of its own: `hydrate` makes no sysline and says no line, and main's snapshot says none.
    const slice = (path: string, from: string, to: string): string => {
      const text = code.get(path) ?? "";
      expect(text.indexOf(from), from).toBeGreaterThanOrEqual(0);
      expect(text.indexOf(to), to).toBeGreaterThan(text.indexOf(from));
      return text.slice(text.indexOf(from), text.indexOf(to));
    };
    const hydrate = slice(STATE, "export function hydrate", "export function foldEvent");
    expect(hydrate.length).toBeGreaterThan(0);
    expect(hydrate).not.toMatch(/withHandoff|harness:said|LINES\./);
    const getConversation = slice(BRIDGE, "function getConversation", "export function registerSessionBridge");
    expect(getConversation.length).toBeGreaterThan(0);
    expect(getConversation).not.toMatch(/registry\.say|\bsay\(|transcript\.record|LINES\./);
  });
});

describe("the thread follows what is being said, and says nothing of it (Story 5.3)", () => {
  const FOLLOW = RENDERER_CODE.filter((path) => path.startsWith("src/renderer/ui/follow/"));
  const FOLLOW_CSS = "src/renderer/ui/follow/follow.css";
  const SCROLLER = "src/renderer/ui/follow/follow-scroller.tsx";
  const HOOK = "src/renderer/ui/follow/use-follow.ts";

  it("moves no thread smoothly, by animation or by transition, and sets a scroll position in the follow hook alone", () => {
    expect(FOLLOW.length).toBeGreaterThanOrEqual(4);
    expect(offenders(RENDERER_ALL, /behavior:\s*['"]smooth|scroll-behavior|\bscrollTo\(|\bscrollBy\(/)).toEqual([]);
    expect(offenders(RENDERER_ALL, /\bsmooth\b/)).toEqual([]);
    expect(offenders(FOLLOW, /requestAnimationFrame|setTimeout|setInterval|\.animate\(|\bscrollIntoView\b/)).toEqual([]);
    expect(offenders(RENDERER_CODE, /\.scrollTop =(?!=)/)).toEqual([`${HOOK}: .scrollTop =`]);
    const css = code.get(FOLLOW_CSS) ?? "";
    expect(css).not.toMatch(/transition|animation|@keyframes|box-shadow|filter|z-index|transform|opacity/);
  });

  it("draws one literal string, with no count, dot, badge, sign, toast, sound or live region around it", () => {
    const scroller = code.get(SCROLLER) ?? "";
    expect(scroller.match(/↓/g)).toHaveLength(1);
    expect(scroller).toMatch(/>\s*↓ latest\s*</);
    expect(scroller).not.toMatch(/\{[^}]*(?:count|length|unread|missed)[^}]*\}\s*<\/button>/i);
    expect(scroller).not.toMatch(/aria-live|role=|aria-label|aria-hidden|tabIndex|autoFocus|announce|badge|toast|new\b/i);
    expect(scroller.match(/<button\b/g)).toHaveLength(1);
    expect(offenders(RENDERER_ALL.filter((path) => path !== SCROLLER), /↓ latest|↓/)).toEqual([]);
    expect(offenders(FOLLOW, /Audio|\bnew Notification\b|navigator\.vibrate|localStorage|sessionStorage|indexedDB/)).toEqual([]);
  });

  it("stores nothing, has no setting, and adds no command, event, channel or bridge method", () => {
    expect(offenders(FOLLOW, /window\.harness|ipcRenderer|contextBridge|localStorage|sessionStorage/)).toEqual([]);
    expect(offenders(FOLLOW, /setting|preference|persist|remember/i)).toEqual([]);
    expect(offenders(RENDERER_CODE.filter((path) => !path.startsWith("src/renderer/ui/follow/")), /\bfollow(?:ing)?(?:Setting|Preference|Enabled)\b/)).toEqual([]);
  });

  it("is drawn by the two threads and only by them: the shell's and the room's live scroller, and not the stopped room's read-only one", () => {
    expect(offenders(RENDERER_CODE.filter((path) => !path.startsWith("src/renderer/ui/follow/")), /<FollowScroller\b/).sort()).toEqual([
      "src/renderer/ui/party/party-view.tsx: <FollowScroller",
      "src/renderer/ui/shell/shell.tsx: <FollowScroller",
    ]);
    expect((code.get("src/renderer/ui/party/party-view.tsx") ?? "").match(/<FollowScroller\b/g)).toHaveLength(1);
    expect(code.get("src/renderer/ui/shell/shell.tsx") ?? "").toContain('className="scroll"');
  });

  it("takes its colours, dimensions and type through tokens, and names the two new dimensions", () => {
    const css = code.get(FOLLOW_CSS) ?? "";
    expect(css).toContain("var(--follow-offset)");
    expect(css).toContain("var(--follow-padding)");
    expect(css).toContain("var(--panel-2)");
    expect(css).toContain("var(--panel-3)");
    expect(css).toContain("var(--dim)");
    expect(css).toContain("var(--text-strong)");
    expect(css).toContain("var(--fs-label)");
    expect(css).toContain("var(--mono)");
    expect(css).not.toMatch(/prefers-color-scheme|data-theme/);
  });
});

describe("stopping a turn that is not a run (Story 3.19, FR125, AD-23)", () => {
  const STOP = "src/main/session-stop.ts";
  const HEADER = "src/renderer/ui/chat/chat-header.tsx";

  it("sends no SIGINT and writes one interrupt: `session-stop` is the only place, and its one caller is the one acknowledgement both stops share", () => {
    expect(offenders([...code.keys()], /\bSIGINT\b/)).toEqual([]);
    expect(offenders(MAIN_CODE, /\.interrupt\(/)).toEqual([`${STOP}: .interrupt(`]);
    const stop = code.get(STOP) ?? "";
    expect(stop.match(/\.interrupt\(/g)).toHaveLength(1);
    // The run's stop, the plain turn's stop and the room's send all ask through the one `acknowledged`.
    expect(stop.match(/\backnowledged\(/g)?.length).toBeGreaterThanOrEqual(3);
    // The registry and the bridge write no interrupt: they hand the entry to `session-stop`.
    expect(offenders(["src/main/session-registry.ts", "src/main/session-bridge.ts"], /\.interrupt\(|\backnowledged\(/)).toEqual([]);
  });

  it("names the one stop path: the bridge handler asks the registry, which hands a run and a plain turn to `session-stop`", () => {
    expect(code.get("src/main/session-bridge.ts")).toMatch(/registry\.stopTurn\(/);
    expect(code.get("src/main/session-registry.ts")).toMatch(/stopTurn\(\{ runs, say, finish \}/);
    expect(code.get(STOP)).toMatch(/export async function stopTurn\(/);
    // A run in flight takes `stopRun`'s own path; the plain turn's wait is the room's, written once.
    expect(code.get(STOP)).toMatch(/return stopRun\(kit, sender, service, entry\)/);
    expect(code.get(STOP)?.match(/entry\.idleWaiters\.push\(/g)).toHaveLength(1);
    expect(offenders(MAIN_CODE, /["']turn\.stop["']/)).toEqual(["src/main/session-bridge.ts: 'turn.stop'"]);
  });

  it("marks the entry `interrupting` before the interrupt is written, and no line of the stop is a persona's voice", () => {
    const stop = code.get(STOP) ?? "";
    const turn = stop.slice(stop.indexOf("export async function stopTurn("), stop.indexOf("function endWithSession"));
    expect(turn.indexOf("entry.interrupting = true")).toBeGreaterThan(-1);
    expect(turn.indexOf("entry.interrupting = true")).toBeLessThan(turn.indexOf("acknowledged("));
    // Said by the harness (`say`), never through a persona event.
    expect(offenders(MAIN_CODE.filter((path) => path !== "src/main/session-voice.ts"), /\bLINES\.stopped\b/)).toEqual(["src/main/session-registry.ts: LINES.stopped"]);
    expect(code.get("src/main/session-registry.ts")?.match(/\bLINES\.stopped\b/g)).toHaveLength(1);
    expect(code.get("src/main/session-registry.ts")).toMatch(/say\(sender, entry, LINES\.stopped\)/);
  });

  it("draws the header's one control as one native button, with no confirmation, cost, `stopping…`, title, disabled or pending state, and in the thread of no room or orphan", () => {
    const header = code.get(HEADER) ?? "";
    // The persona's header and, from Story 7.5, a skill-first session's: each one native button, which is Stop or close session.
    expect(header.match(/<button\b/g)).toHaveLength(2);
    expect(header).not.toMatch(/confirm|dialog|cost|stopping|pending|disabled|title=|aria-disabled|aria-busy|toast|tooltip|spinner/i);
    expect(offenders(["src/renderer/ui/chat/orphan-header.tsx", ...sources("src/renderer/ui/party/")], /\bStop\b|\bstopTurn\b|\bonStopTurn\b|\bturnInFlight\b/)).toEqual([]);
    // The one place that hands the header a way to stop is the shell, which hands it to the current persona's header only.
    expect(offenders(RENDERER_CODE, /<ChatHeader\b/)).toEqual(["src/renderer/ui/shell/shell.tsx: <ChatHeader"]);
    expect(offenders(RENDERER_CODE, /<SkillHeader\b/)).toEqual(["src/renderer/ui/shell/shell.tsx: <SkillHeader"]);
    expect(code.get("src/renderer/ui/shell/shell.tsx")?.match(/onStopTurn\(persona\.id\)/g)).toHaveLength(1);
    // Its stylesheet is the close control's: nothing new is drawn for a stop.
    expect(offenders(sources("src/renderer/ui/chat/", [".css"]), /chat-stop|\.stop-turn/)).toEqual([]);
  });

  it("clears no queue and cancels no message on a stop", () => {
    const hook = code.get("src/renderer/ui/chat/use-conversation.ts") ?? "";
    const stopTurn = hook.slice(hook.indexOf("async stopTurn(agentId)"), hook.indexOf("async close(agentId)"));
    expect(stopTurn.length).toBeGreaterThan(0);
    expect(stopTurn).not.toMatch(/commit\(|cancelQueued|dropQueued|setState|publish/);
  });
});

describe("the `/` list is the only skill list in the product, and it launches nothing (Story 7.3)", () => {
  const LIST_DIR = "src/renderer/ui/skills/";
  const APP = "src/renderer/ui/app.tsx";
  const COMPOSER = "src/renderer/ui/chat/composer.tsx";
  const READER = "src/main/sources/install/skill-manifest.ts";
  const skillsDir = sources(LIST_DIR, [".ts", ".tsx", ".css"]);

  it("reads the sources it claims to sweep", () => {
    expect(skillsDir.sort()).toEqual([
      `${LIST_DIR}skill-list.css`,
      `${LIST_DIR}skill-list.tsx`,
      `${LIST_DIR}slash-query.ts`,
      `${LIST_DIR}use-slash-list.ts`,
    ]);
    expect(code.get(READER)).toBeDefined();
  });

  it("hands the install's skills to a persona's composer from one place, and the room's composer none", () => {
    // The only reader of the snapshot's `skills` is the shell's owner, and it hands them to the persona composer alone.
    expect(offenders(RENDERER_CODE, /\.skills\b/).map((hit) => hit.split(":")[0])).toEqual([APP]);
    expect(offenders(RENDERER_CODE, /\bslashEntries\b/).map((hit) => hit.split(":")[0]).sort()).toEqual([APP, COMPOSER]);
    // Story 7.5: a persona's composer and the New session chat's, whose one job is typing a skill; the composer of a
    // skill-first session has none, so nothing inside a session suggests starting another.
    expect(code.get(APP)?.match(/slashEntries=\{snapshot\.skills\}/g)).toHaveLength(2);
    const app = code.get(APP) ?? "";
    expect(app.slice(app.indexOf("skillComposer="), app.indexOf("newComposer="))).not.toMatch(/slashEntries/);
    expect(offenders(sources("src/renderer/ui/party/"), /\bslashEntries\b|\bskills\b|SkillList|useSlashList/)).toEqual([]);
    // The list is drawn by the hook and by nothing else.
    expect(offenders(RENDERER_CODE, /<SkillList\b|\bcreateElement\(SkillList\b/).map((hit) => hit.split(":")[0])).toEqual([`${LIST_DIR}use-slash-list.ts`]);
    expect(offenders(RENDERER_CODE, /\buseSlashList\b/).map((hit) => hit.split(":")[0]).sort()).toEqual([COMPOSER, `${LIST_DIR}use-slash-list.ts`]);
  });

  it("has no button, menu, shortcut, panel or tile in it: a list of rows and the keys of the field it sits above", () => {
    expect(offenders(skillsDir, /<button\b|onClick|onMouse|onPointer|href|role=["'](?:button|menu|menuitem|dialog|tab)|<dialog\b|aria-pressed|\btabIndex\b|\btabindex=/)).toEqual([]);
    expect(offenders(skillsDir, /\bipcRenderer\b|\bwindow\.api\b|\bbridge\b|\bcommand\b|\bsendTurn\b|\brunSkill\b|\bdispatchMenu\b|\bopenSession\b|\bonSend\b|\bfetch\(/)).toEqual([]);
    // Not a place for recents, favourites, a group or a ranking (a count is pinned in the rendered list's own test).
    expect(offenders(skillsDir, /\brecents?\b|\bfavou?rites?\b|\bsort\(|\bgroup|\brecommend|\brank|\bfuzzy|\.icon\b|\btooltip\b|\btitle\b/i)).toEqual([]);
    // The list holds no live-region text.
    expect(offenders(skillsDir, /aria-live|role=["'](?:status|alert|log)|\bannounce/)).toEqual([]);
  });

  it("filters the rows main gave it by the start of the name and reads no description, module or path", () => {
    const query = code.get(`${LIST_DIR}slash-query.ts`) ?? "";
    expect(query).toMatch(/\.name\.toLowerCase\(\)\.startsWith\(wanted\)/);
    expect(query.match(/\.description\b/g)).toBeNull();
    expect(offenders(skillsDir, /\bmodule\b|\bpath\b|canonicalId|\.csv\b|_bmad/)).toEqual([]);
  });

  it("shows a skill button neither a skill's name nor its description from the manifest", () => {
    const row = code.get("src/renderer/ui/chat/skill-row.tsx") ?? "";
    expect(row).not.toMatch(/SkillView|slashEntries|\.skills\b|\.canonicalId\b/);
    // The button draws a menu entry's code and its words, from the persona's menu, and nothing from the manifest.
    expect(row).toContain('<span className="skill-code">{item.code}</span>');
    expect(row).toMatch(/items: readonly MenuEntryView\[\]/);
  });

  it("reads the manifest in one file of main, by its path, with no directory listing, glob, configuration or persona", () => {
    // The one file that names it.
    expect(
      offenders(ALL_CODE.filter((path) => path.startsWith("src/main/") || path.startsWith("src/shared/")), /skill-manifest\.csv/).map((hit) => hit.split(":")[0]),
    ).toEqual([READER]);
    expect(offenders(RENDERER_CODE, /skill-manifest|\.csv\b/)).toEqual([]);
    expect(code.get(READER) ?? "").not.toMatch(/\bglob\b|\breaddir\b|\bconfig\.toml\b|\bcustomize\.toml\b|\bsession\b|\bpersona\b|\bagents?\b/i);
    // The fold is pure: it reads nothing and imports nothing but the type.
    const fold = code.get("src/main/fold/skills.ts") ?? "";
    expect(fold).not.toMatch(/node:|\bfs\b|\bawait\b|\bprocess\b/);
    // And no other file of main or the renderer reads the manifest's columns by name.
    expect(offenders(MAIN_CODE.filter((path) => path !== "src/main/fold/skills.ts"), /canonicalId/)).toEqual([]);
  });
});
