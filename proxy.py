#!/usr/bin/env python3
"""
Proxy Shell - Run commands with PTY and sync stdin from Firebase

Usage:
    python3 proxy.py -c 'command' -n program_name
    python3 proxy.py --command 'claude' --name my_session

The command runs in a PTY. Stdin is read from Firebase at:
    /shell/{program_name}/stdin/

Transcript output is handled separately by the status_line.py hook,
which writes to /shell/{program_name}/{timestamp}/
"""

import argparse
import subprocess
import time
import signal
import sys
import os
import pty
import select
import errno
import queue
import termios
import struct
import fcntl
import tty

import firebase_admin
from firebase_admin import credentials, db

# Get the directory where this script is located
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVICE_ACCOUNT_PATH = os.path.join(SCRIPT_DIR+"/.claude", 'firebase-service-account.json')
DATABASE_URL = 'https://welp-c0e8d-default-rtdb.firebaseio.com'

# Global state for signal handler
proc = None
ref = None
master_fd = None
stdin_queue = queue.Queue()
last_stdin_id = -1


def signal_handler(signum, frame):
    """Handle Ctrl+C gracefully - update status and exit"""
    global proc, ref, master_fd

    print("\n[proxy] Caught interrupt, cleaning up...")

    if master_fd is not None:
        try:
            os.close(master_fd)
        except OSError:
            pass

    if proc:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()

    if ref:
        try:
            ref.child('meta').update({
                'status': 'interrupted',
                'updated_at': int(time.time() * 1000)
            })
            print("[proxy] Updated Firebase status to 'interrupted'")
        except Exception as e:
            print(f"[proxy] Failed to update Firebase: {e}")

    sys.exit(130)  # 128 + SIGINT(2)


def extract_value(raw_value):
    """Parse timestamp:value format, return actual value.

    Format: "1735012345:actualvalue" where timestamp is all digits.
    This allows sending the same value multiple times by using unique timestamps.
    """
    if raw_value and ':' in raw_value:
        parts = raw_value.split(':', 1)
        # Check if first part looks like a timestamp (all digits)
        if parts[0].isdigit():
            return parts[1]
    return raw_value


def stdin_listener(event):
    """Handle stdin input from Firebase"""
    global last_stdin_id

    if event.data is None:
        return

    # Handle both single values and dictionaries
    if isinstance(event.data, dict):
        # Multiple entries - process each
        for key, value in sorted(event.data.items(), key=lambda x: int(x[0])):
            idx = int(key)
            if idx > last_stdin_id and value is not None:
                stdin_queue.put(extract_value(value))
                last_stdin_id = idx
    elif event.path != '/':
        # Single entry added
        try:
            idx = int(event.path.strip('/'))
            if idx > last_stdin_id:
                stdin_queue.put(extract_value(event.data))
                last_stdin_id = idx
        except ValueError:
            pass


def main():
    global proc, ref, master_fd

    # Parse command line arguments
    parser = argparse.ArgumentParser(
        description='Run command with PTY and sync stdin from Firebase'
    )
    parser.add_argument(
        '-c', '--command',
        required=True,
        help='Shell command to execute'
    )
    parser.add_argument(
        '-n', '--name',
        required=True,
        help='Program name (used as Firebase path key)'
    )
    parser.add_argument(
        '--service-account',
        default=SERVICE_ACCOUNT_PATH,
        help=f'Path to Firebase service account JSON (default: {SERVICE_ACCOUNT_PATH})'
    )
    parser.add_argument(
        '--no-clear',
        action='store_true',
        help='Do not clear previous output before starting'
    )

    args = parser.parse_args()
    command = args.command
    name = args.name

    # Validate service account file exists
    if not os.path.exists(args.service_account):
        print(f"[proxy] ERROR: Service account file not found: {args.service_account}")
        print("[proxy] Please download it from Firebase Console:")
        print("  1. Go to Firebase Console > Project Settings > Service Accounts")
        print("  2. Click 'Generate new private key'")
        print(f"  3. Save as: {SERVICE_ACCOUNT_PATH}")
        sys.exit(1)

    # Set up signal handler for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Initialize Firebase
    print(f"[proxy] Initializing Firebase...")
    try:
        cred = credentials.Certificate(args.service_account)
        firebase_admin.initialize_app(cred, {
            'databaseURL': DATABASE_URL
        })
    except ValueError:
        # App already initialized (e.g., in testing)
        pass

    # Get reference to shell path
    ref = db.reference(f'/shell/{name}')

    # Clear previous output unless --no-clear is set
    if not args.no_clear:
        print(f"[proxy] Clearing previous data at /shell/{name}")
        ref.delete()

    # Set up stdin listener
    stdin_ref = ref.child('stdin')
    stdin_ref.listen(stdin_listener)
    print(f"[proxy] Listening for stdin at /shell/{name}/stdin/")

    # Set initial metadata
    print(f"[proxy] Starting: {command}")
    ref.child('meta').set({
        'command': command,
        'started_at': int(time.time() * 1000),
        'updated_at': int(time.time() * 1000),
        'status': 'running'
    })

    # Create a pseudo-terminal so interactive programs work
    master_fd, slave_fd = pty.openpty()

    # Set up terminal size (80x24 is standard)
    winsize = struct.pack('HHHH', 24, 80, 0, 0)
    fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, winsize)

    # Use full raw mode to disable all terminal processing
    # This ensures input bytes pass through exactly as sent
    try:
        tty.setraw(slave_fd)
        # Re-apply window size after setraw (it may have been cleared)
        fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, winsize)
        print("[proxy] Set PTY to full raw mode")
    except Exception as e:
        print(f"[proxy] Warning: Could not set raw mode: {e}")

    # Set up environment for proper terminal emulation
    env = os.environ.copy()
    env['TERM'] = 'xterm-256color'
    env['COLORTERM'] = 'truecolor'
    env['COLUMNS'] = '80'
    env['LINES'] = '24'
    env['CLAUDE_PROXY_SHELL'] = name

    # Run the command with PTY
    try:
        proc = subprocess.Popen(
            command,
            shell=True,
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            close_fds=True,
            start_new_session=True,
            env=env
        )
        os.close(slave_fd)  # Close slave in parent, child has it
    except Exception as e:
        print(f"[proxy] Failed to start process: {e}")
        os.close(master_fd)
        os.close(slave_fd)
        ref.child('meta').update({
            'status': 'error',
            'updated_at': int(time.time() * 1000),
            'error': str(e)
        })
        sys.exit(1)

    print(f"[proxy] Process started, PTY connected")
    print("-" * 40)

    # Main loop - read PTY output and handle stdin from Firebase
    last_meta_update = time.time()
    try:
        while True:
            # Check if process is still running
            ret = proc.poll()

            # Use select to check if there's data to read
            ready, _, _ = select.select([master_fd], [], [], 0.1)

            # Process any stdin from Firebase
            while not stdin_queue.empty():
                try:
                    stdin_data = stdin_queue.get_nowait()
                    if stdin_data:
                        # Strip any existing newlines from the data
                        stdin_data = stdin_data.rstrip('\r\n')

                        # Send as proper bracketed paste:
                        # \x1b[200~ = start paste
                        # \x1b[201~ = end paste
                        paste_start = b'\x1b[200~'
                        paste_end = b'\x1b[201~'

                        # Send paste content
                        os.write(master_fd, paste_start + stdin_data.encode('utf-8') + paste_end)

                        # Wait for paste to be processed, then send Enter separately
                        time.sleep(0.1)
                        os.write(master_fd, b'\r')

                        print(f"[proxy] Sent stdin as bracketed paste + Enter: {repr(stdin_data)}")
                except queue.Empty:
                    break
                except OSError as e:
                    print(f"[proxy] Stdin write error: {e}")

            if ready:
                try:
                    data = os.read(master_fd, 4096)
                    if not data:
                        break
                    # Just print locally - statusline hook handles Firebase
                    text = data.decode('utf-8', errors='replace')
                    sys.stdout.write(text)
                    sys.stdout.flush()
                except OSError as e:
                    if e.errno == errno.EIO:
                        break  # PTY closed
                    raise

            # Update meta periodically (every 5 seconds)
            if time.time() - last_meta_update > 5:
                ref.child('meta').update({
                    'updated_at': int(time.time() * 1000)
                })
                last_meta_update = time.time()

            # If process exited and no more data, break
            if ret is not None and not ready:
                break

    finally:
        os.close(master_fd)
        master_fd = None

    print("\n" + "-" * 40)

    # Wait for process to complete
    exit_code = proc.wait()
    proc = None

    # Update final status
    status = 'completed' if exit_code == 0 else 'error'
    print(f"[proxy] Process exited with code {exit_code} ({status})")

    ref.child('meta').update({
        'status': status,
        'exit_code': exit_code,
        'updated_at': int(time.time() * 1000)
    })

    print(f"[proxy] Session complete")
    sys.exit(exit_code)


if __name__ == '__main__':
    main()
