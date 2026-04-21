#!/bin/bash
set -e
cd "$(dirname "$0")/App"
# Write to Xcode's default archive location so the result shows up in
# Organizer automatically (Xcode → Window → Organizer).
STAMP=$(date "+%Y-%m-%d_%H-%M-%S")
ARCHIVES_DIR="$HOME/Library/Developer/Xcode/Archives/$(date '+%Y-%m-%d')"
mkdir -p "$ARCHIVES_DIR"
ARCHIVE_PATH="$ARCHIVES_DIR/LiveView-$STAMP.xcarchive"
xcodebuild \
  -workspace App.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  ENABLE_USER_SCRIPT_SANDBOXING=NO \
  archive
echo
echo "✅ Archive written to: $ARCHIVE_PATH"
echo "Open Xcode → Window → Organizer — it should appear at the top of the list."
