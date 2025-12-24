#!/usr/bin/env python3
"""
Mirror Shell - Sync shell command output to Firebase Realtime Database

Usage:
    python3 mirror_shell.py -c 'command' -n program_name
    python3 mirror_shell.py --command 'npm run dev' --name my_server

The output is streamed line-by-line to:
    /shell/{program_name}/meta/   - metadata (status, command, timestamps)
    /shell/{program_name}/lines/  - output lines (0, 1, 2, ...)
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
import threading
import queue
import termios
import struct
import fcntl

import firebase_admin
from firebase_admin import credentials, db

# Get the directory where this script is located
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVICE_ACCOUNT_PATH = os.path.join(SCRIPT_DIR, 'firebase-service-account.json')
DATABASE_URL = 'https://welp-c0e8d-default-rtdb.firebaseio.com'

# Global state for signal handler
proc = None
ref = None
line_idx = 0
master_fd = None
stdin_queue = queue.Queue()
last_stdin_id = -1


def signal_handler(signum, frame):
    """Handle Ctrl+C gracefully - update status and exit"""
    global proc, ref, line_idx, master_fd

    print("\n[mirror_shell] Caught interrupt, cleaning up...")

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
                'updated_at': int(time.time() * 1000),
                'line_count': line_idx
            })
            print("[mirror_shell] Updated Firebase status to 'interrupted'")
        except Exception as e:
            print(f"[mirror_shell] Failed to update Firebase: {e}")

    sys.exit(130)  # 128 + SIGINT(2)


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
                stdin_queue.put(value)
                last_stdin_id = idx
    elif event.path != '/':
        # Single entry added
        try:
            idx = int(event.path.strip('/'))
            if idx > last_stdin_id:
                stdin_queue.put(event.data)
                last_stdin_id = idx
        except ValueError:
            pass


def main():
    global proc, ref, line_idx

    # Parse command line arguments
    parser = argparse.ArgumentParser(
        description='Mirror shell command output to Firebase Realtime Database'
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
        print(f"[mirror_shell] ERROR: Service account file not found: {args.service_account}")
        print("[mirror_shell] Please download it from Firebase Console:")
        print("  1. Go to Firebase Console > Project Settings > Service Accounts")
        print("  2. Click 'Generate new private key'")
        print(f"  3. Save as: {SERVICE_ACCOUNT_PATH}")
        sys.exit(1)

    # Set up signal handler for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Initialize Firebase
    print(f"[mirror_shell] Initializing Firebase...")
    try:
        cred = credentials.Certificate(args.service_account)
        firebase_admin.initialize_app(cred, {
            'databaseURL': DATABASE_URL
        })
    except ValueError:
        # App already initialized (e.g., in testing)
        pass

    # Get reference to shell output path
    ref = db.reference(f'/shell/{name}')

    # Clear previous output unless --no-clear is set
    if not args.no_clear:
        print(f"[mirror_shell] Clearing previous output at /shell/{name}")
        ref.delete()

    # Set up stdin listener
    stdin_ref = ref.child('stdin')
    stdin_ref.listen(stdin_listener)
    print(f"[mirror_shell] Listening for stdin at /shell/{name}/stdin/")

    # Set initial metadata
    print(f"[mirror_shell] Starting: {command}")
    ref.child('meta').set({
        'command': command,
        'started_at': int(time.time() * 1000),
        'updated_at': int(time.time() * 1000),
        'status': 'running',
        'exit_code': None,
        'line_count': 0
    })

    # Create a pseudo-terminal so interactive programs work
    global master_fd
    master_fd, slave_fd = pty.openpty()

    # Set up terminal size (80x24 is standard)
    winsize = struct.pack('HHHH', 24, 80, 0, 0)
    fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, winsize)

    # Disable input character translation to ensure \r passes through unchanged
    # This is critical for Claude Code's Ink-based input handling which treats
    # \r (CR) as "submit" but \n (LF) as "add newline"
    try:
        attrs = termios.tcgetattr(slave_fd)
        # Clear ICRNL (CR->NL), INLCR (NL->CR), IGNCR (ignore CR)
        attrs[0] = attrs[0] & ~(termios.ICRNL | termios.INLCR | termios.IGNCR)
        termios.tcsetattr(slave_fd, termios.TCSANOW, attrs)
        print("[mirror_shell] Disabled ICRNL for raw CR passthrough")
    except Exception as e:
        print(f"[mirror_shell] Warning: Could not modify terminal attrs: {e}")

    # Set up environment for proper terminal emulation
    env = os.environ.copy()
    env['TERM'] = 'xterm-256color'
    env['COLORTERM'] = 'truecolor'
    env['COLUMNS'] = '80'
    env['LINES'] = '24'

    # Run the command with PTY for stdout/stderr (keeps it interactive)
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
        print(f"[mirror_shell] Failed to start process: {e}")
        os.close(master_fd)
        os.close(slave_fd)
        ref.child('meta').update({
            'status': 'error',
            'updated_at': int(time.time() * 1000),
            'error': str(e)
        })
        sys.exit(1)

    # Stream output lines to Firebase
    lines_ref = ref.child('lines')
    line_idx = 0
    last_meta_update = time.time()

    print(f"[mirror_shell] Streaming output to /shell/{name}/lines/")
    print("-" * 40)

    # Read from PTY master
    buffer = ""
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

                        # Type character by character with small delays
                        # This mimics real typing and works with Claude Code
                        for char in stdin_data:
                            os.write(master_fd, char.encode('utf-8'))
                            time.sleep(0.03)  # 30ms delay between chars

                        # Small pause before Enter
                        time.sleep(0.1)

                        # Send Enter as carriage return
                        os.write(master_fd, b'\r')
                        print(f"[mirror_shell] Sent stdin: {repr(stdin_data)} + Enter")
                except queue.Empty:
                    break
                except OSError as e:
                    print(f"[mirror_shell] Stdin write error: {e}")

            if ready:
                try:
                    data = os.read(master_fd, 4096)
                    if not data:
                        break
                    text = data.decode('utf-8', errors='replace')
                    buffer += text

                    # Process complete lines
                    while '\n' in buffer:
                        line_text, buffer = buffer.split('\n', 1)
                        line_text = line_text.rstrip('\r')  # Handle \r\n

                        # Print locally
                        print(line_text)

                        # Push to Firebase
                        try:
                            lines_ref.child(str(line_idx)).set(line_text)
                            line_idx += 1

                            # Update meta periodically (every 2 seconds)
                            if time.time() - last_meta_update > 2:
                                ref.child('meta').update({
                                    'updated_at': int(time.time() * 1000),
                                    'line_count': line_idx
                                })
                                last_meta_update = time.time()
                        except Exception as e:
                            print(f"[mirror_shell] Firebase write error: {e}")

                except OSError as e:
                    if e.errno == errno.EIO:
                        break  # PTY closed
                    raise

            # If process exited and no more data, break
            if ret is not None and not ready:
                break

    finally:
        os.close(master_fd)
        master_fd = None

    # Handle any remaining buffer content
    if buffer.strip():
        print(buffer.strip())
        try:
            lines_ref.child(str(line_idx)).set(buffer.strip())
            line_idx += 1
        except Exception as e:
            print(f"[mirror_shell] Firebase write error: {e}")

    print("-" * 40)

    # Wait for process to complete
    exit_code = proc.wait()
    proc = None

    # Update final status
    status = 'completed' if exit_code == 0 else 'error'
    print(f"[mirror_shell] Process exited with code {exit_code} ({status})")

    ref.child('meta').update({
        'status': status,
        'exit_code': exit_code,
        'updated_at': int(time.time() * 1000),
        'line_count': line_idx
    })

    print(f"[mirror_shell] Synced {line_idx} lines to Firebase")
    sys.exit(exit_code)


if __name__ == '__main__':
    main()
