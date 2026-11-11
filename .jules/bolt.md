# Bolt's Journal

## 2025-05-18 - Client-side JSON Diffing and Filtering Optimization
**Learning:** In client-heavy static dashboards where data is pulled from large JSON dumps (logs, subtitles, sample data), repeated operations such as `JSON.stringify` comparisons across lists and re-grouping raw subtitles on each keypress cause unnecessary CPU spikes, high allocation rates, and input latency. Pre-grouping data on version load, caching lookup maps (e.g. ID -> record), using fast deep structural equality (`isDeepEqual`) instead of serialization, and limiting filter execution to the active view scope dramatically reduces filter and diff latency.
**Action:** When working with client-side JSON data archives or diff viewers, pre-compute groups and indexed lookup Maps during data ingestion/load, and use structural recursive comparisons instead of string serialization for diffing.
