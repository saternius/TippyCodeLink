import time
import os
import sys
import requests

linker_port = 5005


print(sys.argv)
print("Inventory Link: " + os.getcwd())

# Normalize paths to handle Windows/Unix differences
workspace_root = os.path.normpath(os.getcwd())
target_path = os.path.normpath(sys.argv[1])

# Make the path relative to the workspace root
if target_path.startswith(workspace_root):
    relative_path = os.path.relpath(target_path, workspace_root)
    print("TargetPath: " + relative_path)
    # Convert to forward slashes for the URL
    relative_path = relative_path.replace(os.sep, '/')
else:
    print("TargetPath: " + target_path + " is not in the workspace root: " + workspace_root)
    exit()

requests.get(f"http://localhost:{linker_port}/save?file={relative_path}")

#'/home/jason/Desktop/sdq3/SideQuest.Banter.Unity/Injection/inspector/prompts/builder/extensions/code_linker/update_on_save.py', '/home/jason/Desktop/sdq3/SideQuest.Banter.Unity/Injection/inspector/prompts/builder/extensions/code_linker/inventory/Technocrat/Chess/Chess.js'