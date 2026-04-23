# Instruction 025: Cloud SearchPodcasts Relevance And Stopword Policy

This instruction is intentionally deferred. Do not implement yet. Use it as the discussion and decision record for `searchPodcasts` relevance filtering and stop-word handling.

## 1. Problem Statement

`searchPodcasts` currently performs a local relevance gate after Apple Search returns results. That gate is intentionally simple, but the token policy is not fully settled yet:

- should Readio trust Apple Search ranking more, or keep a local precision gate
- should weak tokens such as `the` participate in matching
- should stop-word handling exist at all
- if stop-word handling exists, how aggressive should it be
- how should the policy behave for multilingual queries

We want to keep discussing this before implementation hardens.

## 2. Current State

- Apple Search is the first-hop recall source.
- Readio keeps a local relevance filter for `searchPodcasts`.
- Current matching is lightweight and intentionally explainable.
- The route should remain precision-oriented, but not become over-engineered.

## 3. Open Questions

1. Should `searchPodcasts` continue to apply a local relevance filter after Apple returns results
2. If yes, should matching stay token-based or move to a different lightweight strategy
3. Should stop words be ignored
4. If stop words are ignored, should that be:
   - no stop-word list at all
   - a tiny curated list
   - a language-specific list
5. What fallback should apply if stop-word removal empties the token set
6. Should weak-token filtering be based on:
   - token length
   - stop-word list
   - both

## 4. Current Recommendation

If this work is resumed later, start from the most conservative policy:

- keep the local relevance filter
- do not introduce a large stop-word dictionary
- prefer minimal token hygiene first:
  - trim
  - lowercase
  - remove empty tokens
  - optionally remove single-character tokens
- if a tiny stop-word set is introduced, require a safe fallback:
  - when filtering removes all tokens, fall back to the original token set

## 5. Non-Goals

- Do not redesign Apple Search ranking
- Do not add heavy NLP or fuzzy-search infrastructure
- Do not widen this into episode search, top routes, or frontend query UX
- Do not implement multilingual search normalization in this instruction

## 6. Suggested Discussion Inputs

Before implementation, review:

- real examples of Apple Search returning obviously weak `searchPodcasts` matches
- real examples where aggressive token filtering would wrongly drop valid shows
- English and non-English query examples
- whether product prefers higher precision or higher recall for first-hop podcast search

## 7. Acceptance Criteria For A Future Follow-Up

Only implement after these are explicitly decided:

- whether stop-word handling exists
- the exact token filtering rule
- the fallback rule when filtered tokens become empty
- whether the same policy should or should not apply to `searchEpisodes`

## 8. Status

- **State**: Deferred pending product/engineering discussion
- **Implementation**: Not started by design
