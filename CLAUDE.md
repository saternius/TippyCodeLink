# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TippyCodeLink is a Firebase Realtime Database synchronization service for VR scene development (Banter/Inspector platform). It bridges local development files with Firebase, enabling bidirectional sync of game assets, scripts, and UI components.

## Commands

```bash
# Start the linker service (runs on port 5005)
npm start

# Sync a specific file to Firebase (use after editing inventory files)
python3 claude_sync.py <filepath>

# Sync recently modified files
python3 claude_sync.py --recent [minutes]

# Sync all inventory files
python3 claude_sync.py --all

# Run shell command with Firebase stdin proxy
python3 proxy.py -c 'command' -n program_name

# Schema migration (if needed)
node migrate-to-new-schema.js
```

## Architecture

```
Local Files (inventory/)  ←→  linker.js (port 5005)  ←→  Firebase Realtime DB
                                     ↓
                              Auth Server (port 9909)
```

**Core Components:**
- `linker.js` - Main Node.js service: Firebase auth, real-time listeners, HTTP save endpoint
- `claude_sync.py` - Python wrapper for Claude-initiated file syncs
- `proxy.py` - PTY shell command proxy with Firebase stdin
- `update_on_save.py` - VS Code task trigger for automatic sync on file save

**Inventory Structure (`inventory/Technocrat/`):**
- `Scripts/` - JavaScript behavior scripts (.js → itemType: "script")
- `Muppets/` - UI components (JSON + JS pairs)
- `UIs/`, `Agents/`, `Apps/`, `Examples/` - Additional asset categories
- `.json` files → itemType: "entity"
- `.md` files → itemType: "markdown"

## Key Configuration

**config.json** - Username, secret, inventory_dirs array, auth_server_url

**Firebase metadata structure per item:**
```javascript
{ author, name, created, last_used, data: "file_content", itemType: "script|entity|markdown" }
```

## Documentation

- `skills/BanterSDK.md` - JavaScript SDK reference for VR scene manipulation
- `skills/BanterUI.md` - UI component framework
- `skills/CLAUDE-script.md` - Script lifecycle patterns and data structures
- `plans/CLAUDE_SYNC_README.md` - Claude sync automation guide
- `plans/MIGRATION-GUIDE.md` - Firebase schema migration details

## Development Workflow

1. Edit files in `inventory/Technocrat/{category}/`
2. VS Code auto-triggers sync via TriggerTaskOnSave extension, OR
3. Manually run: `python3 claude_sync.py <edited_file_path>`

When editing inventory files as Claude, always sync after changes:
```bash
python3 /home/jason/TippyCodeLink/claude_sync.py <edited_file_path>
```
