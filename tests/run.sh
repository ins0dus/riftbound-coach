#!/bin/sh
# Regression tests: every past coach mistake is a saved board here. All must pass before a release.
cd "$(dirname "$0")" && python3 ../src/build.py >/dev/null || exit 1
[ -d node_modules/jsdom ] || npm i --silent jsdom >/dev/null 2>&1
fail=0; for t in test.js t[0-9]*.js; do case $t in *_run.js|coach2.built.js) continue;; esac; node "$t" >/dev/null 2>&1 && echo "PASS $t" || { echo "FAIL $t"; fail=1; }; done
echo "--- replays ---"; node replay.js || fail=1
exit $fail
