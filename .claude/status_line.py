#!/usr/bin/env python3
import json
import sys
import os
import firebase_admin
from firebase_admin import credentials
from firebase_admin import db

config_path = "/home/jason/TippyCodeLink/.claude"
shell_name = "default"
try:
    service_account_path = f"{config_path}/firebase-service-account.json"
    cred = credentials.Certificate(service_account_path)
    firebase_admin.initialize_app(cred, {
        'databaseURL': 'https://welp-c0e8d-default-rtdb.firebaseio.com'
    })
    stream_ref = db.reference(f'shell/{shell_name}')
    firebase_initialized = True
except Exception as e:
    print(f"Warning: Failed to initialize Firebase: {e}", file=sys.stderr)
    firebase_initialized = False

sent_already = set()
def send(message):
    ts = message['timestamp'].replace(".", '-').replace(':','-')
    if ts in sent_already: return
    sent_already.add(ts)
    stream_ref.child(ts).set({
        'role': (message['role'] if 'role' in message else "?"),
        'content': (message['content'] if 'content' in message else [])
    })


def simplify(data):
    if('message' in data):
        content = data['message']['content']
        if type(content) == str:
            content = [content]
            
        for content_item in content:
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
    full_data['transcript'] = [simplify(json.loads(data)) for data in transcript_data]
except Exception as e:
    print(e)


# print(f"SessionID: {data['sessionId']}")  
# last_status_path = f"{config_path}/last_status.json"
# outfile = open(last_status_path, "w")
# outfile.write(json.dumps(data))
# outfile.close()
print(f"SessionID: {full_data['session_id']}")  

