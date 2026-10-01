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
  const KEY_PATTERN =
    /\bonKey(?:Down|Up|Press)(?:Capture)?\b|\bonkey(?:down|up|press)\s*=|\baddEventListener\(\s*['"]key|\bkey(?:down|up|press)\b|\.key\s*===?|\b(?:event|evt|ev|e)\.code\b|\bKeyboardEvent\b|\b(?:meta|ctrl)Key\b/;

  it("handles no key outside the team, the outputs and the shared roving code", () => {
    const outside = RENDERER_CODE.filter(
      (path) => !KEY_SURFACES.some((root) => path.startsWith(root)),
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

  it("has no input, textarea, select, editable region, dialog, combobox or search role", () => {
    expect(
      offenders(
        RENDERER_CODE,
        /<(?:input|textarea|select|dialog)\b|contentEditable|role=["'](?:dialog|combobox|search|searchbox|menu|listbox)|role:\s*["'](?:dialog|combobox|search|searchbox)|aria-modal|type=["']search/,
      ),
    ).toEqual([]);
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
  it("reloads, saves and writes nothing in main", () => {
    expect(
      offenders(
        MAIN_CODE,
        /\bforceReload\b|\breloadIgnoringCache\b|\.reload\(|role:\s*['"](?:reload|forceReload)|CommandOrControl|\bsaveAs\b|\bshowSaveDialog\b|\bsave\b|\bwriteFile(?:Sync)?\b|\bappendFile(?:Sync)?\b|\bcreateWriteStream\b/,
      ),
    ).toEqual([]);
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
