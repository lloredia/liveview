#!/bin/bash
# Take App Store screenshots on different simulators
# Requires the app to be installed on each simulator

SCREENSHOTS_DIR="$(dirname "$0")/../screenshots"
mkdir -p "$SCREENSHOTS_DIR"

echo "📱 Take screenshots manually in the simulator, then save them to:"
echo "   $SCREENSHOTS_DIR"
echo ""
echo "Required sizes for App Store:"
echo "  • iPhone 6.9\" (iPhone 16 Pro Max): 1320 x 2868"
echo "  • iPhone 6.3\" (iPhone 16 Pro): 1206 x 2622"
echo "  • iPad 13\" (iPad Pro): 2064 x 2752"
echo ""
echo "Recommended screenshots (5-10):"
echo "  1. Today view with live matches"
echo "  2. Match detail with scores"
echo "  3. League standings"
echo "  4. Sidebar with leagues"
echo "  5. News feed"
echo "  6. Dark mode view"
echo "  7. Light mode view"
