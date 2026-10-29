//go:build !windows

package main

import "os/exec"

func enableTerminal() bool       { return true }
func isAddrInUse(err error) bool { return false }
func pauseIfDoubleClicked()      {}
func hideWindow(cmd *exec.Cmd)   {}
