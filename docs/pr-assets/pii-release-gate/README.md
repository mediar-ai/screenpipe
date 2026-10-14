# Privacy settings evidence

Real React settings rendered with the repository's browser development mocks at 1280 × 720, dark theme. All status counts are synthetic. This is browser-preview evidence, not a running native application or real engine status.

- `before.png`: rebased PR head ae26753f7 before adding the processing-status card.
- `after.png`: processing, collapsed details.
- `expanded.png`: separate text and screenshot counts and scope explanation.
- `unavailable.png`: failed status request, processing state explicitly unknown.
- `ready.png`: enabled privacy checks complete.

After images correspond to the implementation committed alongside these assets. Route: `/settings?section=privacy`; state variants use the maintained browser-mock `privacyState` query parameter. The existing unsaved-settings bar is visible because Smart mode was selected for the preview; Apply & restart was not invoked.
