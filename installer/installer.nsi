; Установщик «Мои уроки» (NSIS). Собирается командой: npm run dist
; Параметры передаются из scripts/build-win.js: APP_VERSION, SRC_DIR, OUT_FILE, ICON_FILE
Unicode true
SetCompressor /SOLID lzma
SetCompressorDictSize 64

!define APP_NAME "Мои уроки"
!define APP_EXE "MoiUroki.exe"
!define APP_DIR "MoiUroki"
!define REG_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MoiUroki"

Name "${APP_NAME}"
OutFile "${OUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\${APP_DIR}"
InstallDirRegKey HKCU "Software\MoiUroki" "InstallDir"
RequestExecutionLevel user
BrandingText "${APP_NAME} ${APP_VERSION}"

VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey /LANG=1049 "ProductName" "${APP_NAME}"
VIAddVersionKey /LANG=1049 "FileDescription" "Установка программы «${APP_NAME}»"
VIAddVersionKey /LANG=1049 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1049 "ProductVersion" "${APP_VERSION}"

!include "MUI2.nsh"
!include "FileFunc.nsh"

!define MUI_ICON "${ICON_FILE}"
!define MUI_UNICON "${ICON_FILE}"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Установка «${APP_NAME}»"
!define MUI_WELCOMEPAGE_TEXT "Программа для репетитора: расписание, записи уроков и учёт заработка.$\r$\n$\r$\nВаши данные хранятся только на этом компьютере. Установка займёт меньше минуты."
!define MUI_FINISHPAGE_TITLE "Готово!"
!define MUI_FINISHPAGE_TEXT "«${APP_NAME}» установлена. Ярлык появился на рабочем столе и в меню «Пуск»."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Запустить «${APP_NAME}»"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Russian"

Function .onInit
  ; закрываем запущенную программу, чтобы можно было обновить файлы
  nsExec::Exec 'taskkill /F /IM "${APP_EXE}"'
  Pop $0
FunctionEnd

Section "Install"
  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\resources"
  File /r "${SRC_DIR}\*.*"
  WriteUninstaller "$INSTDIR\Удалить.exe"

  CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Удалить ${APP_NAME}.lnk" "$INSTDIR\Удалить.exe"

  WriteRegStr HKCU "Software\MoiUroki" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${REG_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${REG_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${REG_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegStr HKCU "${REG_KEY}" "Publisher" "${APP_NAME}"
  WriteRegStr HKCU "${REG_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${REG_KEY}" "UninstallString" '"$INSTDIR\Удалить.exe"'
  WriteRegDWORD HKCU "${REG_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${REG_KEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${REG_KEY}" "EstimatedSize" "$0"
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM "${APP_EXE}"'
  Pop $0
  Delete "$DESKTOP\${APP_NAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APP_NAME}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${REG_KEY}"
  DeleteRegKey HKCU "Software\MoiUroki"
  ; данные учеников (папка в AppData и копии в «Документах») намеренно не удаляются
  MessageBox MB_OK|MB_ICONINFORMATION "Программа удалена.$\r$\nВаши данные и резервные копии сохранены: их можно будет подхватить при повторной установке."
SectionEnd
