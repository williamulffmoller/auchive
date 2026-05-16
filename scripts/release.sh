#!/bin/bash
set -e

export PATH="$HOME/.cargo/bin:$PATH"

npm run tauri build

VERSION=$(node -e "const v=require('./package.json').version; console.log(v.replace(/\\.0\$/, ''))")
APP="src-tauri/target/release/bundle/macos/Auchive.app"
DMG="src-tauri/target/release/bundle/dmg/Auchive_${VERSION}.dmg"

echo "Signing..."
codesign --force --deep --sign - "$APP"

echo "Creating DMG..."
TMPDIR=$(mktemp -d)
cp -r "$APP" "$TMPDIR/"
ln -sf /Applications "$TMPDIR/Applications"
hdiutil create -volname "Auchive" -srcfolder "$TMPDIR" -ov -format UDZO "$DMG"
rm -rf "$TMPDIR"

echo "Done: $DMG"
