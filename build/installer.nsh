; Desinstalación completa de LawChest
; (no se ejecuta durante las actualizaciones automáticas)
!macro customUnInstall
  ${ifNot} ${isUpdated}
    ; Ajustes, copia de trabajo local y caché de actualizaciones
    RMDir /r "$APPDATA\LawChest"
    RMDir /r "$LOCALAPPDATA\lawchest-updater"

    ; Si se desinstala desde LawChest, la decisión sobre los datos ya se tomó allí
    ${GetParameters} $R0
    ClearErrors
    ${GetOptions} $R0 "--from-app" $R1
    ${If} ${Errors}
      ${If} ${FileExists} "$DOCUMENTS\LawChest\*.*"
        MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "¿Quieres borrar también tus datos de LawChest (clientes, archivos y cuentas)?$\r$\n$\r$\n$DOCUMENTS\LawChest$\r$\n$\r$\nSi eliges «No», se conservan y podrás volver a usarlos si reinstalas LawChest.$\r$\n$\r$\nLos datos guardados en OneDrive, Google Drive o Dropbox no se borran desde aquí." /SD IDNO IDNO lawchest_keep_data
          RMDir /r "$DOCUMENTS\LawChest"
        lawchest_keep_data:
      ${EndIf}
    ${EndIf}
  ${endIf}
!macroend
