# Contributing to Platinum

Thanks for helping! A few notes to make it smooth.

## Reporting bugs

Open an issue with:

- your OS and Platinum version (Settings → About),
- what you did, what you expected and what happened,
- for bridge problems: your Mac model, ESP32 board, and the **Bridge log** from Hardware & link → Bridge & network.

## Hardware reports and photos

Built a bridge? Please tell us which Mac and board you used and whether keyboard, mouse and serial worked. Photos are very welcome: add them to `docs/images/` in a pull request, or attach them to an issue.

## Code

```sh
npm ci
npm run dev
```

Before opening a pull request:

```sh
npm run typecheck
npm test
```

- **User-facing text** goes through `t("…")` (or `tx()` when it contains links or markup) with English as the key. Add the translations to every file in `src/i18n/`. If you don't speak a language, put the English text there and say so in the PR, and someone will fill it in. `npm test` lists what's missing.
- **Wiring data** lives in `src/lib/hardware`. If you change it, run `npm run docs:hardware` to regenerate `docs/hardware.md`. CI checks it's up to date.
- **HFS changes** should keep `npm test` green. The tests cross-check our reader and writer against [machfs](https://github.com/elliotnunn/machfs), so you need Python 3 and `pip install machfs`.
- **Protocol changes** must update `docs/protocol.md` together with the firmware and the app.
- Match the style of the surrounding code; keep comments for the *why*.

## Licensing of contributions

Your contributions are licensed under the project's licence, the GPL-3.0-or-later. By opening a pull request you also agree that the project's maintainer may relicense your contribution together with the rest of Platinum in the future (for example to a later GPL version or another open-source licence), so the project can't get stuck. You keep the copyright on your work.

## Never commit

Apple ROMs, system software or other copyrighted disk images. The `.gitignore` blocks the common extensions. Please don't work around it.

## Licence

By contributing you agree that your contribution is licensed under the GPL-3.0-or-later, like the rest of Platinum.
