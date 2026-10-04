import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { allStylesheets, withoutComments } from "./literal-guard";

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

/** Every non-test source under `src/`, repo-relative, comments removed. */
const code = new Map<string, string>(
  filesUnder(SRC)
    .map((path) => relative(ROOT, path))
    .filter((path) => !/\.test\.tsx?$/.test(path) && !path.endsWith(".d.ts"))
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
  ];
  // The composer is the one component that takes a keystroke of its own
  // (Story 2.3): Enter sends and Shift+Enter is a newline. It is exempt from
  // the key sweep as a file, not as a directory, and nothing else in chat/ is.
  const COMPOSER = "src/renderer/ui/chat/composer.tsx";
  const KEY_PATTERN =
    /\bonKey(?:Down|Up|Press)(?:Capture)?\b|\bonkey(?:down|up|press)\s*=|\baddEventListener\(\s*['"]key|\bkey(?:down|up|press)\b|\.key\s*===?|\b(?:event|evt|ev|e)\.code\b|\bKeyboardEvent\b|\b(?:meta|ctrl)Key\b/;

  it("handles no key outside the team, the outputs and the shared roving code", () => {
    const outside = RENDERER_CODE.filter(
      (path) =>
        path !== COMPOSER &&
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

  it("has no input, select, editable region, dialog, combobox or search role", () => {
    expect(
      offenders(
        RENDERER_CODE,
        /<(?:input|select|dialog)\b|contentEditable|role=["'](?:dialog|combobox|search|searchbox|menu|listbox)|role:\s*["'](?:dialog|combobox|search|searchbox)|aria-modal|type=["']search/,
      ),
    ).toEqual([]);
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

    expect(chain).toContain("installApplicationMenu(app.isPackaged)");
    expect(
      chain.indexOf("installApplicationMenu(app.isPackaged)"),
    ).toBeLessThan(chain.indexOf("openProjectWindow()"));
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
      "src/renderer/ui/outputs/row-groups.ts",
      "src/renderer/ui/outputs/row-groups.ts",
    ]);
    for (const { path, call } of sorts) {
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
    // its spec requires; that is the one, and it is an attribute, not a spinner.
    expect(
      offenders(RENDERER_CODE, /aria-busy|role=["']progressbar|<progress\b/i),
    ).toEqual(["src/renderer/ui/chat/run-card.tsx: aria-busy"]);
    expect(
      (code.get("src/renderer/ui/chat/run-card.tsx") ?? "").match(/aria-busy/g),
    ).toHaveLength(1);
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

  it("forces no reload, saves and writes nothing in main but the transcript store", () => {
    expect(
      offenders(
        MAIN_CODE.filter((path) => !path.endsWith(TRANSCRIPT_STORE)),
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
  it("names no audio element, API or flag in any source", () => {
    expect(
      offenders(
        ALL_CODE,
        /<audio|<video|\bnew Audio\b|\bAudioContext\b|webkitAudioContext|\.play\(|\bNotification\b|\bshell\.beep\b|\bbeep\b|speechSynthesis|\bappendSwitch\b|\bautoplay\b/i,
      ),
    ).toEqual([]);
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
      // Story 3.1: the run card's caret, at the tail of prose being written.
      "ui/chat/run-card.css: .run-card-caret",
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
    // the frame is injected in one place. It animates and scrolls nothing.
    expect(
      offenders(
        RENDERER_CODE,
        /\brequestAnimationFrame\b|\.animate\(|\bscrollIntoView\b|behavior:\s*['"]smooth/,
      ),
    ).toEqual(["src/renderer/ui/chat/use-conversation.ts: requestAnimationFrame"]);
    expect(
      (code.get("src/renderer/ui/chat/use-conversation.ts") ?? "").match(/\brequestAnimationFrame\b/g),
    ).toHaveLength(1);
    expect(
      offenders(RENDERER_CODE, /\.scroll(?:Top|To|By)\b/),
    ).toEqual([]);
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
    "ui/chat/run-card.css: .run-card-foot": {
      kind: "restated",
      why: "the `also written` line naming the run's other files; each is a row of the rail under its own name at --dim or above, and the card follows one document, never these",
    },
    "ui/chat/skill-row.css: .skill-row-label": {
      kind: "label",
      why: "the row's `<Persona> can` lead-in; the composer and the header name the persona, and each button carries its own words at --text",
    },
    "ui/chat/skill-row.css: .skill-more": {
      kind: "restated",
      why: "the `+N more` / `fewer` toggle on a long menu; the entries it hides are the same buttons it reveals, and the row reads as complete at five without it",
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
  const HANDOFF = "src/main/session-handoff.ts";

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

  it("authors the handoff text with no claim that context continues and no restart or cleared framing", () => {
    const text = code.get(HANDOFF) ?? "";

    expect(text).toContain("function handoffFor");
    expect(text).toContain("handed off · ");
    expect(text).toContain(" → ");
    expect(text).toContain(" · picking up from ");
    expect(text).not.toMatch(/context|continu|new thread|cleared|restart|resum/i);
  });

  it("orders the written files by when they were written: no sort in the fold or the bridge that keeps them", () => {
    expect(
      offenders(
        ["src/main/fold/written-paths.ts", BRIDGE, HANDOFF],
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

    // Thirteen before Story 2.11, whose one new method is closeSession, and Story 3.1's
    // dispatchMenu; none is the handoff's.
    expect([...preload.matchAll(/^ {2}([a-zA-Z]+): (?:async )?\(/gm)]).toHaveLength(15);
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
        /aria-(?:pressed|selected|disabled|checked|current)|\bdisabled\b|\bchosen\b|\bselected\b|\brecommend|\bdefault\b|:hover|:active|\.sort\(|\btoSorted\(|\.reverse\(|\blean\b|\bpreferred\b|\bbest\b/i,
      );
    }
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
      expect(code.get(path) ?? "", path).not.toMatch(/decision|choose|answer/i);
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
    // The persona's turn hands `Words` its text whole, with the block drawn after it.
    expect(turn).toContain("<Words text={text} />");
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

  it("closes through the declared session.close and builds no stop control or document card (both are Epic 3's)", () => {
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
    expect(hook.match(/bridge\.closeSession\(/g)).toHaveLength(1);
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
  const HANDOFF = "src/main/session-handoff.ts";
  const APP = "src/renderer/ui/app.tsx";
  const TURN = "src/renderer/ui/chat/turn.tsx";
  const TRANSCRIPT = "src/renderer/ui/chat/transcript.tsx";
  const SYSLINE = "src/renderer/ui/chat/sysline.tsx";
  const BLOCK_COMPONENT = "src/renderer/ui/chat/decision-block.tsx";

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

    it("reads no menu, skill, code or description anywhere in chat/, the persona's own description apart", () => {
      // Story 3.1 puts the skill row in chat/ on purpose: it draws a persona's
      // codes and descriptions above the composer and hands a code to main. It is
      // swept for what it may not do in its own describe below; here it is set
      // apart, and the code it hands on passes through the conversation's one
      // `runSkill(agentId, code)` and the bridge's `dispatchMenu(sessionId, code)`.
      const ROW = "src/renderer/ui/chat/skill-row.tsx";
      expect(CHAT_CODE).toContain(ROW);
      const rest = CHAT_CODE.filter((path) => path !== ROW);
      expect(
        offenders(rest, /\bmenus?\b|\bskills?\b|\bMenuEntry\b|\bcodes\b/i),
      ).toEqual([]);
      expect(
        rest.flatMap((path) =>
          [...(code.get(path) ?? "").matchAll(/^.*\bcode\s*:.*$/gm)].map(([line]) => `${path}: ${line.trim()}`),
        ),
      ).toEqual([
        "src/renderer/ui/chat/use-conversation.ts: dispatchMenu(sessionId: string, code: string): Promise<string>",
        "src/renderer/ui/chat/use-conversation.ts: runSkill(agentId: string, code: string): void",
        "src/renderer/ui/chat/use-conversation.ts: runSkill: (agentId: string, code: string) => void",
        "src/renderer/ui/chat/use-conversation.ts: (agentId: string, code: string) => conversation.current?.runSkill(agentId, code),",
      ]);
      // The `.code` in chat/ outside the row is the error code of a refused send or dispatch, never a menu's.
      expect(
        rest.flatMap((path) =>
          [...(code.get(path) ?? "").matchAll(/\w[\w.()]*\.code\b/g)].map(([hit]) => `${path}: ${hit}`),
        ),
      ).toEqual([
        "src/renderer/ui/chat/use-conversation.ts: asHarnessError(reason).code",
        "src/renderer/ui/chat/use-conversation.ts: asHarnessError(reason).code",
      ]);
      const descriptions = rest.flatMap((path) =>
        [...(code.get(path) ?? "").matchAll(/[\w.]*\.description\b/g)].map(
          ([hit]) => `${path}: ${hit}`,
        ),
      );
      // The chat header's quiet line is the roster's own description of the persona.
      expect(descriptions).toEqual([
        "src/renderer/ui/chat/chat-header.tsx: agent.description",
        "src/renderer/ui/chat/chat-header.tsx: agent.description",
      ]);
    });

    it("parses no leading `/` and no other prefix anywhere between the composer and the session", () => {
      const SLASH =
        /\/\^\\\/|startsWith\(\s*['"`]\/|\bcharAt\(\s*0\s*\)\s*===?\s*['"`]\/|\[\s*0\s*\]\s*===?\s*['"`]\/|\^\/[a-z]/;
      const PROCESS = "src/main/sources/session/session-process.ts";
      expect(code.has(PROCESS), PROCESS).toBe(true);
      const BETWEEN = [...CHAT_CODE, APP, BRIDGE, PROCESS];

      expect(offenders(BETWEEN, SLASH)).toEqual([]);
      const composer = code.get("src/renderer/ui/chat/composer.tsx") ?? "";
      // The composer hands the trimmed draft on and looks at no character of it.
      expect(composer).toContain("onSend(text.trim())");
      expect(composer).not.toMatch(/\.(?:startsWith|charAt|match|test|split|replace|slice|indexOf)\(/);
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
      expect(send).toContain("recordUserTurn(target.arg, at)");
      expect(checked).toContain("return { ok: true, service, entry, arg }");
      expect(write).toContain("entry.session?.write(text)");
      for (const body of [send, write, checked]) {
        expect(body).not.toMatch(/\b(?:text|arg)\s*(?:=[^=]|\.(?:replace|trim|slice|split|startsWith|match))/);
      }
    });

    it("draws no completion surface: no listbox, datalist, autocomplete, active descendant or popup", () => {
      expect(
        offenders(
          RENDERER_CODE,
          /\blistbox\b|<datalist\b|\blist=["{]|aria-autocomplete|aria-activedescendant|aria-haspopup|aria-controls|aria-owns|autoComplete|\bcompletions?\b|\bsuggest/i,
        ),
      ).toEqual([]);
    });
  });

  describe("a persona's turn carries no tooltip and no chrome derived from a skill", () => {
    it("has no `title=`, `data-*`, `aria-describedby`, tooltip, popover or CSS `attr(` anywhere in the renderer", () => {
      expect(
        offenders(
          RENDERER_ALL,
          /(?<![\w-])title\s*=|(?<![\w-])data-[a-z]|aria-describedby|role=["']tooltip|\btooltip\b|\bpopover\b|\battr\(|\bdataset\b|\bsetAttribute\(/i,
        ),
      ).toEqual([]);
    });

    it("builds the turn, the transcript, the sysline and the decision block from no menu entry", () => {
      for (const path of [TURN, TRANSCRIPT, SYSLINE, BLOCK_COMPONENT]) {
        const text = code.get(path) ?? "";
        const imports = [...text.matchAll(/^import\b[^;]*?from\s+['"]([^'"]+)['"]/gm)].map(
          ([, from]) => from,
        );

        expect(imports.filter((from) => /team|menu|skill|install-state|use-install/.test(from)), path).toEqual([]);
        expect(text, path).not.toMatch(/\bmenus?\b|\bskills?\b|\bMenuEntry\b|\.code\b|\.description\b/i);
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

    it("resolves a handoff in `App` alone, and opens a session for it from the user's send or tile only", () => {
      const app = code.get(APP) ?? "";
      expect(app.match(/\bhandoffTarget\(/g)).toHaveLength(1);
      // The call sits inside the composer's `onSend`, which only the user's send runs.
      const send = app.slice(app.indexOf("onSend={"));
      expect(send.indexOf("handoffTarget(")).toBeGreaterThan(-1);
      expect(app.slice(0, app.indexOf("onSend={"))).not.toContain("handoffTarget(");
      // `activate` is called from the tile, from the composer's `@` and from nowhere else.
      expect(app.match(/conversation\.activate\(/g)).toHaveLength(2);
      for (const path of RENDERER_CODE.filter((p) => p !== APP && p !== "src/renderer/ui/chat/use-conversation.ts")) {
        expect(code.get(path) ?? "", path).not.toMatch(/\.activate\(/);
      }
    });

    it("writes a handoff sysline from the open's reply alone: `handoffFor` is defined once and called once", () => {
      const bridge = code.get(BRIDGE) ?? "";
      const open = bridge.slice(bridge.indexOf("function openSession"), bridge.indexOf("function sendTurn"));

      // Typed on the handlers' context, built by the composer, and called once, inside the open handler.
      expect(bridge.match(/\bhandoffFor\b/g)).toHaveLength(3);
      expect(bridge.match(/\bhandoffFor\(/g)).toHaveLength(1);
      expect(open.match(/\bhandoffFor\(/g)).toHaveLength(1);
      expect(code.get(HANDOFF)?.match(/\bfunction handoffFor\b/g)).toHaveLength(1);
      expect(
        offenders(MAIN_CODE.filter((path) => path !== BRIDGE && path !== HANDOFF), /\bhandoffFor\b|recordSysline/).map((hit) => hit.split(":")[0]),
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

      expect(
        hits.filter((hit) => !hit.startsWith("src/renderer/ui/status/persona-state.ts: working")),
      ).toEqual([]);
      expect(hits).toEqual(["src/renderer/ui/status/persona-state.ts: working"]);
      // The word is rendered through the state text and written nowhere else.
      expect(
        offenders(RENDERER_CODE, /\bworking\b/).map((hit) => hit.split(":")[0]),
      ).toEqual(["src/renderer/ui/status/persona-state.ts"]);
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
        ),
        // Story 3.1: the run card's `aria-busy` while its run is in flight is the one.
      ).toEqual(["src/renderer/ui/chat/run-card.tsx: aria-busy"]);
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
      expect([...(code.get("src/renderer/ui/chat/transcript-entry.ts") ?? "").matchAll(/kind:\s*'(\w+)'/g)].map(([, kind]) => kind)).toEqual([
        "persona",
        "user",
        "sysline",
        "run",
      ]);
    });
  });

  describe("the whole epic is silent and badge-free", () => {
    it("names no sound, Dock, badge, bounce, progress, attention or notification API in any source, preload and shared included", () => {
      expect(
        offenders(
          ALL_CODE,
          /\bflashFrame\b|\brequestUserAttention\b|\bsetProgressBar\b|\bsetOverlayIcon\b|\bsetBadgeCount\b|\bbadgeCount\b|\bBadgeCount\b|\bapp\.dock\b|\bdock\b|\bbounce\b|\bsetBadge\b|\bsetTrayTitle\b|\bnew Tray\b|\bTray\b|\bNotification\b|\bshowNotification\b|\bshell\.beep\b|\bbeep\b|\bsystemPreferences\.(?:setUserDefault|postNotification|subscribeNotification)|\bsetWindowButtonVisibility\b|\bsetDocumentEdited\b|\bsetRepresentedFilename\b|\bnew Audio\b|\bAudioContext\b|<audio|<video|\.play\(/,
        ),
      ).toEqual([]);
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
    expect(
      offenders(
        RENDERER_CODE,
        /\.action\b|['"]prompt['"]|['"]skill['"]|ResolvedMenuEntry/,
      ),
    ).toEqual([]);
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
    expect(rule).toContain("var(--faint)");
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
    expect(offenders(RENDERER_CODE, /\.scroll(?:Top|To|By)\b|\bscrollIntoView\b|\.animate\(/)).toEqual([]);
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

  it("reads the sources it claims to sweep", () => {
    for (const path of [...CARD_SOURCES, CARD_CSS]) {
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
    const css = code.get(CARD_CSS) ?? "";
    expect(css.match(/animation\s*:/g)).toHaveLength(1);
    expect(css).toMatch(/\.run-card-caret\s*\{[^}]*animation\s*:/);
  });
});
