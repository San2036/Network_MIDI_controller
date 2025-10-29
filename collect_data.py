#!/usr/bin/env python3
"""
Data Collection Helper for JCMP Analysis
Use this to capture Dev Stats snapshots automatically from the browser Dev page
"""

import json
import time
from pathlib import Path
from datetime import datetime

def create_snapshot_template():
    """Create a template JSON file structure for manual data collection"""
    template = {
        "type": "jcmp-stats",
        "serverTime": int(time.time() * 1000),
        "queueLength": 0,
        "laneCounters": {
            "rtcPerf": 0,
            "wsImmediate": 0
        },
        "clients": [
            {
                "id": 1,
                "bufferSizeMs": 40,
                "rttP95": 0,
                "rttAvg": 0,
                "latencyHistory": [],
                "dcState": "open",
                "lastSeen": None
            }
        ],
        "instructions": "Copy the Raw JSON from Dev page and paste here, or save multiple snapshots as array"
    }
    
    output_dir = Path('data')
    output_dir.mkdir(exist_ok=True)
    
    template_file = output_dir / 'snapshot_template.json'
    with open(template_file, 'w') as f:
        json.dump(template, f, indent=2)
    
    print(f"✅ Created template: {template_file}")
    print("📋 Instructions:")
    print("   1. Open Dev page in browser")
    print("   2. Scroll to 'Raw' JSON section")
    print("   3. Copy the JSON object")
    print("   4. Paste into snapshot files (one per mode/test)")
    print(f"   5. Save as: {output_dir}/tcp_test_1.json, {output_dir}/jcmp_test_1.json, etc.")

if __name__ == '__main__':
    create_snapshot_template()

