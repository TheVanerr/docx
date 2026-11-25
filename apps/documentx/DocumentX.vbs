' DocumentX - masaustu baslatici. Klasordeki "DocumentX" simgesi bu dosyayi calistirir.
' codes\index.html dosyasini Edge (yoksa Chrome) ile ayri bir uygulama penceresinde acar.
' Kurulum, Node veya npm gerekmez. Ilk acilista DocumentX veri klasorunu (icinde projects\ olan) bir kez secersiniz.
'
' Program ve veri ayri durabilir (DOCX deposu): program bu klasorden (codes\), kilavuzlar veri klasorunden acilir.
' Veri klasoru: bu klasorde projects\ varsa bu klasor (eski tek klasor duzeni); yoksa veri-klasoru.txt dosyasindaki
' yol; o da yoksa bir kez sorulur ve veri-klasoru.txt'ye yazilir (git'e girmez). PDF'ler veri klasorundeki
' exports\.pdf-spool klasorune basilir. Deneme: cscript //nologo DocumentX.vbs /kuru (hicbir sey acmaz, yazmaz).
Option Explicit

Dim shell, fso, rootDir, dataDir, indexPath, url, browser, candidates, c, dryRun
Dim appDir, profileDir, spoolDir, markerPath, configPath, kokParam, appUrl, plainUrl

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

' Adres parametresi: harf, rakam ve - _ . ~ disindaki her karakter UTF-8 olarak %XX yazilir.
Function UrlEncode(s)
  Dim i, ch, code, out
  out = ""
  For i = 1 To Len(s)
    ch = Mid(s, i, 1)
    code = AscW(ch) And &HFFFF&
    If (code >= 48 And code <= 57) Or (code >= 65 And code <= 90) Or (code >= 97 And code <= 122) Or ch = "-" Or ch = "_" Or ch = "." Or ch = "~" Then
      out = out & ch
    ElseIf code < 128 Then
      out = out & "%" & Right("0" & Hex(code), 2)
    ElseIf code < 2048 Then
      out = out & "%" & Hex(192 + (code \ 64)) & "%" & Hex(128 + (code And 63))
    Else
      out = out & "%" & Hex(224 + (code \ 4096)) & "%" & Hex(128 + ((code \ 64) And 63)) & "%" & Hex(128 + (code And 63))
    End If
  Next
  UrlEncode = out
End Function

' Metin dosyasinin ilk satiri. Kodlama dosyanin basindan anlasilir: UTF-16 (FF FE; baslatici boyle yazar),
' yoksa UTF-8 (BOM'lu ya da BOM'suz; Not Defteri ile elle yazilmis olabilir). Turkce harfli yollar da okunur.
Function FirstLine(path)
  Dim st, head, cs, s, i
  FirstLine = ""
  On Error Resume Next
  Set st = CreateObject("ADODB.Stream")
  st.Type = 1
  st.Open
  st.LoadFromFile path
  head = st.Read(2)
  st.Close
  cs = "utf-8"
  If LenB(head) = 2 Then
    If AscB(MidB(head, 1, 1)) = 255 And AscB(MidB(head, 2, 1)) = 254 Then cs = "unicode"
  End If
  Set st = CreateObject("ADODB.Stream")
  st.Type = 2
  st.Charset = cs
  st.Open
  st.LoadFromFile path
  s = st.ReadText(-1)
  st.Close
  If Err.Number <> 0 Then Exit Function
  On Error GoTo 0
  s = Replace(s, ChrW(65279), "")
  i = InStr(s, vbLf)
  If i > 0 Then s = Left(s, i - 1)
  s = Trim(Replace(Replace(s, vbCr, ""), vbTab, ""))
  If Len(s) > 1 And Right(s, 1) = "\" Then s = Left(s, Len(s) - 1)
  FirstLine = s
End Function

Function IsDataFolder(path)
  IsDataFolder = (path <> "") And fso.FolderExists(fso.BuildPath(path, "projects"))
End Function

' Veri klasoru: projects\ klasoru olan DocumentX klasoru.
Function ResolveDataDir()
  Dim p, picked, f
  ResolveDataDir = ""
  If IsDataFolder(rootDir) Then
    ResolveDataDir = rootDir
    Exit Function
  End If
  If fso.FileExists(configPath) Then
    p = FirstLine(configPath)
    If IsDataFolder(p) Then
      ResolveDataDir = p
      Exit Function
    End If
  End If
  If dryRun Then Exit Function
  Set picked = CreateObject("Shell.Application").BrowseForFolder(0, _
    "DocumentX veri klasorunu secin (icinde projects klasoru olan DocumentX klasoru).", 0)
  If picked Is Nothing Then Exit Function
  p = picked.Self.Path
  If Not IsDataFolder(p) Then
    MsgBox "Secilen klasorde projects klasoru yok:" & vbCrLf & p & vbCrLf & vbCrLf & _
      "Kilavuzlarin bulundugu DocumentX klasorunu secin.", vbExclamation, "DocumentX"
    Exit Function
  End If
  Set f = fso.CreateTextFile(configPath, True, True)
  f.WriteLine p
  f.Close
  ResolveDataDir = p
End Function

' Bu profilde PDF yazicisi her zaman "PDF olarak kaydet" olur ve cikti cikti klasorune duser.
' Toplu ciktida birden cok dosya art arda iner; tarayici "birden cok dosya" diye engellemesin.
' Tarayici Preferences dosyasina klasor izinlerini de yazar; bu yuzden yalniz ilk acilista,
' DocumentX veri klasoru tasindiginda veya ayarlar degistiginde (surum eki) yazilir. Bu ayar olmadan
' --kiosk-printing varsayilan (fiziksel) yaziciya basar.
Sub EnsureBrowserProfile()
  Dim q, appState, prefs, stored, f, marker
  EnsureFolder fso.BuildPath(profileDir, "Default")
  EnsureFolder spoolDir
  marker = dataDir & "|3"
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
dryRun = False
If WScript.Arguments.Count > 0 Then dryRun = (LCase(WScript.Arguments(0)) = "/kuru")

rootDir = fso.GetParentFolderName(WScript.ScriptFullName)
configPath = fso.BuildPath(rootDir, "veri-klasoru.txt")
indexPath = fso.BuildPath(fso.BuildPath(rootDir, "codes"), "index.html")

If Not fso.FileExists(indexPath) Then
  MsgBox "DocumentX bulunamadi (codes\index.html):" & vbCrLf & indexPath, vbCritical, "DocumentX"
  WScript.Quit 1
End If

dataDir = ResolveDataDir()
If dataDir = "" Then
  If dryRun Then
    WScript.Echo "veri klasoru bulunamadi: " & configPath
    WScript.Quit 2
  End If
  MsgBox "DocumentX veri klasoru secilmedi. Kilavuzlarin bulundugu DocumentX klasorunu (icinde projects olan) secin.", vbExclamation, "DocumentX"
  WScript.Quit 1
End If

url = "file:///" & Replace(Replace(indexPath, "\", "/"), " ", "%20")
' Program ve veri ayri klasorlerdeyse baglanma ekrani secilecek veri klasorunu gostersin
kokParam = ""
If LCase(dataDir) <> LCase(rootDir) Then kokParam = "kok=" & UrlEncode(dataDir)

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

appDir = fso.BuildPath(shell.ExpandEnvironmentStrings("%LocalAppData%"), "DocumentX")
profileDir = fso.BuildPath(appDir, "BrowserProfile")
markerPath = fso.BuildPath(appDir, "workspace-root.txt")
spoolDir = fso.BuildPath(fso.BuildPath(dataDir, "exports"), ".pdf-spool")

' Kiosk baskili pencere: dogrudan PDF (?dxprint=direct). Varsayilan tarayicida dogrudan PDF yoktur.
appUrl = url & "?dxprint=direct"
If kokParam <> "" Then appUrl = appUrl & "&" & kokParam
plainUrl = url
If kokParam <> "" Then plainUrl = plainUrl & "?" & kokParam

If dryRun Then
  WScript.Echo "program:  " & rootDir
  WScript.Echo "veri:     " & dataDir
  WScript.Echo "pdf:      " & spoolDir
  WScript.Echo "tarayici: " & browser
  WScript.Echo "adres:    " & appUrl
  WScript.Echo "yedek:    " & plainUrl
  WScript.Quit 0
End If

EnsureShortcut

If browser <> "" Then
  ' Kiosk baski ayri profilde calisir; kullanicinin normal tarayicisini etkilemez.
  EnsureBrowserProfile
  shell.Run """" & browser & """ --user-data-dir=""" & profileDir & """ --no-first-run --no-default-browser-check --kiosk-printing --app=""" & appUrl & """", 1, False
Else
  ' Edge / Chrome yoksa varsayilan tarayici (klasore yazmak icin Chromium tabanli tarayici gerekir)
  shell.Run """" & plainUrl & """", 1, False
End If
