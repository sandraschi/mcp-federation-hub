; MCP Fleet Tray — Windows system tray icon for the fleet supervisor
; Shows running/healthy server count, right-click for dashboard etc.
; Requires: AutoHotkey v2, federation bridge on :10857

#Requires AutoHotkey v2.0
#SingleInstance Force
Persistent

; ── Config ──────────────────────────────────────────────────────────
BRIDGE_URL := "http://127.0.0.1:10857"
POLL_SEC   := 15
ICON_FILE  := A_ScriptDir "\fleet-tray.ico"   ; optional custom icon

; ── State ───────────────────────────────────────────────────────────
healthy_count  := 0
total_count    := 0
core_ok_count  := 0
core_count     := 0
last_error     := ""
server_list    := ""

; ── Tray setup ──────────────────────────────────────────────────────
A_IconTip := "MCP Fleet"
Try A_IconHidden := False

; Set a simple icon — use shell32 default if no custom icon
if FileExist(ICON_FILE)
    TraySetIcon(ICON_FILE)
else
    TraySetIcon("imageres.dll", 40)  ; network icon from shell32

Menu MainMenu := Menu()
MainMenu.Add("Open Dashboard", OpenDashboard)
MainMenu.Add("Show Status", ShowStatus)
MainMenu.Add()
MainMenu.Add("Restart Bridge", RestartBridge)
MainMenu.Add()
MainMenu.Add("Exit", (*) => ExitApp())

MainMenu.SetIcon("Open Dashboard", "imageres.dll", 173)
MainMenu.SetIcon("Restart Bridge", "imageres.dll", 47)

; ── Poll loop ───────────────────────────────────────────────────────
SetTimer(PollBridge, POLL_SEC * 1000)
PollBridge()

PollBridge() {
    global healthy_count, total_count, core_ok_count, core_count, last_error, server_list

    ; Fetch supervisor status
    data := ""
    try {
        winhttp := ComObject("WinHttp.WinHttpRequest.5.1")
        winhttp.Open("GET", BRIDGE_URL "/api/v1/supervisor/status", false)
        winhttp.SetTimeouts(3000, 3000, 3000, 5000)
        winhttp.Send()
        if (winhttp.Status = 200)
            data := winhttp.ResponseText
    } catch as e {
        last_error := "Bridge unreachable"
    }

    if (data != "") {
        try {
            parsed := Jxon_Decode(data)
            healthy_count  := 0
            total_count    := 0
            core_ok_count  := 0

            for sid, svr in parsed["servers"].OwnProps() {
                total_count++
                ; Check health via uptime API
            }

            ; Count healthy from uptime endpoint
            try {
                winhttp2 := ComObject("WinHttp.WinHttpRequest.5.1")
                winhttp2.Open("GET", BRIDGE_URL "/api/v1/health/uptime", false)
                winhttp2.SetTimeouts(3000, 3000, 3000, 5000)
                winhttp2.Send()
                if (winhttp2.Status = 200) {
                    uptime := Jxon_Decode(winhttp2.ResponseText)
                    for sid, info in uptime.OwnProps() {
                        if (info.HasOwnProp("last_status") && info.last_status = "healthy")
                            healthy_count++
                    }
                }
            } catch as e {
                last_error := "Uptime API failed"
            }

            core_count    := parsed.HasOwnProp("core_count") ? parsed["core_count"] : 0
            core_ok_count := 0
            ; Count healthy core servers
            if (parsed.HasOwnProp("core_servers")) {
                for _, cid in parsed["core_servers"] {
                    if (uptime != "" && uptime.HasOwnProp(cid) && uptime[cid].last_status = "healthy")
                        core_ok_count++
                }
            }
            last_error := ""
        } catch as e {
            last_error := "Parse error"
        }
    }

    ; Update tray tooltip
    tip := "MCP Fleet`n"
    if (last_error != "")
        tip .= "⚠ " last_error "`n"
    tip .= "Healthy: " healthy_count "/" total_count
    tip .= "`nCore: " core_ok_count "/" core_count
    tip .= "`n`nLeft-click: Dashboard"
    A_IconTip := tip
}

; ── Actions ─────────────────────────────────────────────────────────

OpenDashboard(*) {
    Run("http://localhost:10856")
}

ShowStatus(*) {
    msg := "MCP Fleet Status`n`n"
    msg .= "Healthy: " healthy_count "/" total_count " servers`n"
    msg .= "Core:    " core_ok_count "/" core_count "`n"
    if (last_error != "")
        msg .= "`n⚠ " last_error
    else
        msg .= "`n✓ Bridge connected"
    TrayTip("MCP Fleet", msg, "Info", 10)
}

RestartBridge(*) {
    result := MsgBox("Restart the federation bridge (NSSM service)?", "MCP Fleet", "Y/N 0x4")
    if (result = "Yes") {
        try {
            RunWait("nssm restart mcp-federation-hub", , "Hide")
            TrayTip("MCP Fleet", "Bridge restart requested", "Info", 5)
        } catch as e {
            TrayTip("MCP Fleet", "Restart failed: " e.Message, "Error", 10)
        }
    }
}

; ── Left-click → Dashboard ─────────────────────────────────────────
OnMessage(0x404, ADDR_AYSHELL)
ADDR_AYSHELL(wParam, lParam, msg, hwnd) {
    if (lParam = 0x202) {  ; WM_LBUTTONUP
        OpenDashboard()
        return 1
    }
}

; ── JSON decoder (AHK v2) ──────────────────────────────────────────
; Minimal JSON decoder for AHK v2 — adapted from TheArkive/Jxon
Jxon_Decode(src) {
    src := Trim(src)
    if (SubStr(src, 1, 1) = '"')
        return StrReplace(SubStr(src, 2, -1), '\"', '"')
    if (src = "true")  return true
    if (src = "false") return false
    if (src = "null")  return ""

    if (SubStr(src, 1, 1) = "{") {
        obj := Map()
        src := SubStr(src, 2, -1)
        pos := 1
        while (pos <= StrLen(src)) {
            if (SubStr(src, pos, 1) = "," || SubStr(src, pos, 1) = " ") {
                pos++
                continue
            }
            if (SubStr(src, pos, 1) = "}")
                break
            ; key
            if (SubStr(src, pos, 1) != '"')
                break
            end := pos + 1
            while (end <= StrLen(src) && SubStr(src, end, 1) != '"')
                end := InStr(src, '\"',, end+1) ? end+2 : end+1
            key := SubStr(src, pos+1, end-pos-1)
            pos := end + 1
            ; colon
            while (pos <= StrLen(src) && SubStr(src, pos, 1) != ":")
                pos++
            pos++
            ; value
            val_start := pos
            brace := 0, bracket := 0
            while (pos <= StrLen(src)) {
                ch := SubStr(src, pos, 1)
                if (ch = "{" && brace++ >= 0) { pos++ ; continue
                } else if (ch = "}" && brace-- > 0 && brace = 0) { pos++ ; break
                } else if (ch = "[" && bracket++ >= 0) { pos++ ; continue
                } else if (ch = "]" && bracket-- > 0 && bracket = 0) { pos++ ; break
                } else if (brace = 0 && bracket = 0 && (ch = "," || ch = "}"))
                    break
                else if (ch = '"') {
                    pos++
                    while (pos <= StrLen(src)) {
                        if (SubStr(src, pos, 1) = '\')
                            pos += 2
                        else if (SubStr(src, pos, 1) = '"')
                            break
                        else
                            pos++
                    }
                }
                pos++
            }
            val := SubStr(src, val_start, pos - val_start)
            if (SubStr(val, 1, 1) = ",")
                val := SubStr(val, 2)
            obj[key] := Jxon_Decode(Trim(val))
        }
        return obj
    }

    if (SubStr(src, 1, 1) = "[") {
        arr := []
        src := SubStr(src, 2, -1)
        pos := 1
        while (pos <= StrLen(src)) {
            ch := SubStr(src, pos, 1)
            if (ch = "," || ch = " ")
                { pos++ ; continue }
            if (ch = "]" || ch = "")
                break
            if (ch = "{") {
                brace := 1
                end := pos + 1
                while (end <= StrLen(src) && brace > 0) {
                    if (SubStr(src, end, 1) = "{") brace++
                    if (SubStr(src, end, 1) = "}") brace--
                    end++
                }
                arr.Push(Jxon_Decode(SubStr(src, pos, end - pos)))
                pos := end
            } else if (ch = '"') {
                end := pos + 1
                while (end <= StrLen(src)) {
                    if (SubStr(src, end, 1) = '\')
                        end += 2
                    else if (SubStr(src, end, 1) = '"')
                        break
                    else
                        end++
                }
                arr.Push(Jxon_Decode(SubStr(src, pos, end - pos + 1)))
                pos := end + 1
            } else {
                end := pos
                while (end <= StrLen(src) && SubStr(src, end, 1) != "," && SubStr(src, end, 1) != "]" && SubStr(src, end, 1) != " ")
                    end++
                arr.Push(Jxon_Decode(Trim(SubStr(src, pos, end - pos))))
                pos := end
            }
        }
        return arr
    }

    if src is number
        return src + 0
    return src
}
