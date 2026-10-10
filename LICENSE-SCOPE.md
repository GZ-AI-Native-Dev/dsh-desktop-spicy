# License scope

The [MIT license](LICENSE) at the root of this repository covers **only the
original files authored for it**:

| File | What it is |
| --- | --- |
| `install.sh` | backup → rsync into an installed `.app` → ad-hoc re-sign |
| `restore-node.sh` | restore the Node v24.9.0 runtime binary git cannot hold |
| `verify.sh` | file count / size / 100 MiB limit / HEAD parity check |
| `README.md` | documentation |
| `THIRD_PARTY_NOTICES.md` | generated per-package license list |
| `MANIFEST.sha256` | generated sha256 integrity manifest |
| `runtime-fixes/0.11.1-windows/*.ps1`, `patch-asar.cjs`, `test-*.cjs`, `manifest.json`, `README.md` | Windows overlay tooling, tests, integrity metadata and documentation |
| `.github/workflows/windows-preview.yml` | isolated Windows/Linux overlay tests |

The three JavaScript bundles in `runtime-fixes/0.11.1-windows/` and their
corresponding `.patch` files are derived from the MIT-licensed upstream
`@deepseek-ai` packages. Their upstream ownership and license notices remain
applicable; they are not claimed as wholly original works by this repository.

## What it does NOT cover

Everything under the mirrored payload is **someone else's work**, redistributed
here verbatim. This repository claims no copyright over any of it.

| Path | Owner | License |
| --- | --- | --- |
| `app/out/`, `app/package.json`, `*.patch.yml`, `*.html`, `*.mjs`, `icon.*`, `*.lproj/` | **DSH Desktop** — DataElement · Beijing Shuju Xiangsu Intelligence Technology Co., Ltd. | Compiled from the MIT-licensed upstream project <https://github.com/dataelement/dsh-desktop> |
| `app/node_modules/@deepseek-ai/**` (242 packages) | DeepSeek | MIT (2 × BSD-3-Clause) |
| `app/node_modules/**` (358 other packages) | their respective authors | see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) |
| the Electron runtime | — | **not mirrored here** (`Contents/Frameworks/` is excluded) |

## Two licenses worth reading before redistributing

| Package | License | Note |
| --- | --- | --- |
| `@img/sharp-libvips-darwin-arm64@1.3.3` | **LGPL-3.0-or-later** | Prebuilt libvips binary backing `sharp`. The LGPL permits binary redistribution but requires that recipients be able to replace/relink the library and obtain its source. Source: <https://github.com/lovell/sharp-libvips> · <https://github.com/libvips/libvips>. **Evaluate this yourself before any commercial redistribution.** |
| `jszip@3.10.2` | MIT **OR** GPL-3.0-or-later | Dual-licensed; used here under MIT. |

## Trademarks

"DSH Desktop" and "DeepSeek" are marks of their respective owners. This mirror
is unaffiliated with and not endorsed by either.
