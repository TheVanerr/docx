' DocumentX - masaustu baslatici. Klasordeki "DocumentX" simgesi bu dosyayi calistirir.
' codes\index.html dosyasini Edge (yoksa Chrome) ile ayri bir uygulama penceresinde acar.
' Kurulum, Node veya npm gerekmez. Ilk acilista DocumentX klasorunu (bu klasor) bir kez secersiniz.
Option Explicit

Dim shell, fso, rootDir, indexPath, url, browser, candidates, c
Dim appDir, profileDir, spoolDir, markerPath

' Klasorleri ust klasorleriyle birlikte olusturur.
Sub EnsureFolder(path)
  If fso.FolderExists(path) Then Exit Sub
  EnsureFolder fso.GetParentFolderName(path)
  fso.CreateFolder path
End Sub

' JSON metni: ters bolu, tirnak ve ASCII disi karakterler kacirilir (dosya ASCII yazilir).
Function JsonText(s)
  Dim i, code, ch, out
  out = ""
  For i = 1 To Len(s)
    ch = Mid(s, i, 1)
    code = AscW(ch) And &HFFFF&
    If ch = "\" Or ch = """" Then
      out = out & "\" & ch
    ElseIf code < 32 Or code > 126 Then
      out = out & "\u" & Right("000" & Hex(code), 4)
    Else
      out = out & ch
    End If
  Next
  JsonText = out
End Function

' Bu profilde PDF yazicisi her zaman "PDF olarak kaydet" olur ve cikti cikti klasorune duser.
' Toplu ciktida birden cok dosya art arda iner; tarayici "birden cok dosya" diye engellemesin.
' Tarayici Preferences dosyasina klasor izinlerini de yazar; bu yuzden yalniz ilk acilista,
' DocumentX klasoru tasindiginda veya ayarlar degistiginde (surum eki) yazilir. Bu ayar olmadan
' --kiosk-printing varsayilan (fiziksel) yaziciya basar.
Sub EnsureBrowserProfile()
  Dim q, appState, prefs, stored, f, marker
  EnsureFolder fso.BuildPath(profileDir, "Default")
  EnsureFolder spoolDir
  marker = rootDir & "|3"
  stored = ""
  If fso.FileExists(markerPath) Then
    Set f = fso.OpenTextFile(markerPath, 1, False, -1)
    If Not f.AtEndOfStream Then stored = f.ReadAll
    f.Close
  End If
  If stored = marker And fso.FileExists(fso.BuildPath(profileDir, "Default\Preferences")) Then Exit Sub

  q = """"
  appState = "{""version"":2,""recentDestinations"":[{""id"":""Save as PDF"",""origin"":""local"",""account"":""""}]," & _
    """selectedDestinationId"":""Save as PDF"",""isHeaderFooterEnabled"":false,""isCssBackgroundEnabled"":true," & _
    """marginsType"":1,""scaling"":""100"",""scalingType"":0}"
  prefs = "{""printing"":{""print_preview_sticky_settings"":{""appState"":" & q & JsonText(appState) & q & "}}," & _
    """savefile"":{""default_directory"":" & q & JsonText(spoolDir) & q & ",""prompt_for_download"":false}," & _
    """download"":{""prompt_for_download"":false}," & _
    """profile"":{""default_content_setting_values"":{""automatic_downloads"":1}}}"
  Set f = fso.CreateTextFile(fso.BuildPath(profileDir, "Default\Preferences"), True, False)
  f.Write prefs
  f.Close
  Set f = fso.CreateTextFile(markerPath, True, True)
  f.Write marker
  f.Close
End Sub

' Klasordeki "DocumentX" simgesi (kisayol): bu baslaticiyi calistirir. Klasor tasininca veya
' baska bilgisayarda ilk acilista yeniden yazilir (kisayol tam yol tutar).
Sub EnsureShortcut()
  Dim lnk, target, args, icon
  On Error Resume Next
  target = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\wscript.exe"
  args = """" & WScript.ScriptFullName & """"
  icon = fso.BuildPath(rootDir, "codes\icon\documentx.ico") & ",0"
  Set lnk = shell.CreateShortcut(fso.BuildPath(rootDir, "DocumentX.lnk"))
  If LCase(lnk.TargetPath) = LCase(target) And lnk.Arguments = args And LCase(lnk.IconLocation) = LCase(icon) Then Exit Sub
  lnk.TargetPath = target
  lnk.Arguments = args
  lnk.WorkingDirectory = rootDir
  lnk.IconLocation = icon
  lnk.Description = "DocumentX - kullanim kilavuzu uygulamasi"
  lnk.Save
End Sub

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

rootDir = fso.GetParentFolderName(WScript.ScriptFullName)
indexPath = fso.BuildPath(fso.BuildPath(rootDir, "codes"), "index.html")

If Not fso.FileExists(indexPath) Then
  MsgBox "DocumentX bulunamadi (codes\index.html):" & vbCrLf & indexPath, vbCritical, "DocumentX"
  WScript.Quit 1
End If

url = "file:///" & Replace(Replace(indexPath, "\", "/"), " ", "%20")
EnsureShortcut

candidates = Array( _
  shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe", _
  shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\Microsoft\Edge\Application\msedge.exe", _
  shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\Google\Chrome\Application\chrome.exe", _
  shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Google\Chrome\Application\chrome.exe", _
  shell.ExpandEnvironmentStrings("%LocalAppData%") & "\Google\Chrome\Application\chrome.exe")

browser = ""
For Each c In candidates
  If browser = "" And fso.FileExists(c) Then browser = c
Next

If browser <> "" Then
  ' Kiosk baski ayri profilde calisir; kullanicinin normal tarayicisini etkilemez.
  appDir = fso.BuildPath(shell.ExpandEnvironmentStrings("%LocalAppData%"), "DocumentX")
  profileDir = fso.BuildPath(appDir, "BrowserProfile")
  markerPath = fso.BuildPath(appDir, "workspace-root.txt")
  spoolDir = fso.BuildPath(fso.BuildPath(rootDir, "exports"), ".pdf-spool")
  EnsureBrowserProfile
  shell.Run """" & browser & """ --user-data-dir=""" & profileDir & """ --no-first-run --no-default-browser-check --kiosk-printing --app=""" & url & "?dxprint=direct""", 1, False
Else
  ' Edge / Chrome yoksa varsayilan tarayici (klasore yazmak icin Chromium tabanli tarayici gerekir)
  shell.Run """" & url & """", 1, False
End If
