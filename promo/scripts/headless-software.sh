#!/bin/sh
# Avoid Chromium's tiled GPU-raster corruption; use only for Remotion rendering.
# https://github.com/remotion-dev/remotion/issues/11428
: "${TETRIS_CHROME_EXECUTABLE:?Set TETRIS_CHROME_EXECUTABLE to Chrome Headless Shell}"
exec "$TETRIS_CHROME_EXECUTABLE" --disable-gpu-rasterization "$@"
