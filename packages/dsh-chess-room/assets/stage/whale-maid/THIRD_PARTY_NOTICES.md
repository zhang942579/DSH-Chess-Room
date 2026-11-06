# Whale-maid board-local stage: provenance and restrictions

## Images — no upstream pet artwork reused

All 168 alpha PNG frames were exported from the seven local expression WebP animations derived from the user-supplied whale-maid image. Original source SHA256: `84c38e06f675b615189c848965b77607542b7df9d2ce99c578734d0f8a6f0284`.

Rights statement retained from the expression manifest: **User-supplied avatar; derivative edits for this local request. Original ownership/license not independently verified.** `LicenseRef-User-Provided-Local-Request` is a local provenance label, not a grant of public distribution, commercial use, or rights in third-party character designs. Root source-code licenses do not license these images.

The hair, maid headdress, clothing, whale apron and tail are retained. No visual asset from dsh-pet's whale, whale-refined, ouo-neko, bird or the other repository pets is copied into this pack.

## Supported manifest format, not a sibling API

Reference reviewed: https://github.com/zhu1090093659/dsh-pet/tree/9ed843bccee3d2604ce0ac31f55cbde9bda97c7f (`v0.4.14`, npm `@linxin666/dsh-pet@0.4.14`). Its frames2d contract informed this strictly declared seven-track pack. The code root license is Apache-2.0; it is separate from per-image and character restrictions. Its private GameplayBus, renderer controllers and PetSprite props are not public sibling-plugin services.

The local geometry, motion director, frame player and UI are newly authored. The separately vendored manifest validator (development verification only) is attributed with its full Apache license and transformation notice in the vendor directory. It is not installed as a pet plugin and no global pet config is animated.

## Legacy mechanism preview, not the new AI live stage

The separate 1.2.0 companion Client now uses user-authorized AI action artwork from [AI action notice](../../actions-ai-v1/THIRD_PARTY_NOTICES.md) and [action manifest](../../actions-ai-v1/manifest.json). The seven expression tracks in THIS legacy pack remain unchanged. The following missing-pose/composition description applies only to this pack and its legacy preview, not the companion's seven dedicated action tracks.

Existing expression tracks: idle, thinking, smug, surprised, troubled, victory, defeat. They contain facial/breath/sway motion only. **Dedicated walk, take-stone, hold-stone, place-stone, pout-stomp, punch and arms-crossed tracks are missing.** Positions, estimated palm anchors, temporary sleeves/palm/stone/finger layering, puff/star effects and folded-arm lines are mechanism compositions — not substitutes claimed as dedicated action-frame artwork.

Palm coordinates in [chess-role.json](chess-role.json) are separate from [pet.json](pet.json). Their per-frame template estimates track local breathing/sway; they are not independently verified skeletal or contact-pose anchors. [integrity.json](integrity.json) records the generated frame hashes.

## Isolation and safety

This release exposes an independent simulated board. Preview controls never submit production moves, write accounts or change match outcomes. The existing room may continue its read-only state polling. Director completion, skip, timeout and cancellation only unmask already-confirmed preview stones. Avatar feedback is visual only; no clicks, mouse control or screen-recognition gameplay occurs.

## Public distribution update — 2026-11-06

The maintainer explicitly confirmed public redistribution rights for the current character and derivative artwork. Historical local-only or unverified-redistribution restrictions above are superseded for distribution with DSH Chess Room by that confirmation. The image transformations and hashes remain accurate. See the project ASSET-LICENSE.md; the root MIT source-code license does not automatically license artwork.
