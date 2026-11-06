# Third-party notices

Project-authored source code and documentation are licensed under the root MIT LICENSE. Character images and image data embedded in JavaScript have the separate terms in ASSET-LICENSE.md.

## dsh-pet manifest validator

- Upstream: https://github.com/zhu1090093659/dsh-pet
- Package: @linxin666/dsh-pet v0.4.14
- Commit: 9ed843bccee3d2604ce0ac31f55cbde9bda97c7f
- License: Apache-2.0, retained at packages/dsh-chess-room/vendor/dsh-pet-manifest/LICENSE
- Copies: original manifest-v2.ts and gameplay.ts, and the bundled validator.js
- Modifications: TypeScript removal and bundling using esbuild; the validator's business rules are unchanged. Provenance and source hashes are in UPSTREAM.json.

The validator is used for development validation only. It does not install dsh-pet, import its character artwork, or expose a public pet movement API.

## Dependencies and host-provided components

zod is a runtime dependency under its own MIT license. esbuild is a development dependency under its own MIT license. DeepSeekHarness supplies React and the native DSH services; these services are not copied into the repository. Python image-processing tools use Pillow and numpy under their respective licenses.

## User-authorized artwork

Public distribution was explicitly confirmed by the maintainer on 2026-11-06. See ASSET-LICENSE.md and the asset directories for source and transformation details. User profile avatars are loaded at runtime; real account avatars, chat history and saved games are not included in this repository.
