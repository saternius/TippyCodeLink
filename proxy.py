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
stdin_log = None  # Debug log file handle
plan_change_queue = queue.Queue()  # Queue for plan mode changes
original_command = None  # Store the original command with all flags
plan_listener_initialized = False  # Skip initial listener event


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
    """Parse timestamp:value[:noenter][:raw] format, return (value, send_enter, use_raw) tuple.

    Format: "1735012345:actualvalue" or "1735012345:actualvalue:noenter:raw"
    where timestamp is all digits.
    This allows sending the same value multiple times by using unique timestamps.
    Flags (can be in any order at end):
    - :noenter - suppresses the Enter keystroke after sending
    - :raw - sends without bracketed paste escape sequences
    """
    send_enter = True
    use_raw = False
    if raw_value and ':' in raw_value:
        parts = raw_value.split(':')
        # Check if first part looks like a timestamp (all digits)
        if parts[0].isdigit():
            # Check for flags at the end (can be in any order)
            flags = []
            while len(parts) > 2 and parts[-1] in ('noenter', 'raw'):
                flags.append(parts.pop())
            send_enter = 'noenter' not in flags
            use_raw = 'raw' in flags
            value = ':'.join(parts[1:])  # Everything after timestamp
            return (value, send_enter, use_raw)
    return (raw_value, True, False)


def plan_listener(event):
    """Handle plan mode changes from Firebase"""
    global stdin_log, plan_listener_initialized

    if event.data is None:
        return

    # Skip the initial listener event (fires on setup with current value)
    if not plan_listener_initialized:
        plan_listener_initialized = True
        if stdin_log:
            stdin_log.write(f"[{time.time():.3f}] PLAN_LISTENER_INIT: skipping initial value {event.data}\n")
            stdin_log.flush()
        return

    # event.data will be True or False
    plan_mode = bool(event.data)
    if stdin_log:
        stdin_log.write(f"[{time.time():.3f}] PLAN_CHANGE: {plan_mode}\n")
        stdin_log.flush()

    plan_change_queue.put(plan_mode)
    print(f"[proxy] Plan mode changed to: {plan_mode}")


def stdin_listener(event):
    """Handle stdin input from Firebase"""
    global last_stdin_id, stdin_log

    if event.data is None:
        return

    # Handle both single values and dictionaries
    if isinstance(event.data, dict):
        # Multiple entries - process each
        for key, value in sorted(event.data.items(), key=lambda x: int(x[0])):
            idx = int(key)
            if idx > last_stdin_id and value is not None:
                # extract_value returns (value, send_enter, use_raw) tuple
                extracted = extract_value(value)
                if stdin_log:
                    stdin_log.write(f"[{time.time():.3f}] FIREBASE_RECV (dict): idx={idx}, raw={repr(value)}, extracted={repr(extracted)}\n")
                    stdin_log.flush()
                stdin_queue.put(extracted)
                last_stdin_id = idx
    elif event.path != '/':
        # Single entry added
        try:
            idx = int(event.path.strip('/'))
            if idx > last_stdin_id:
                # extract_value returns (value, send_enter, use_raw) tuple
                extracted = extract_value(event.data)
                if stdin_log:
                    stdin_log.write(f"[{time.time():.3f}] FIREBASE_RECV (single): idx={idx}, raw={repr(event.data)}, extracted={repr(extracted)}\n")
                    stdin_log.flush()
                stdin_queue.put(extracted)
                last_stdin_id = idx
        except ValueError:
            pass


def main():
    global proc, ref, master_fd, last_stdin_id, stdin_log, original_command, plan_listener_initialized

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
    original_command = args.command  # Store original command with all flags
    command = args.command
    name = args.name

    # Set up stdin debug log
    stdin_log_path = os.path.join(SCRIPT_DIR, '.claude', f'stdin_debug_{name}.log')
    stdin_log = open(stdin_log_path, 'w')
    print(f"[proxy] Stdin debug log: {stdin_log_path}")

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

    # Set up plan mode listener
    plan_ref = ref.child('meta/plan')
    plan_ref.listen(plan_listener)
    print(f"[proxy] Listening for plan mode at /shell/{name}/meta/plan")

    # Set initial metadata
    print(f"[proxy] Starting: {command}")
    ref.child('meta').set({
        'command': command,
        'started_at': int(time.time() * 1000),
        'updated_at': int(time.time() * 1000),
        'status': 'running',
        'plan':True
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

            # Check for plan mode changes from Firebase
            plan_restart_cmd = None
            while not plan_change_queue.empty():
                try:
                    plan_mode = plan_change_queue.get_nowait()
                    if plan_mode:
                        # Plan mode enabled - use original command
                        plan_restart_cmd = original_command
                    else:
                        # Plan mode disabled - remove --permission-mode plan
                        plan_restart_cmd = original_command.replace(" --permission-mode plan", "")
                except queue.Empty:
                    break

            if plan_restart_cmd is not None:
                print(f"[proxy] Plan mode change - restarting with command: {plan_restart_cmd}")
                stdin_log.write(f"[{time.time():.3f}] PLAN_RESTART: cmd={repr(plan_restart_cmd)}\n")
                stdin_log.flush()

                # Terminate current process
                os.close(master_fd)
                master_fd = None
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()

                print(f"[proxy] Process terminated, restarting with new command...")

                # Clear previous output in Firebase
                ref.delete()

                # Reset stdin tracking
                last_stdin_id = -1

                # Drain any remaining items from the queues
                while not stdin_queue.empty():
                    try:
                        stdin_queue.get_nowait()
                    except queue.Empty:
                        break

                # Update command for this restart
                command = plan_restart_cmd

                # Determine plan mode from the command
                is_plan_mode = " --permission-mode plan" in command

                # Set initial metadata again
                ref.child('meta').set({
                    'command': command,
                    'started_at': int(time.time() * 1000),
                    'updated_at': int(time.time() * 1000),
                    'status': 'running',
                    'plan': is_plan_mode
                })

                # Create new PTY
                master_fd, slave_fd = pty.openpty()
                winsize = struct.pack('HHHH', 24, 80, 0, 0)
                fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, winsize)
                try:
                    tty.setraw(slave_fd)
                    fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, winsize)
                except Exception as e:
                    print(f"[proxy] Warning: Could not set raw mode: {e}")

                # Restart the process with new command
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
                os.close(slave_fd)

                print(f"[proxy] Process restarted with plan={is_plan_mode}")
                print("-" * 40)
                last_meta_update = time.time()
                continue

            # Process any stdin from Firebase
            restart_requested = False
            while not stdin_queue.empty():
                try:
                    # extract_value returns (value, send_enter, use_raw) tuple
                    stdin_tuple = stdin_queue.get_nowait()
                    if isinstance(stdin_tuple, tuple):
                        if len(stdin_tuple) == 3:
                            stdin_data, send_enter, use_raw = stdin_tuple
                        else:
                            stdin_data, send_enter = stdin_tuple
                            use_raw = False
                    else:
                        stdin_data, send_enter, use_raw = stdin_tuple, True, False

                    # Log raw tuple from queue
                    stdin_log.write(f"[{time.time():.3f}] QUEUE_GET: stdin_data={repr(stdin_data)}, send_enter={send_enter}, use_raw={use_raw}\n")
                    stdin_log.flush()

                    if stdin_data:
                        # Strip any existing newlines from the data
                        stdin_data = stdin_data.rstrip('\r\n')

                        # Check for /clear command - triggers restart
                        if stdin_data == '/clear':
                            print(f"[proxy] Received /clear - restarting process...")
                            stdin_log.write(f"[{time.time():.3f}] CLEAR_COMMAND\n")
                            stdin_log.flush()
                            restart_requested = True
                            break

                        # Send content - either raw or with bracketed paste
                        if use_raw:
                            # Send raw bytes without bracketed paste
                            raw_bytes = stdin_data.encode('utf-8')
                            stdin_log.write(f"[{time.time():.3f}] SENDING_RAW: {repr(raw_bytes)}\n")
                            stdin_log.flush()
                            os.write(master_fd, raw_bytes)
                        else:
                            # Send as bracketed paste:
                            # \x1b[200~ = start paste
                            # \x1b[201~ = end paste
                            paste_start = b'\x1b[200~'
                            paste_end = b'\x1b[201~'
                            paste_bytes = paste_start + stdin_data.encode('utf-8') + paste_end
                            stdin_log.write(f"[{time.time():.3f}] SENDING_PASTE: {repr(paste_bytes)}\n")
                            stdin_log.flush()
                            os.write(master_fd, paste_bytes)

                        # Wait for content to be processed
                        time.sleep(0.1)

                        # Only send Enter if not suppressed by :noenter flag
                        if send_enter:
                            stdin_log.write(f"[{time.time():.3f}] SENDING_ENTER: b'\\r'\n")
                            stdin_log.flush()
                            os.write(master_fd, b'\r')
                            stdin_log.write(f"[{time.time():.3f}] ENTER_SENT\n")
                            stdin_log.flush()
                            mode_str = "raw" if use_raw else "bracketed paste"
                            print(f"[proxy] Sent stdin as {mode_str} + Enter: {repr(stdin_data)}")
                            # Give Claude Code time to process Enter before next input
                            time.sleep(0.5)
                            stdin_log.write(f"[{time.time():.3f}] POST_ENTER_DELAY_DONE\n")
                            stdin_log.flush()
                        else:
                            stdin_log.write(f"[{time.time():.3f}] NO_ENTER (noenter flag)\n")
                            stdin_log.flush()
                            mode_str = "raw" if use_raw else "bracketed paste"
                            print(f"[proxy] Sent stdin as {mode_str} (no Enter): {repr(stdin_data)}")
                            # Give Claude Code time to process before next input
                            # This is especially important for "Other" option selections
                            # which need time to render the custom text input field
                            time.sleep(0.5)
                            stdin_log.write(f"[{time.time():.3f}] POST_NOENTER_DELAY_DONE\n")
                            stdin_log.flush()
                except queue.Empty:
                    break
                except OSError as e:
                    print(f"[proxy] Stdin write error: {e}")

            # Handle restart if /clear was received
            if restart_requested:
                # Terminate current process
                os.close(master_fd)
                master_fd = None
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()

                print(f"[proxy] Process terminated, restarting...")

                # Clear previous output in Firebase
                ref.delete()

                # Reset stdin tracking and plan listener
                last_stdin_id = -1
                plan_listener_initialized = False

                # Drain any remaining items from the queues
                while not stdin_queue.empty():
                    try:
                        stdin_queue.get_nowait()
                    except queue.Empty:
                        break
                while not plan_change_queue.empty():
                    try:
                        plan_change_queue.get_nowait()
                    except queue.Empty:
                        break

                # Re-listen for stdin (previous listener still active on same ref)

                # Set initial metadata again
                ref.child('meta').set({
                    'command': command,
                    'started_at': int(time.time() * 1000),
                    'updated_at': int(time.time() * 1000),
                    'status': 'running',
                    'plan': True
                })

                # Create new PTY
                master_fd, slave_fd = pty.openpty()
                winsize = struct.pack('HHHH', 24, 80, 0, 0)
                fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, winsize)
                try:
                    tty.setraw(slave_fd)
                    fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, winsize)
                except Exception as e:
                    print(f"[proxy] Warning: Could not set raw mode: {e}")

                # Restart the process
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
                os.close(slave_fd)

                print(f"[proxy] Process restarted")
                print("-" * 40)
                last_meta_update = time.time()
                continue

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
