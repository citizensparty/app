//go:build windows

package main

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"syscall"

	"golang.org/x/sys/windows"
)

// enableTerminal turns on colors and cursor movement in the Windows console (Windows 10 and later).
func enableTerminal() bool {
	h := windows.Handle(os.Stdout.Fd())
	var mode uint32
	if windows.GetConsoleMode(h, &mode) != nil {
		return false
	}
	return windows.SetConsoleMode(h, mode|windows.ENABLE_VIRTUAL_TERMINAL_PROCESSING) == nil
}

func isAddrInUse(err error) bool {
	var se syscall.Errno
	return errors.As(err, &se) && se == 10048 // WSAEADDRINUSE
}

// pauseIfDoubleClicked keeps the window open so the message can be read.
func pauseIfDoubleClicked() {
	fmt.Fprintln(os.Stderr, "\n Press Enter to close.")
	bufio.NewReader(os.Stdin).ReadString('\n')
}

func hideWindow(cmd *exec.Cmd) {}
