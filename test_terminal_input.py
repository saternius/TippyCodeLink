#!/usr/bin/env python3
"""
Test script to identify how Claude Code handles terminal input.
Runs various tests to probe TTY detection and input handling.
"""

import subprocess
import os
import pty
import sys
import time
import select
import struct
import fcntl
import termios

def test_basic_pty():
    """Test 1: Basic PTY with simple echo command"""
    print("\n" + "="*60)
    print("TEST 1: Basic PTY with 'cat' command")
    print("="*60)

    master_fd, slave_fd = pty.openpty()

    proc = subprocess.Popen(
        ['cat'],
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        close_fds=True
    )
    os.close(slave_fd)

    # Send test input
    test_inputs = [
        (b'hello\r', 'hello + CR'),
        (b'world\n', 'world + LF'),
        (b'test\r\n', 'test + CRLF'),
    ]

    for data, desc in test_inputs:
        print(f"\nSending: {desc} -> {repr(data)}")
        os.write(master_fd, data)
        time.sleep(0.1)

        # Read response
        ready, _, _ = select.select([master_fd], [], [], 0.5)
        if ready:
            response = os.read(master_fd, 1024)
            print(f"Received: {repr(response)}")
        else:
            print("No response")

    proc.terminate()
    os.close(master_fd)
    print("\nResult: Basic PTY works if you see echoed input above")


def test_claude_tty_check():
    """Test 2: Check what Claude sees for TTY"""
    print("\n" + "="*60)
    print("TEST 2: TTY detection test")
    print("="*60)

    # Test with pipe (no TTY)
    print("\n--- With PIPE (no TTY) ---")
    result = subprocess.run(
        ['claude', '--help'],
        capture_output=True,
        text=True,
        timeout=10
    )
    print(f"Exit code: {result.returncode}")
    print(f"Stdout (first 200 chars): {result.stdout[:200] if result.stdout else 'empty'}")
    print(f"Stderr (first 200 chars): {result.stderr[:200] if result.stderr else 'empty'}")

    # Test with PTY
    print("\n--- With PTY ---")
    master_fd, slave_fd = pty.openpty()

    # Set terminal size
    winsize = struct.pack('HHHH', 24, 80, 0, 0)
    fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, winsize)

    env = os.environ.copy()
    env['TERM'] = 'xterm-256color'

    proc = subprocess.Popen(
        ['claude', '--help'],
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        close_fds=True,
        env=env
    )
    os.close(slave_fd)

    # Collect output
    output = b''
    start = time.time()
    while time.time() - start < 5:
        ready, _, _ = select.select([master_fd], [], [], 0.1)
        if ready:
            try:
                data = os.read(master_fd, 4096)
                if data:
                    output += data
            except OSError:
                break
        if proc.poll() is not None:
            break

    proc.terminate()
    os.close(master_fd)

    print(f"Output length: {len(output)} bytes")
    print(f"Output (first 500 chars): {output[:500]}")


def test_input_sequences():
    """Test 3: Try different input sequences with Claude"""
    print("\n" + "="*60)
    print("TEST 3: Input sequence test with Claude")
    print("="*60)

    master_fd, slave_fd = pty.openpty()

    # Set terminal size
    winsize = struct.pack('HHHH', 24, 80, 0, 0)
    fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, winsize)

    env = os.environ.copy()
    env['TERM'] = 'xterm-256color'
    env['COLORTERM'] = 'truecolor'

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

    print("Started Claude, waiting for initialization...")

    # Collect initial output
    output = b''
    start = time.time()
    while time.time() - start < 5:
        ready, _, _ = select.select([master_fd], [], [], 0.1)
        if ready:
            try:
                data = os.read(master_fd, 4096)
                if data:
                    output += data
                    print(f"[{time.time()-start:.1f}s] Received {len(data)} bytes")
            except OSError:
                break

    print(f"\nInitial output ({len(output)} bytes):")
    # Show hex dump of first 200 bytes to see control sequences
    print("Hex dump (first 200 bytes):")
    for i in range(0, min(200, len(output)), 16):
        hex_part = ' '.join(f'{b:02x}' for b in output[i:i+16])
        ascii_part = ''.join(chr(b) if 32 <= b < 127 else '.' for b in output[i:i+16])
        print(f"  {i:04x}: {hex_part:<48} {ascii_part}")

    # Try different Enter sequences
    sequences_to_test = [
        (b'\r', 'CR only (\\r)'),
        (b'\n', 'LF only (\\n)'),
        (b'\r\n', 'CRLF (\\r\\n)'),
        (b'\x1b[13~', 'Escape sequence for Enter'),
        (b'\x1bOM', 'Keypad Enter'),
    ]

    print("\n--- Testing input sequences ---")
    for seq, desc in sequences_to_test:
        if proc.poll() is not None:
            print("Process exited, restarting...")
            break

        print(f"\nSending: {desc} -> {repr(seq)}")
        try:
            os.write(master_fd, b'test')  # Send some text first
            time.sleep(0.1)
            os.write(master_fd, seq)  # Then the Enter sequence
            time.sleep(0.5)

            # Read response
            ready, _, _ = select.select([master_fd], [], [], 1)
            if ready:
                response = os.read(master_fd, 4096)
                print(f"Response ({len(response)} bytes): {repr(response[:100])}")
            else:
                print("No response within 1 second")
        except OSError as e:
            print(f"Error: {e}")

    proc.terminate()
    try:
        os.close(master_fd)
    except:
        pass


def test_termios_modes():
    """Test 4: Check terminal modes"""
    print("\n" + "="*60)
    print("TEST 4: Terminal mode inspection")
    print("="*60)

    master_fd, slave_fd = pty.openpty()

    print("\nDefault PTY terminal attributes:")
    attrs = termios.tcgetattr(slave_fd)

    iflag, oflag, cflag, lflag, ispeed, ospeed, cc = attrs

    print(f"\nInput flags (iflag): {iflag:#x}")
    print(f"  ICRNL (CR->NL): {bool(iflag & termios.ICRNL)}")
    print(f"  INLCR (NL->CR): {bool(iflag & termios.INLCR)}")
    print(f"  IGNCR (ignore CR): {bool(iflag & termios.IGNCR)}")

    print(f"\nOutput flags (oflag): {oflag:#x}")
    print(f"  ONLCR (NL->CRNL): {bool(oflag & termios.ONLCR)}")
    print(f"  OCRNL (CR->NL): {bool(oflag & termios.OCRNL)}")

    print(f"\nLocal flags (lflag): {lflag:#x}")
    print(f"  ECHO: {bool(lflag & termios.ECHO)}")
    print(f"  ICANON (canonical): {bool(lflag & termios.ICANON)}")
    print(f"  ISIG (signals): {bool(lflag & termios.ISIG)}")
    print(f"  IEXTEN (extended): {bool(lflag & termios.IEXTEN)}")

    os.close(slave_fd)
    os.close(master_fd)


def test_strace_claude():
    """Test 5: Use strace to see what Claude reads"""
    print("\n" + "="*60)
    print("TEST 5: Strace analysis (if available)")
    print("="*60)

    # Check if strace is available
    try:
        subprocess.run(['which', 'strace'], check=True, capture_output=True)
    except subprocess.CalledProcessError:
        print("strace not available, skipping this test")
        return

    master_fd, slave_fd = pty.openpty()

    winsize = struct.pack('HHHH', 24, 80, 0, 0)
    fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, winsize)

    env = os.environ.copy()
    env['TERM'] = 'xterm-256color'

    print("Running Claude under strace for 5 seconds...")
    print("Will capture read() and ioctl() calls")

    proc = subprocess.Popen(
        ['strace', '-e', 'read,ioctl,write', '-s', '100', 'claude'],
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=subprocess.PIPE,  # Capture strace output
        close_fds=True,
        env=env
    )
    os.close(slave_fd)

    # Send some input after a delay
    time.sleep(2)
    print("\nSending 'hello' + CR...")
    os.write(master_fd, b'hello\r')

    time.sleep(3)
    proc.terminate()

    # Read strace output
    strace_output = proc.stderr.read().decode('utf-8', errors='replace')
    print(f"\nStrace output (last 2000 chars):\n{strace_output[-2000:]}")

    os.close(master_fd)


def main():
    print("Terminal Input Test Suite for Claude Code")
    print("="*60)

    tests = [
        ("Basic PTY test", test_basic_pty),
        ("TTY detection", test_claude_tty_check),
        ("Terminal modes", test_termios_modes),
        ("Input sequences", test_input_sequences),
        ("Strace analysis", test_strace_claude),
    ]

    for name, test_func in tests:
        try:
            test_func()
        except Exception as e:
            print(f"\nTest '{name}' failed with error: {e}")
            import traceback
            traceback.print_exc()

        print("\n" + "-"*60)
        input("Press Enter to continue to next test...")


if __name__ == '__main__':
    main()
