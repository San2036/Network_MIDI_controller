#!/bin/bash
# Quick test script - generates sample log data and runs analysis

echo "🧪 Generating test log data..."

cat > test-server-log.txt << 'EOF'
🎯 WS lane: noteOn (latency=23ms)
🎯 WS lane: noteOn (latency=45ms)
🎯 WS lane: noteOn (latency=28ms)
🎯 WS lane: noteOn (latency=67ms)
🎯 WS lane: noteOn (latency=31ms)
JCMP Debug: PlaybackError=2ms, InterPlayback=500ms
JCMP Debug: PlaybackError=1ms, InterPlayback=501ms
JCMP Debug: PlaybackError=3ms, InterPlayback=499ms
JCMP Debug: PlaybackError=2ms, InterPlayback=500ms
JCMP Debug: RTC latency=25ms, bufferSizeMs=45
JCMP Debug: RTC latency=27ms, bufferSizeMs=46
EOF

echo "✅ Test log created: test-server-log.txt"
echo ""
echo "📊 Running analysis..."
python analyze_jcmp.py --log test-server-log.txt --csv

echo ""
echo "✅ Test complete! Check jcmp_analysis.png and analysis_results.csv"

