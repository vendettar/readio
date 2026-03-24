---
description: Split parent for Pause On Dictionary Lookup hardening
---

# Instruction 134: Pause On Dictionary Lookup (Parent / Split)

Goal: coordinate two atomic hardening tasks without re-implementing shipped baseline.

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.zh.mdx`

## Current Baseline (Do Not Rebuild)
The following are already present in code and must be treated as baseline:
- `pauseOnDictionaryLookup` setting key exists.
- `DictionarySettingsSection` exists and uses shared `Switch`.
- `SelectionUI` already uses `createPortal(..., document.body)`.
- Lookup action already gates pause by setting.

## Execution Strategy (Mandatory Split)
Do not implement directly from this parent file.

Execution order:
1. `agent/instructions/lite/134a-pause-on-dictionary-lookup-behavior.md`
2. `agent/instructions/lite/134b-pause-on-dictionary-lookup-positioning.md`

Rules:
- 134b starts only after 134a is reviewed and accepted.
- Keep one active instruction at a time.

## Decision Log
- Required: Waived at parent level; evaluate per child instruction.

## Bilingual Sync
- Required: Yes (fulfilled in child instructions).
