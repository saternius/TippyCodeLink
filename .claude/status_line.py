#!/usr/bin/env python3
import json
import sys
import os
import time
import firebase_admin
from firebase_admin import credentials
from firebase_admin import db

config_path = "/home/jason/TippyCodeLink/.claude"
shell_name = os.environ.get('CLAUDE_PROXY_SHELL')
if not shell_name:
    print("no-proxy")
    sys.exit(0)
log_path = f"{config_path}/status_line.log"

def log(msg):
    with open(log_path, "a") as f:
        f.write(f"({shell_name})[{time.strftime('%H:%M:%S')}] {msg}\n")

try:
    service_account_path = f"{config_path}/firebase-service-account.json"
    cred = credentials.Certificate(service_account_path)
    firebase_admin.initialize_app(cred, {
        'databaseURL': 'https://welp-c0e8d-default-rtdb.firebaseio.com'
    })
    stream_ref = db.reference(f'shell/{shell_name}')
    firebase_initialized = True
except Exception as e:
    log(f"Firebase init failed: {e}")
    firebase_initialized = False

sent_already = set()
def send(message):
    ts = message['timestamp'].replace(".", '-').replace(':','-')
    if ts in sent_already: return
    sent_already.add(ts)
    log(f"Sending ts={ts} role={message.get('role', '?')}")
    try:
        stream_ref.child(ts).set({
            'role': (message['role'] if 'role' in message else "?"),
            'content': (message['content'] if 'content' in message else [])
        })
        log(f"Sent successfully: {ts}")
    except Exception as e:
        log(f"Firebase send error for {ts}: {e}")


def simplify(data):
    if('message' in data):
        content = data['message']['content']
        if type(content) == str:
            content = [content]

        for content_item in content:
            # Only process dict items (skip strings)
            if isinstance(content_item, dict):
                # Remove signature from thinking blocks
                if 'signature' in content_item:
                    del content_item['signature']

        message = {
            "session_id": data['sessionId'],
            'timestamp': data['timestamp'],
            'role': data['message']['role'],
            'content': content
        }
        send(message)
        return message
    return {}

full_data = json.load(sys.stdin)
try:
    transcript_data = open(full_data['transcript_path']).read().strip().split("\n")

    log(f"Processing {len(transcript_data)} transcript entries")

    # Check for pending Edit tool_use
    for i, entry_str in enumerate(transcript_data):
        try:
            entry = json.loads(entry_str)
            msg = entry.get('message', {})
            content = msg.get('content', [])
            for item in (content if isinstance(content, list) else []):
                if isinstance(item, dict) and item.get('type') == 'tool_use' and item.get('name') == 'Edit':
                    ts = entry.get('timestamp', 'no_ts')
                    log(f"Found Edit tool_use at entry {i}, ts={ts}")
        except:
            pass

    full_data['transcript'] = [simplify(json.loads(data)) for data in transcript_data]

    last_status_path = f"{config_path}/last_status.json"
    outfile = open(last_status_path, "w")
    outfile.write(json.dumps(transcript_data))
    outfile.close()

except Exception as e:
    log(f"Error: {e}")

print(f"SessionID: {full_data['session_id']}")  

