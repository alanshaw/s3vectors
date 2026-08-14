# Reporting runner results

Runners produce one of four outcomes per vector — `pass`, `fail`, `blocked`,
`skipped` (see the [README](../README.md#runner-outcome-semantics)). This page
recommends how to emit those results in a standard test-report format so that
existing CI integrations and text/HTML report generators work out of the box —
no bespoke reporting pipeline needed.

## Recommended: JUnit XML

JUnit XML is the de facto interchange format for test results: GitHub Actions,
GitLab and Jenkins render it natively in their test-summary UIs, and plenty of
standalone renderers exist (e.g. `junit2html`, `xunit-viewer`, Allure imports
it). Emit **one `<testcase>` per vector** using this mapping:

| Vectors concept | JUnit XML |
|---|---|
| vector `id` | `<testcase name="multipart-0007" ...>` |
| area | `classname="multipart"` — per-area grouping in every JUnit UI for free |
| `pass` | testcase with no child element |
| `fail` | `<failure message="step 2: expected 404 NoSuchKey, got 200"/>` |
| `blocked` | `<skipped message="blocked: prerequisite bucket(versioning) failed"/>` |
| `skipped` | `<skipped message="skipped: excluded by tag filter"/>` |
| corpus version, target | suite-level `<properties>` |
| tags (tier etc.) | optional per-case `<properties><property name="tags" value="tier-1,multipart"/></properties>` |

JUnit XML has no native "blocked" state, so it maps to `<skipped>` — always
prefix the message with `blocked:` so reports (and humans) can tell "not
runnable" apart from "deliberately not run". Never map `blocked` to
`<failure>`: one broken prerequisite operation would then read as hundreds of
failures.

Example:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="s3vectors" tests="3" failures="1" skipped="1">
  <testsuite name="multipart" tests="2" failures="1" skipped="0">
    <properties>
      <property name="corpusVersion" value="1.0.0"/>
      <property name="target" value="MinIO RELEASE.2026-07-01"/>
    </properties>
    <testcase name="multipart-0001" classname="multipart"/>
    <testcase name="multipart-0007" classname="multipart">
      <failure message="step 3: expected 400 InvalidPart, got 200"/>
    </testcase>
  </testsuite>
  <testsuite name="versioning" tests="1" failures="0" skipped="1">
    <testcase name="versioning-0003" classname="versioning">
      <skipped message="blocked: prerequisite bucket(versioning) could not be established"/>
    </testcase>
  </testsuite>
</testsuites>
```

The corpus version is available at runtime from every language package
(`manifest.version` / `manifest()` / `Manifest().Version`) — stamp it into the
report so results are comparable across runs and runners.

## Alternatives

- **[CTRF](https://github.com/ctrf-io/ctrf)** — a modern JSON test-report
  standard, nicer to produce and post-process than XML, with growing tooling
  (GitHub Actions PR summaries, converters to/from JUnit). Map `blocked` to
  status `"other"` with `"extra": { "outcome": "blocked" }`; put the corpus
  version and target under `results.environment`.
- **TAP (Test Anything Protocol)** — the minimal-effort option; trivially
  emitted from any language: `ok 1 - multipart-0001`,
  `not ok 2 - multipart-0007`, `ok 3 - versioning-0003 # SKIP blocked: ...`.
  Thinner report tooling than the other two.

## Whatever format you pick

Preserve these three things and results stay comparable across runners,
languages and targets:

1. the **stable vector id** as the test name (it's the unit of skip-lists and
   cross-run diffing),
2. the **`blocked` vs `fail` distinction** (encoded in the skip message if the
   format lacks a native state),
3. the **corpus version** the run used.
