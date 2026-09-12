#!/bin/sh
set -eu

# Keep the published controller's optional allocator behavior. The native
# runtime deliberately selects its own architecture; only the controller JAR
# is copied from the immutable upstream image.
jemalloc_path="/usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2"
if [ -f "$jemalloc_path" ]; then
  export LD_PRELOAD="${LD_PRELOAD:+${LD_PRELOAD}:}${jemalloc_path}"
fi

if [ -z "${JAVA_OPTS:-}" ]; then
  JAVA_OPTS="-XX:MaxRAMPercentage=50.0"
fi

exec java $JAVA_OPTS -jar /app/controller-bundled.jar
