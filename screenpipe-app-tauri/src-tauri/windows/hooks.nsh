!macro NSIS_HOOK_PREINSTALL
  ; Kill screenpipe processes before installation
  nsExec::ExecToLog 'taskkill /F /IM screenpipe.exe'
  nsExec::ExecToLog 'taskkill /F /IM screenpipe-app.exe'
  ; Wait a moment for processes to fully terminate and release file handles
  Sleep 1000
!macroend
