!macro preInit
  !ifndef BUILD_UNINSTALLER
    WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$LOCALAPPDATA\Programs\Xunxintai"
  !endif
!macroend
