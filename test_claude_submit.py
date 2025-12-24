#!/usr/bin/env python3
"""
Targeted test to find Claude Code's submit trigger
"""

import os
import pty
import time
import select
import struct
import fcntl
import termios
import subprocess
import sys

def read_output(master_fd, timeout=1):
    """Read all available output from PTY"""
    output = b''
    start = time.time()
    while time.time() - start < timeout:
        ready, _, _ = select.select([master_fd], [], [], 0.1)
        if ready:
            try:
                data = os.read(master_fd, 4096)
                if data:
                    output += data
            except OSError:
                break
    return output

def test_submission(master_fd, text, submit_sequence, desc):
    """Test a specific submission sequence"""
    print(f"\n{'='*50}")
    print(f"Testing: {desc}")
    print(f"Text: {repr(text)}")
    print(f"Submit: {repr(submit_sequence)}")
    print('='*50)

    # Clear any pending output
    read_output(master_fd, 0.2)

    # Send text character by character (more realistic)
    for char in text:
        os.write(master_fd, char.encode('utf-8'))
        time.sleep(0.05)  # Small delay between chars

    time.sleep(0.2)

    # Send submit sequence
    os.write(master_fd, submit_sequence)

    # Wait and read response
    time.sleep(1.5)
    response = read_output(master_fd, 2)

    # Look for signs of submission
    response_str = response.decode('utf-8', errors='replace')

    # Check for indicators that submission worked
    submitted = False
    indicators = [
        'Thinking', 'thinking',
        'Claude',
        'working',
        '\x1b[?25l',  # Cursor hide (often happens during processing)
    ]

    for indicator in indicators:
        if indicator in response_str:
            print(f"  Found indicator: {repr(indicator)}")
            submitted = True

    print(f"Response length: {len(response)} bytes")
    print(f"Response preview: {repr(response[:200])}")

    return submitted

def main():
    print("Claude Code Submit Trigger Test")
    print("="*60)

    # Create PTY
    master_fd, slave_fd = pty.openpty()

    # Set terminal size
    winsize = struct.pack('HHHH', 30, 100, 0, 0)
    fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, winsize)

    # Environment
    env = os.environ.copy()
    env['TERM'] = 'xterm-256color'
    env['COLORTERM'] = 'truecolor'

    # Start Claude
    print("\nStarting Claude Code...")
    proc = subprocess.Popen(
        ['claude'],
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        close_fds=True,
        start_new_session=True,
        env=env
    )
    os.close(slave_fd)

    # Wait for initialization
    print("Waiting for Claude to initialize...")
    init_output = read_output(master_fd, 3)
    print(f"Initial output: {len(init_output)} bytes")

    # Test different submit sequences
    test_sequences = [
        # (text, submit_bytes, description)
        ("hi", b'\r', "CR (standard Enter)"),
        ("hi", b'\n', "LF (newline)"),
        ("hi", b'\r\n', "CRLF"),
        ("hi", b'\r\r', "Double CR"),
        ("hi", b'\n\n', "Double LF"),
        ("hi", b'\x1bOM', "Keypad Enter"),
        ("hi", b'\x04', "Ctrl+D (EOF)"),
        ("hi", b'\x0a', "Ctrl+J"),
        ("hi", b'\x1b\r', "Escape then CR"),
        ("hi", b'\x1b\n', "Escape then LF"),
        ("hi", b'\x1b[13;2~', "Shift+Enter escape"),
        ("hi", b'\x1b[13;5~', "Ctrl+Enter escape"),
    ]

    for text, seq, desc in test_sequences:
        if proc.poll() is not None:
            print("\nClaude exited, restarting...")
            # Restart
            master_fd, slave_fd = pty.openpty()
            winsize = struct.pack('HHHH', 30, 100, 0, 0)
            fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, winsize)
            proc = subprocess.Popen(
                ['claude'],
                stdin=slave_fd,
                stdout=slave_fd,
                stderr=slave_fd,
                close_fds=True,
                start_new_session=True,
                env=env
            )
            os.close(slave_fd)
            read_output(master_fd, 3)

        try:
            result = test_submission(master_fd, text, seq, desc)
            if result:
                print(f"\n*** POSSIBLE MATCH: {desc} ***")
        except Exception as e:
            print(f"Error: {e}")

        # Small delay between tests
        time.sleep(0.5)

    # Also test with bracketed paste disabled
    print("\n" + "="*60)
    print("Testing with bracketed paste mode disabled...")
    print("="*60)

    # Disable bracketed paste
    os.write(master_fd, b'\x1b[?2004l')
    time.sleep(0.2)

    test_submission(master_fd, "hello", b'\r', "CR with bracketed paste disabled")

    # Cleanup
    proc.terminate()
    os.close(master_fd)

    print("\n" + "="*60)
    print("Test complete!")
    print("="*60)

if __name__ == '__main__':
    main()
