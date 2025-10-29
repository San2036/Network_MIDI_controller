# JCMP vs TCP Protocol Analysis Guide

This guide explains how to automate the comparison between TCP (WebSocket immediate) and your JCMP protocol (WebRTC + adaptive jitter buffer).

## Prerequisites

```bash
pip install matplotlib numpy
```

## Quick Start

### 1. Collect Data

#### Method A: Server Logs (Recommended)

Start your server with debug enabled and save output:

**Windows PowerShell:**
```powershell
$env:JCMP_DEBUG=1; node server.js | Tee-Object -FilePath .\server-log.txt
```

**Mac/Linux:**
```bash
JCMP_DEBUG=1 node server.js | tee server-log.txt
```

Then run your tests:
1. **TCP Mode Test:**
   - Toggle to "TCP" in browser header
   - Play steady metronome (tap piano key every 500ms) for 2-3 minutes
   - Watch terminal for "🎯 WS lane: noteOn (latency=Xms)" logs

2. **JCMP Mode Test:**
   - Toggle to "JCMP" in browser header
   - Play same steady pattern for 2-3 minutes
   - Watch terminal for "JCMP Debug: PlaybackError=Xms, InterPlayback=Xms" logs

Stop server and save the log file.

#### Method B: Dev Stats Snapshots

1. Run server (debug mode optional):
   ```bash
   node server.js
   ```

2. Open Dev page in browser (`/dev` route)

3. For each test (TCP mode, then JCMP mode):
   - Play metronome pattern for 2-3 minutes
   - Scroll to "Raw" JSON section
   - Copy the entire JSON object
   - Save as `data/tcp_test_1.json` or `data/jcmp_test_1.json`

   Repeat for multiple test runs:
   - `tcp_test_1.json`, `tcp_test_2.json`, ...
   - `jcmp_test_1.json`, `jcmp_test_2.json`, ...

4. Helper script:
   ```bash
   python collect_data.py  # Creates data/ directory and template
   ```

### 2. Run Analysis

#### Basic Analysis (Log File Only)

```bash
python analyze_jcmp.py --log server-log.txt
```

This will:
- Parse latency and jitter metrics from logs
- Generate comparison statistics
- Create visualization plots (`jcmp_analysis.png`)

#### Full Analysis (Logs + Dev Stats)

```bash
python analyze_jcmp.py --log server-log.txt --dev-stats data/
```

#### Export CSV for Report

```bash
python analyze_jcmp.py --log server-log.txt --csv
```

## Output Files

### 1. `jcmp_analysis.png`

Four-panel visualization:
- **Top Left:** Latency distribution comparison (histogram)
- **Top Right:** Timing consistency over time (TCP inter-arrival vs JCMP inter-playback)
- **Bottom Left:** JCMP playback error distribution
- **Bottom Right:** Adaptive buffer size evolution

### 2. `analysis_results.csv`

Statistical summary table with metrics like:
- Latency mean, stddev, p95
- Jitter variance
- Playback error statistics

### 3. Console Output

Detailed statistics printed to terminal:
- TCP metrics (latency, jitter)
- JCMP metrics (latency, jitter, playback accuracy)
- Comparison analysis (improvements, trade-offs)

## Understanding Metrics

### Latency (One-way)
- **TCP:** Network arrival time minus client timestamp
- **JCMP:** Same, but messages are buffered before playback

### Jitter
- **TCP Inter-arrival:** Variance in time between message arrivals
- **JCMP Inter-playback:** Variance in time between actual playback events
- **Goal:** JCMP should have much lower jitter (~0-5ms) vs TCP (20-60ms+)

### Playback Error (JCMP only)
- Difference between scheduled playback time and actual playback time
- **Target:** <5ms mean, <10ms p95

### Buffer Size Evolution (JCMP only)
- Shows how adaptive buffer adjusts to network conditions
- Should stabilize around p95 latency + safety margin

## Test Scenarios for Report

### 1. Baseline (Good Network)
- Measure both modes on stable Wi-Fi
- **Expected:** JCMP adds fixed latency but eliminates jitter

### 2. Network Jitter Only
- Add artificial jitter (50ms ± 20ms) using network tools
- **Windows:** Clumsy (`clumsy.exe -d eth0 -j 50,20`)
- **Mac/Linux:** `sudo tc qdisc add dev eth0 root netem delay 50ms 20ms`
- **Expected:** JCMP buffers smooth out jitter; TCP shows irregular timing

### 3. Packet Loss
- Add 3-5% packet loss
- **Expected:** JCMP may drop occasional notes; TCP may stutter/retransmit

### 4. Variable Latency (Mobile Movement)
- Walk away from router while playing
- **Expected:** JCMP buffer adapts upward; TCP shows high variance

## Report Sections

Based on your analysis, your report should include:

### 1. Introduction
- Problem: TCP's Head-of-Line blocking and lack of jitter control
- Solution: JCMP protocol (WebRTC + adaptive buffer)

### 2. Methodology
- Test setup (devices, network conditions)
- Metrics collected
- Tools used (this script, server logs, Dev Stats)

### 3. Results
- Statistical comparison tables
- Visualization plots (from `jcmp_analysis.png`)
- Key findings:
  - Jitter reduction percentage
  - Latency trade-off analysis
  - Playback accuracy metrics

### 4. Discussion
- Trade-offs: Fixed latency increase vs jitter elimination
- Performance under different network conditions
- Use cases (real-time music, gaming, etc.)

### 5. Conclusion
- JCMP achieves stable timing at cost of adaptive latency
- TCP provides lower baseline latency but suffers from jitter

## Example Analysis Output

```
📊 ANALYSIS RESULTS
============================================================

🔵 TCP (WebSocket Immediate) Mode:
  Latency: mean=45.23ms, median=43.00ms
           stddev=12.45ms, p95=68.20ms
  Inter-arrival jitter: mean=500.15ms
                       stddev=28.43ms
                       variance=808.64ms²

🟢 JCMP (RTC + Adaptive Buffer) Mode:
  Latency: mean=87.50ms, median=85.00ms
           stddev=3.21ms, p95=95.00ms
  Inter-playback jitter: mean=500.02ms
                        stddev=1.23ms
                        variance=1.51ms²
  Playback error: mean=2.15ms, median=1.80ms
                  max=8.50ms, p95=5.20ms

📈 Comparison:
  Jitter reduction: 95.7% (TCP: 28.43ms → JCMP: 1.23ms)
  Latency overhead: +42.27ms (buffer trade-off)
  Playback accuracy: 2.15ms avg error (target: <5ms)
```

## Troubleshooting

### No latency data in logs?
- Make sure `JCMP_DEBUG=1` is set
- Check that messages include `timestamp` field
- Verify server console shows latency logs

### Missing playback error data?
- Ensure JCMP mode is active (not TCP)
- Check that RTC DataChannel opened successfully
- Verify playback queue is active (check queue length in Dev Stats)

### Plots look empty?
- Verify data was collected (check array lengths in console output)
- Ensure test ran long enough (2-3 minutes minimum)
- Check log file format matches expected patterns

## Advanced: Multiple Test Runs

To compare multiple scenarios:

1. Create separate log files:
   - `server-log-baseline.txt`
   - `server-log-jitter.txt`
   - `server-log-loss.txt`

2. Run analysis for each:
   ```bash
   python analyze_jcmp.py --log server-log-baseline.txt --output baseline_analysis.png
   python analyze_jcmp.py --log server-log-jitter.txt --output jitter_analysis.png
   ```

3. Combine results in your report with side-by-side comparisons

## Need Help?

Check the parsed metrics in console output - if arrays are empty, verify:
- Log file format matches expected patterns
- Test duration was sufficient (2-3 minutes)
- Correct mode was active during test (TCP vs JCMP)

