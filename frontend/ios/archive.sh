#!/bin/bash
set -e
cd "$(dirname "$0")/App"
rm -rf ~/Desktop/LiveView-1.0-2.xcarchive
xcodebuild \
  -workspace App.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath ~/Desktop/LiveView-1.0-2.xcarchive \
  -allowProvisioningUpdates \
  ENABLE_USER_SCRIPT_SANDBOXING=NO \
  archive
echo
echo "✅ Archive written to: ~/Desktop/LiveView-1.0-2.xcarchive"
echo "Open Xcode → Window → Organizer to upload it."
