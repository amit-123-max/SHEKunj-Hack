import os
import glob
import re

def main():
    files = glob.glob('/Users/amit-pc/Downloads/NeuroRead-main/extension/features/*.js')
    
    for f in files:
        if 'utils.js' in f or 'agent-client.js' in f:
            continue
            
        with open(f, 'r') as file:
            content = file.read()
            
        if 'chrome.runtime.sendMessage' not in content:
            continue
            
        print(f"File to modify: {f}")

if __name__ == '__main__':
    main()
