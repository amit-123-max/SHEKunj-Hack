import os
import re
import glob

def replace_in_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Pattern 1: chrome.runtime.sendMessage(payload);
    # Be careful not to replace multiline stuff incorrectly if there's a callback, but we can do a naive replace for simple calls
    # For multiline, it's safer to use a regex that matches the opening and closing parens.
    # Actually, the python regex module can handle this.
    
    # We will look for: chrome.runtime.sendMessage({ ... });
    # and: chrome.runtime.sendMessage({ ... }, (res) => { ... });
    
    import ast
    # Instead of full AST parsing, let's just do targeted string replaces for the specific cases found.
