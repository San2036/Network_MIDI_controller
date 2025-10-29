#!/usr/bin/env python3
"""
RPSV vs TCP Protocol Analysis Tool
Parses server logs and Dev Stats snapshots to compare TCP (WS immediate) vs RPSV (RTC + buffer)
"""

import json
import re
import sys
from pathlib import Path
from collections import defaultdict
from dataclasses import dataclass, field
from typing import List, Dict, Optional
import statistics

try:
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False
    
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False
    if HAS_MATPLOTLIB:
        print("WARNING: numpy not available. Install with: pip install numpy")

if not HAS_MATPLOTLIB:
    print("WARNING: matplotlib not available. Install with: pip install matplotlib numpy")

@dataclass
class MetricSample:
    timestamp: float
    value: float
    protocol: str  # 'tcp' or 'rpsv'

@dataclass
class AnalysisResults:
    protocol: str
    latency_samples: List[MetricSample] = field(default_factory=list)
    inter_arrival_times: List[float] = field(default_factory=list)
    inter_playback_times: List[float] = field(default_factory=list)
    playback_errors: List[float] = field(default_factory=list)
    buffer_sizes: List[MetricSample] = field(default_factory=list)
    
    def latency_stats(self):
        if not self.latency_samples:
            return None
        values = [s.value for s in self.latency_samples]
        return {
            'mean': statistics.mean(values),
            'median': statistics.median(values),
            'stddev': statistics.stdev(values) if len(values) > 1 else 0,
            'min': min(values),
            'max': max(values),
            'p95': np.percentile(values, 95) if HAS_NUMPY else (sorted(values)[int(len(values) * 0.95)] if len(values) > 0 else 0),
            'p99': np.percentile(values, 99) if HAS_NUMPY else (sorted(values)[int(len(values) * 0.99)] if len(values) > 0 else 0),
            'count': len(values)
        }
    
    def jitter_stats(self):
        if not self.inter_arrival_times and not self.inter_playback_times:
            return None
        times = self.inter_playback_times if self.inter_playback_times else self.inter_arrival_times
        if len(times) < 2:
            return None
        return {
            'mean': statistics.mean(times),
            'stddev': statistics.stdev(times),
            'variance': statistics.variance(times),
            'min': min(times),
            'max': max(times),
            'count': len(times)
        }
    
    def playback_error_stats(self):
        if not self.playback_errors:
            return None
        errors = [abs(e) for e in self.playback_errors]  # Use absolute values
        return {
            'mean': statistics.mean(errors),
            'median': statistics.median(errors),
            'stddev': statistics.stdev(errors) if len(errors) > 1 else 0,
            'max': max(errors),
            'p95': np.percentile(errors, 95) if HAS_NUMPY else (sorted(errors)[int(len(errors) * 0.95)] if len(errors) > 0 else 0),
            'count': len(errors)
        }

class LogParser:
    """Parse server logs for metrics"""
    
    def __init__(self):
        self.tcp_latencies = []
        self.tcp_timestamps = []
        self.rpsv_playback_errors = []
        self.rpsv_inter_playback = []
        self.rpsv_buffer_sizes = []
        self.rpsv_rtt = []
        
    def parse_log_file(self, log_path: Path):
        """Parse server log file"""
        print(f"Parsing log file: {log_path}")
        
        # Try multiple encodings
        encodings = ['utf-16', 'utf-8', 'utf-8-sig', 'cp1252', 'latin-1']
        file_content = None
        for enc in encodings:
            try:
                with open(log_path, 'r', encoding=enc, errors='ignore') as f:
                    file_content = f.readlines()
                    break
            except Exception:
                continue
        
        if file_content is None:
            print("ERROR: Could not read log file with any encoding")
            return
        
        ws_lane_count = 0
        rpsv_debug_count = 0
        
        metric_count = 0
        for line in file_content:
            # Structured metrics: lines starting with 'METRIC ' followed by JSON
            striped = line.lstrip()
            if striped.startswith('METRIC '):
                metric_count += 1
                try:
                    payload = striped[len('METRIC '):].strip()
                    obj = json.loads(payload)
                    kind = obj.get('kind')
                    if kind == 'tcp_ws' and 'latencyMs' in obj:
                        self.tcp_latencies.append(float(obj['latencyMs']))
                        if 'ts' in obj:
                            self.tcp_timestamps.append(float(obj['ts']))
                        continue
                    if kind == 'rpsv_playback':
                        if 'playbackErrorMs' in obj:
                            self.rpsv_playback_errors.append(float(obj['playbackErrorMs']))
                        if 'interPlaybackMs' in obj and float(obj['interPlaybackMs']) > 0:
                            self.rpsv_inter_playback.append(float(obj['interPlaybackMs']))
                        continue
                    if kind == 'rpsv_rtc':
                        if 'bufferSizeMs' in obj:
                            self.rpsv_buffer_sizes.append(int(obj['bufferSizeMs']))
                        if 'rttMs' in obj:
                            self.rpsv_rtt.append(float(obj['rttMs']))
                        continue
                except Exception as e:
                    # Debug: show first few parsing errors
                    if len(self.tcp_latencies) + len(self.rpsv_playback_errors) < 5:
                        print(f"  DEBUG: METRIC parse error: {e} for line: {line[:100]}")
                    pass
            # TCP mode: WS lane latency logs
            # Format: "🎯 WS lane: noteOn (latency=23ms)" or with encoding issues
            # Match "WS lane" anywhere in line, then extract latency
            if 'WS lane' in line:
                ws_lane_count += 1
                ws_latency_match = re.search(r'latency=(\d+(?:\.\d+)?)ms', line)
                if ws_latency_match:
                    try:
                        latency = float(ws_latency_match.group(1))
                        self.tcp_latencies.append(latency)
                    except ValueError:
                        pass
                else:
                    # Debug: show first few unmatched lines
                    if ws_lane_count <= 3:
                        print(f"  DEBUG: WS lane line found but no latency match: {line[:80]}")
            
            if 'RPSV Debug' in line:
                rpsv_debug_count += 1
            
            # RPSV mode: Playback error and inter-playback interval
            # Format: "RPSV Debug: PlaybackError=2ms, InterPlayback=500ms"
            # InterPlayback is optional
            playback_error_match = re.search(r'PlaybackError=(-?\d+(?:\.\d+)?)ms', line)
            if playback_error_match and 'RPSV Debug' in line:
                try:
                    error = float(playback_error_match.group(1))
                    self.rpsv_playback_errors.append(error)
                    
                    # Check for InterPlayback on same line
                    inter_playback_match = re.search(r'InterPlayback=(\d+(?:\.\d+)?)ms', line)
                    if inter_playback_match:
                        interval = float(inter_playback_match.group(1))
                        # Only add meaningful intervals (filter out 0ms which indicates simultaneous events)
                        if interval > 0:
                            self.rpsv_inter_playback.append(interval)
                except ValueError:
                    pass
            
            # Buffer size from RTC latency logs
            # Format: "RPSV Debug: RTC latency=0ms, bufferSizeMs=15"
            if 'bufferSizeMs' in line and 'RPSV Debug' in line:
                buffer_match = re.search(r'bufferSizeMs=(\d+)', line)
                if buffer_match:
                    try:
                        buffer = int(buffer_match.group(1))
                        # Only track if reasonable (not initial default)
                        if 5 <= buffer <= 500:
                            self.rpsv_buffer_sizes.append(buffer)
                    except ValueError:
                        pass
            
            # Also extract RTC latency for RPSV mode
            if 'RPSV Debug' in line and 'RTC latency' in line:
                rtc_latency_match = re.search(r'RTC latency=(\d+(?:\.\d+)?)ms', line)
                if rtc_latency_match:
                    # Note: These are stored but not categorized separately
                    # They contribute to understanding RPSV latency
                    pass
        
        print(f"  Found {metric_count} METRIC lines, {ws_lane_count} 'WS lane' lines, {rpsv_debug_count} 'RPSV Debug' lines")

class DevStatsParser:
    """Parse Dev Stats JSON snapshots"""
    
    def __init__(self):
        self.snapshots = []
        
    def parse_json_file(self, json_path: Path):
        """Parse Dev Stats JSON file"""
        print(f"Parsing Dev Stats: {json_path}")
        
        with open(json_path, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f)
                if isinstance(data, list):
                    self.snapshots.extend(data)
                elif isinstance(data, dict):
                    self.snapshots.append(data)
            except json.JSONDecodeError as e:
                print(f"WARNING: Error parsing JSON: {e}")
    
    def parse_directory(self, dir_path: Path):
        """Parse all JSON files in directory"""
        for json_file in dir_path.glob('*.json'):
            self.parse_json_file(json_file)

def analyze(tcp_results: AnalysisResults, rpsv_results: AnalysisResults):
    """Generate analysis report and visualizations"""
    
    print("\n" + "="*60)
    print("ANALYSIS RESULTS")
    print("="*60)
    
    # TCP Statistics
    print("\n[TCP] WebSocket Immediate Mode:")
    tcp_latency = tcp_results.latency_stats()
    if tcp_latency:
        print(f"  Latency: mean={tcp_latency['mean']:.2f}ms, median={tcp_latency['median']:.2f}ms")
        print(f"           stddev={tcp_latency['stddev']:.2f}ms, p95={tcp_latency['p95']:.2f}ms")
        print(f"           range=[{tcp_latency['min']:.2f}, {tcp_latency['max']:.2f}]ms")
    
    tcp_jitter = tcp_results.jitter_stats()
    if tcp_jitter:
        print(f"  Inter-arrival jitter: mean={tcp_jitter['mean']:.2f}ms")
        print(f"                       stddev={tcp_jitter['stddev']:.2f}ms")
        print(f"                       variance={tcp_jitter['variance']:.2f}ms^2")
    
    # RPSV Statistics
    print("\n[RPSV] RTC + Adaptive Buffer Mode:")
    rpsv_latency = rpsv_results.latency_stats()
    if rpsv_latency:
        print(f"  Latency: mean={rpsv_latency['mean']:.2f}ms, median={rpsv_latency['median']:.2f}ms")
        print(f"           stddev={rpsv_latency['stddev']:.2f}ms, p95={rpsv_latency['p95']:.2f}ms")
    
    rpsv_jitter = rpsv_results.jitter_stats()
    if rpsv_jitter:
        print(f"  Inter-playback jitter: mean={rpsv_jitter['mean']:.2f}ms")
        print(f"                        stddev={rpsv_jitter['stddev']:.2f}ms")
        print(f"                        variance={rpsv_jitter['variance']:.2f}ms^2")
    
    rpsv_error = rpsv_results.playback_error_stats()
    if rpsv_error:
        print(f"  Playback error: mean={rpsv_error['mean']:.2f}ms, median={rpsv_error['median']:.2f}ms")
        print(f"                  max={rpsv_error['max']:.2f}ms, p95={rpsv_error['p95']:.2f}ms")
    
    # Comparison
    print("\n[COMPARISON]")
    if tcp_jitter and rpsv_jitter:
        jitter_diff = rpsv_jitter['stddev'] - tcp_jitter['stddev']
        print(f"  Timing variability (stddev): TCP={tcp_jitter['stddev']:.2f}ms vs RPSV={rpsv_jitter['stddev']:.2f}ms (Delta {jitter_diff:+.2f}ms)")
    
    if tcp_latency and rpsv_latency:
        latency_overhead = rpsv_latency['mean'] - tcp_latency['mean']
        print(f"  Latency: TCP mean={tcp_latency['mean']:.2f}ms vs RPSV RTT mean={rpsv_latency['mean']:.2f}ms (Delta {latency_overhead:+.2f}ms)")
    
    if rpsv_error:
        print(f"  Playback accuracy: {rpsv_error['mean']:.2f}ms avg error (target: <5ms)")
    
    # Generate visualizations
    if HAS_MATPLOTLIB:
        generate_plots(tcp_results, rpsv_results)
    else:
        print("\nWARNING: Install matplotlib to generate plots: pip install matplotlib numpy")

def generate_plots(tcp_results: AnalysisResults, rpsv_results: AnalysisResults):
    """Generate visualization plots"""
    print("\nGenerating plots...")
    
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle('TCP vs RPSV Protocol Comparison', fontsize=16, fontweight='bold')
    
    # Plot 1: Latency Histograms
    ax1 = axes[0, 0]
    has_data = False
    if tcp_results.latency_samples:
        tcp_values = [s.value for s in tcp_results.latency_samples]
        ax1.hist(tcp_values, bins=30, alpha=0.6, label='TCP', color='blue', edgecolor='black')
        has_data = True
    if rpsv_results.latency_samples:
        rpsv_values = [s.value for s in rpsv_results.latency_samples]
        ax1.hist(rpsv_values, bins=30, alpha=0.6, label='RPSV', color='green', edgecolor='black')
        has_data = True
    if not has_data:
        ax1.text(0.5, 0.5, 'No latency data', ha='center', va='center', transform=ax1.transAxes)
    ax1.set_xlabel('Latency (ms)')
    ax1.set_ylabel('Frequency')
    ax1.set_title('Latency Distribution')
    if has_data:
        ax1.legend()
    ax1.grid(True, alpha=0.3)
    
    # Plot 2: Inter-arrival/playback time series
    ax2 = axes[0, 1]
    has_data2 = False
    if tcp_results.inter_arrival_times:
        ax2.plot(tcp_results.inter_arrival_times[:100], 'o-', markersize=3, label='TCP Inter-arrival', color='blue', alpha=0.6)
        has_data2 = True
    if rpsv_results.inter_playback_times:
        ax2.plot(rpsv_results.inter_playback_times[:100], 'o-', markersize=3, label='RPSV Inter-playback', color='green', alpha=0.6)
        has_data2 = True
    if not has_data2:
        ax2.text(0.5, 0.5, 'No timing data', ha='center', va='center', transform=ax2.transAxes)
    ax2.set_xlabel('Event Index')
    ax2.set_ylabel('Time Interval (ms)')
    ax2.set_title('Timing Consistency (first 100 events)')
    if has_data2:
        # Add target line for metronome (e.g., 500ms if that's your test interval)
        ax2.axhline(y=500, color='red', linestyle='--', alpha=0.5, label='Target (500ms)')
        ax2.legend()
    ax2.grid(True, alpha=0.3)
    
    # Plot 3: Playback Error Distribution (RPSV only)
    ax3 = axes[1, 0]
    if rpsv_results.playback_errors:
        errors = [abs(e) for e in rpsv_results.playback_errors]
        ax3.hist(errors, bins=30, alpha=0.7, color='green', edgecolor='black')
        ax3.axvline(x=5, color='red', linestyle='--', alpha=0.7, label='Target (<5ms)')
        ax3.set_xlabel('Playback Error (ms)')
        ax3.set_ylabel('Frequency')
        ax3.set_title('RPSV Playback Accuracy')
        ax3.legend()
        ax3.grid(True, alpha=0.3)
    
    # Plot 4: Buffer Size Evolution (RPSV only)
    ax4 = axes[1, 1]
    if rpsv_results.buffer_sizes:
        buffer_samples = [sample.value for sample in rpsv_results.buffer_sizes[:200]]  # First 200 samples
        ax4.plot(buffer_samples, '-', linewidth=2, color='green', alpha=0.7)
        ax4.set_xlabel('Time (samples)')
        ax4.set_ylabel('Buffer Size (ms)')
        ax4.set_title('Adaptive Buffer Size Evolution')
        ax4.grid(True, alpha=0.3)
    
    plt.tight_layout()
    output_file = 'rpsv_analysis.png'
    plt.savefig(output_file, dpi=150, bbox_inches='tight')
    print(f"SUCCESS: Saved plots to: {output_file}")
    plt.close()

def export_to_csv(tcp_results: AnalysisResults, rpsv_results: AnalysisResults, output_file='analysis_results.csv'):
    """Export statistics to CSV"""
    import csv
    
    with open(output_file, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['Metric', 'Protocol', 'Value'])
        
        # TCP metrics
        if tcp_results.latency_stats():
            stats = tcp_results.latency_stats()
            writer.writerow(['Latency Mean', 'TCP', f"{stats['mean']:.2f}"])
            writer.writerow(['Latency StdDev', 'TCP', f"{stats['stddev']:.2f}"])
            writer.writerow(['Latency P95', 'TCP', f"{stats['p95']:.2f}"])
        
        if tcp_results.jitter_stats():
            stats = tcp_results.jitter_stats()
            writer.writerow(['Inter-arrival StdDev', 'TCP', f"{stats['stddev']:.2f}"])
            writer.writerow(['Inter-arrival Variance', 'TCP', f"{stats['variance']:.2f}"])
        
        # RPSV metrics
        if rpsv_results.jitter_stats():
            stats = rpsv_results.jitter_stats()
            writer.writerow(['Inter-playback StdDev', 'RPSV', f"{stats['stddev']:.2f}"])
            writer.writerow(['Inter-playback Variance', 'RPSV', f"{stats['variance']:.2f}"])
        
        if rpsv_results.playback_error_stats():
            stats = rpsv_results.playback_error_stats()
            writer.writerow(['Playback Error Mean', 'RPSV', f"{stats['mean']:.2f}"])
            writer.writerow(['Playback Error P95', 'RPSV', f"{stats['p95']:.2f}"])
        
        # RPSV RTT (latency proxy)
        if rpsv_results.latency_stats():
            stats = rpsv_results.latency_stats()
            writer.writerow(['RTC RTT Mean', 'RPSV', f"{stats['mean']:.2f}"])
            writer.writerow(['RTC RTT P95', 'RPSV', f"{stats['p95']:.2f}"])
    
    print(f"SUCCESS: Exported CSV to: {output_file}")

def main():
    """Main analysis function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Analyze TCP vs RPSV protocol performance')
    parser.add_argument('--log', type=str, help='Path to server log file')
    parser.add_argument('--dev-stats', type=str, help='Path to Dev Stats JSON file or directory')
    parser.add_argument('--output', type=str, default='rpsv_analysis.png', help='Output plot filename')
    parser.add_argument('--csv', action='store_true', help='Export CSV results')
    
    args = parser.parse_args()
    
    # Initialize results
    tcp_results = AnalysisResults(protocol='tcp')
    rpsv_results = AnalysisResults(protocol='rpsv')
    
    # Parse logs
    if args.log:
        log_parser = LogParser()
        log_parser.parse_log_file(Path(args.log))
        
        print(f"\nExtracted metrics from log:")
        print(f"   TCP latencies: {len(log_parser.tcp_latencies)} samples")
        print(f"   TCP inter-arrival timestamps: {len(log_parser.tcp_timestamps)} samples")
        print(f"   RPSV playback errors: {len(log_parser.rpsv_playback_errors)} samples")
        print(f"   RPSV inter-playback: {len(log_parser.rpsv_inter_playback)} samples")
        print(f"   RPSV buffer sizes: {len(log_parser.rpsv_buffer_sizes)} samples")
        print(f"   RPSV RTC RTTs: {len(log_parser.rpsv_rtt)} samples")
        
        # Convert to results
        for i, lat in enumerate(log_parser.tcp_latencies):
            tcp_results.latency_samples.append(MetricSample(i, lat, 'tcp'))
        
        for i, error in enumerate(log_parser.rpsv_playback_errors):
            rpsv_results.playback_errors.append(error)
        
        for i, interval in enumerate(log_parser.rpsv_inter_playback):
            rpsv_results.inter_playback_times.append(interval)
        
        for i, buf in enumerate(log_parser.rpsv_buffer_sizes):
            rpsv_results.buffer_sizes.append(MetricSample(i, buf, 'rpsv'))
        
        # RPSV RTC RTT as latency proxy
        for i, rtt in enumerate(log_parser.rpsv_rtt):
            rpsv_results.latency_samples.append(MetricSample(i, rtt, 'rpsv'))
        
        # TCP inter-arrival from timestamps
        if len(log_parser.tcp_timestamps) >= 2:
            ts = sorted(log_parser.tcp_timestamps)
            for a, b in zip(ts, ts[1:]):
                dt = b - a
                if dt > 0:
                    tcp_results.inter_arrival_times.append(dt)
    
    # Parse Dev Stats
    if args.dev_stats:
        dev_parser = DevStatsParser()
        stats_path = Path(args.dev_stats)
        if stats_path.is_file():
            dev_parser.parse_json_file(stats_path)
        elif stats_path.is_dir():
            dev_parser.parse_directory(stats_path)
        
        # Extract metrics from snapshots
        for snapshot in dev_parser.snapshots:
            if snapshot.get('clients'):
                for client in snapshot['clients']:
                    if client.get('latencyHistory'):
                        for lat in client['latencyHistory']:
                            rpsv_results.latency_samples.append(
                                MetricSample(snapshot.get('serverTime', 0), lat, 'rpsv')
                            )
                    if client.get('bufferSizeMs'):
                        rpsv_results.buffer_sizes.append(
                            MetricSample(snapshot.get('serverTime', 0), client['bufferSizeMs'], 'rpsv')
                        )
    
    # Validate we have data
    has_tcp = len(tcp_results.latency_samples) > 0
    has_rpsv_errors = len(rpsv_results.playback_errors) > 0
    has_rpsv_interplayback = len(rpsv_results.inter_playback_times) > 0
    
    if not has_tcp and not has_rpsv_errors:
        print("\nWARNING: No data extracted from logs!")
        print("   Make sure:")
        print("   1. Server was run with RPSV_DEBUG=1")
        print("   2. You tested both TCP and RPSV modes")
        print("   3. Log file contains 'WS lane' (TCP) and 'RPSV Debug' (RPSV) entries")
        return
    
    if has_tcp:
        print(f"\n[OK] TCP data found: {len(tcp_results.latency_samples)} latency samples")
    else:
        print("\n[WARNING] No TCP data found - only tested RPSV mode?")
    
    if has_rpsv_errors:
        print(f"[OK] RPSV data found: {len(rpsv_results.playback_errors)} playback errors, {len(rpsv_results.inter_playback_times)} inter-playback intervals")
    else:
        print("\n[WARNING] No RPSV data found - only tested TCP mode?")
    
    # Run analysis
    analyze(tcp_results, rpsv_results)
    
    # Export CSV if requested
    if args.csv:
        export_to_csv(tcp_results, rpsv_results)
    
    print("\nAnalysis complete!")

if __name__ == '__main__':
    main()

