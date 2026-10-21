@echo off
setlocal
REM ===================================================================
REM  Interativa Player - instalacao e configuracao completa via ADB
REM
REM  Uso:   instalar-tv.bat 192.168.0.209 [--gerenciado]
REM         (IP da box; ela precisa estar com "Depuracao USB/ADB" ativa)
REM
REM  --gerenciado: torna o app "proprietario do dispositivo" (device owner),
REM  o que permite ATUALIZAR SOZINHO SEM CONFIRMACAO. So funciona em box sem
REM  conta Google configurada (de preferencia logo apos resetar). Para desfazer:
REM  menu do app -> "Sair do modo gerenciado".
REM
REM  Faz de uma vez o que o assistente "Configurar esta TV" pede:
REM   - instala/atualiza o app
REM   - permite desligar a tela no horario (administrador do dispositivo)
REM   - permite abrir sozinho (Android 10+)
REM   - tira o app da economia de energia
REM   - liga o HDMI-CEC (TV liga/desliga junto com a box)
REM ===================================================================

if "%~1"=="" (
  echo Uso: %~nx0 IP_DA_BOX   ^(ex.: %~nx0 192.168.0.209^)
  exit /b 1
)

set "ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
if not exist "%ADB%" set "ADB=adb"
set "DEV=%~1:5555"
set "PKG=com.interativa.player"
set "MANAGED="
set "APK="
REM Usa o .apk mais novo gerado pelo build (interativa-player-X.Y.Z-N.apk)
for /f "delims=" %%F in ('dir /b /o-d "%~dp0app\build\outputs\apk\release\interativa-player-*.apk" 2^>nul') do if not defined APK set "APK=%~dp0app\build\outputs\apk\release\%%F"
if /i "%~2"=="--gerenciado" (set "MANAGED=1") else if not "%~2"=="" set "APK=%~2"
if /i "%~3"=="--gerenciado" set "MANAGED=1"
if not defined APK (
  echo ERRO: nenhum .apk encontrado. Gere o app ^(gradlew assembleRelease^) ou informe o caminho do .apk.
  exit /b 1
)
echo == Arquivo: %APK%

echo.
echo == Conectando em %DEV% ...
"%ADB%" connect %DEV%
"%ADB%" -s %DEV% get-state >nul 2>&1 || (
  echo ERRO: nao foi possivel conectar. Confira o IP e se a depuracao ADB esta ativa na box.
  echo Na primeira conexao, aceite "Permitir depuracao" na tela da TV e rode de novo.
  exit /b 1
)

echo == Instalando o app ...
"%ADB%" -s %DEV% install -r "%APK%" || ( echo ERRO na instalacao. & exit /b 1 )

echo == Permissoes ...
if defined MANAGED (
  echo    Ativando modo gerenciado ^(atualizacao silenciosa^) ...
  "%ADB%" -s %DEV% shell dpm set-device-owner %PKG%/.power.AdminReceiver || (
    echo    AVISO: nao foi possivel ativar o modo gerenciado. A box provavelmente tem uma
    echo    conta Google configurada. O app vai pedir confirmacao a cada atualizacao.
  )
)
"%ADB%" -s %DEV% shell dpm set-active-admin %PKG%/.power.AdminReceiver
"%ADB%" -s %DEV% shell appops set %PKG% REQUEST_INSTALL_PACKAGES allow
"%ADB%" -s %DEV% shell appops set %PKG% SYSTEM_ALERT_WINDOW allow
"%ADB%" -s %DEV% shell dumpsys deviceidle whitelist +%PKG%

echo == HDMI-CEC ...
"%ADB%" -s %DEV% shell settings put global hdmi_control_enabled 1
"%ADB%" -s %DEV% shell settings put global hdmi_control_auto_device_off_enabled 1
"%ADB%" -s %DEV% shell settings put global hdmi_control_auto_wakeup_enabled 1

echo == Abrindo o app ...
"%ADB%" -s %DEV% shell am start -n %PKG%/.MainActivity

echo.
echo Pronto! Agora, na TV, informe o servidor e o codigo da empresa e pareie pelo painel.
echo (Avisos de "Unknown command" em algum passo sao normais em versoes antigas do Android.)
endlocal
