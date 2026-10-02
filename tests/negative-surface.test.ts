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
    expect(
      offenders(RENDERER_CODE, /aria-busy|role=["']progressbar|<progress\b/i),
    ).toEqual([]);
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

  it("has exactly two consumers: the working dot pulses and the tile hint reveals", () => {
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
    expect(
      offenders(
        RENDERER_CODE,
        /\brequestAnimationFrame\b|\.animate\(|\bscrollIntoView\b|behavior:\s*['"]smooth/,
      ),
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

  it("authors the handoff text with no claim that context continues and no restart or cleared framing", () => {
    const bridge = code.get(BRIDGE) ?? "";
    const start = bridge.indexOf("function handoffFor");
    const handler = bridge.indexOf("SESSION_OPEN_CHANNEL,", start);

    expect(start).toBeGreaterThan(-1);
    const text = bridge.slice(start, handler);
    expect(text).toContain("handed off · ");
    expect(text).toContain(" → ");
    expect(text).toContain(" · picking up from ");
    expect(text).not.toMatch(/context|continu|new thread|cleared|restart|resum/i);
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

    // Thirteen before Story 2.11, whose one new method is closeSession; none is the handoff's.
    expect([...preload.matchAll(/^ {2}([a-zA-Z]+): (?:async )?\(/gm)]).toHaveLength(14);
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
    expect(app).toMatch(/onCloseOrphan=\{\(agentId\) => \{\s*void conversation\.close\(/);
    expect(hook.match(/bridge\.closeSession\(/g)).toHaveLength(1);
    expect(hook).not.toMatch(/useEffect\([^)]*close\(/);
  });
});
