/**
 * 打 Windows 安装包（单文件 setup.exe，带图形安装界面）。
 *
 * 做法：用系统自带 csc 把发布包 app.zip 作为嵌入资源，编一个 WinForms 安装向导，
 * 不依赖 NSIS / electron-builder / 网络。
 *
 * 输入：dist/release/洛栈-<版本>-win64.zip
 * 输出：dist/installer/LoRA-Vault-<版本>-setup.exe
 *
 * 界面：安装位置输入框 + 「浏览…」文件夹选择 + 安装进度 + 完成自动启动
 * 安装：写快捷方式、HKCU 卸载项；数据仍在 %APPDATA%\LoRA 库\data
 *
 * 自测（不弹界面，不碰真实安装）：
 *   $env:LORA_SETUP_TEST='1'; .\<setup>.exe [/D=自定义目录]
 *   只解到指定目录或 %TEMP%\LoraSetupTest，不杀进程、不建快捷方式、不写注册表、不启动。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8').replace(/^\uFEFF/, '')).version || '1.0.0';
const stage = path.join(root, 'dist', 'installer', 'stage');
const outDir = path.join(root, 'dist', 'installer');
const zipSrc = path.join(root, 'dist', 'release', `洛栈-${APP_VERSION}-win64.zip`);
const setupExe = path.join(outDir, `LoRA-Vault-${APP_VERSION}-setup.exe`);
const icon = path.join(root, 'desktop', 'assets', 'icon.ico');
const fw = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319');
const csc = path.join(fw, 'csc.exe');

if (!fs.existsSync(zipSrc)) {
  console.error('缺发布包：' + zipSrc);
  console.error('先跑 node desktop/build/release-public.mjs');
  process.exit(1);
}
if (!fs.existsSync(csc)) {
  console.error('缺 csc.exe：' + csc);
  process.exit(1);
}

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

console.log('1/3 放 app.zip…');
fs.copyFileSync(zipSrc, path.join(stage, 'app.zip'));

console.log('2/3 写安装器源码…');
const cs = String.raw`
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

static class Core
{
    public static string LogPath = Path.Combine(Path.GetTempPath(), "lora-install.log");
    public static bool TestMode;
    public static bool Silent;
    public static string ExplicitDir = "";

    public static void Log(string s)
    {
        try { File.AppendAllText(LogPath, DateTime.Now.ToString("HH:mm:ss") + " " + s + Environment.NewLine); } catch { }
    }

    public static string DefaultDir()
    {
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "LoraLibrary");
    }

    public static void Install(string dest, Action<string> status)
    {
        Log("洛栈 LoRA-Vault ${APP_VERSION} 安装程序" + (TestMode ? "（自测）" : Silent ? "（静默 /S）" : ""));
        Log("目标目录：" + dest);
        if (status != null) status("关闭正在运行的洛栈…");
        if (!TestMode) KillProcesses(dest);

        string tmp = Path.Combine(Path.GetTempPath(), "lora-setup-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tmp);
        string zip = Path.Combine(tmp, "app.zip");
        if (status != null) status("解出安装包…");
        using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("app.zip"))
        using (FileStream fs = new FileStream(zip, FileMode.Create))
        {
            if (s == null) throw new Exception("安装包里的 app.zip 丢了");
            s.CopyTo(fs);
        }

        string unpack = Path.Combine(tmp, "x");
        if (status != null) status("解压程序文件…");
        ZipFile.ExtractToDirectory(zip, unpack);
        string inner = Path.Combine(unpack, "LoraLibrary");
        if (!File.Exists(Path.Combine(inner, "LoraLibrary.exe"))) inner = unpack;
        if (!File.Exists(Path.Combine(inner, "LoraLibrary.exe"))) throw new Exception("压缩包里没找到 LoraLibrary.exe");

        if (status != null) status("写入安装目录…");
        if (Directory.Exists(dest))
        {
            bool removed = false;
            for (int i = 0; i < 3 && !removed; i++)
            {
                try { Directory.Delete(dest, true); removed = true; }
                catch { Thread.Sleep(700); }
            }
            if (!removed)
            {
                string old = dest + ".old-" + DateTime.Now.ToString("yyyyMMddHHmmss");
                try { Directory.Move(dest, old); removed = true; Log("旧目录删不掉，挪到 " + old); }
                catch (Exception ex) { Log("旧目录挪不动：" + ex.Message); throw new Exception("旧安装目录删不掉也挪不动，有进程占着：" + dest); }
            }
        }
        Directory.CreateDirectory(Path.GetDirectoryName(dest));
        Directory.Move(inner, dest);
        string exe = Path.Combine(dest, "LoraLibrary.exe");
        Log("已安装到：" + dest);

        if (!TestMode)
        {
            if (status != null) status("创建快捷方式…");
            CreateShortcut(exe, dest);
            if (status != null) status("注册卸载项…");
            RegisterUninstall(dest, exe);
            WriteUninstaller(dest);
        }

        try { Directory.Delete(tmp, true); } catch { }

        if (TestMode)
        {
            Log("自测完成。");
            return;
        }

        if (status != null) status("启动洛栈…");
        Process.Start(exe);
    }

    static void KillProcesses(string dest)
    {
        try
        {
            /* 不能带 /T：自动更新时安装器是从 app 里 spawn 出来的，/T 会把自己这条进程树一起杀掉 */
            ProcessStartInfo psi = new ProcessStartInfo("taskkill", "/F /IM LoraLibrary.exe");
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            Process tk = Process.Start(psi);
            if (tk != null) tk.WaitForExit(8000);
        }
        catch { }
        try
        {
            foreach (Process p in Process.GetProcessesByName("node"))
            {
                try
                {
                    if (p.MainModule.FileName.StartsWith(dest, StringComparison.OrdinalIgnoreCase))
                    {
                        p.Kill();
                        p.WaitForExit(3000);
                    }
                }
                catch { }
            }
        }
        catch { }
        /* 给文件句柄一点时间松手，紧接着就要删目录了 */
        Thread.Sleep(600);
    }

    static void CreateShortcut(string exe, string dest)
    {
        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType == null) return;
        object shell = Activator.CreateInstance(shellType);
        string[] links = new string[] {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "洛栈.lnk"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "洛栈.lnk")
        };
        // 用 exe 自带的图标：icon.ico 是 PNG 压缩的，部分机器上做快捷方式图标会显示成白纸
        string iconPath = exe;
        foreach (string link in links)
        {
            try
            {
                object sc = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { link });
                Type t = sc.GetType();
                t.InvokeMember("TargetPath", BindingFlags.SetProperty, null, sc, new object[] { exe });
                t.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, sc, new object[] { dest });
                if (File.Exists(iconPath)) t.InvokeMember("IconLocation", BindingFlags.SetProperty, null, sc, new object[] { iconPath + ",0" });
                t.InvokeMember("Description", BindingFlags.SetProperty, null, sc, new object[] { "洛栈 LoRA-Vault — 本地 LoRA 管理器" });
                t.InvokeMember("Save", BindingFlags.InvokeMethod, null, sc, null);
            }
            catch { }
        }
        /* 开发版：同一个 exe 带 --dev，数据另开一份、开 CDP 9222、标题带「开发」 */
        string[] devLinks = new string[] {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "洛栈（开发）.lnk")
        };
        foreach (string link in devLinks)
        {
            try
            {
                object sc = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { link });
                Type t = sc.GetType();
                t.InvokeMember("TargetPath", BindingFlags.SetProperty, null, sc, new object[] { exe });
                t.InvokeMember("Arguments", BindingFlags.SetProperty, null, sc, new object[] { "--dev" });
                t.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, sc, new object[] { dest });
                if (File.Exists(iconPath)) t.InvokeMember("IconLocation", BindingFlags.SetProperty, null, sc, new object[] { iconPath + ",0" });
                t.InvokeMember("Description", BindingFlags.SetProperty, null, sc, new object[] { "洛栈 开发版 — 独立数据 + 调试端口 9222" });
                t.InvokeMember("Save", BindingFlags.InvokeMethod, null, sc, null);
            }
            catch { }
        }
    }

    static void RegisterUninstall(string dest, string exe)
    {
        using (RegistryKey k = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\LoRA-Library"))
        {
            if (k == null) return;
            k.SetValue("DisplayName", "洛栈 LoRA-Vault");
            k.SetValue("DisplayVersion", "${APP_VERSION}");
            k.SetValue("Publisher", "local");
            k.SetValue("InstallLocation", dest);
            k.SetValue("DisplayIcon", exe);
            k.SetValue("UninstallString", "\"" + Path.Combine(dest, "uninstall.cmd") + "\"");
            k.SetValue("NoModify", 1, RegistryValueKind.DWord);
            k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        }
    }

    static void WriteUninstaller(string dest)
    {
        string helper = Path.Combine(Path.GetTempPath(), "lora-uninstall-helper.cmd");
        string h = "@echo off\r\n";
        h += "ping 127.0.0.1 -n 3 >nul\r\n";
        h += "rmdir /s /q \"" + dest + "\"\r\n";
        h += "del \"%~f0\"\r\n";
        File.WriteAllText(helper, h, Encoding.Default);

        string cmd = "@echo off\r\n";
        cmd += "taskkill /IM LoraLibrary.exe /F >nul 2>&1\r\n";
        cmd += "del \"%USERPROFILE%\\Desktop\\洛栈.lnk\" >nul 2>&1\r\n";
        cmd += "del \"%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\洛栈.lnk\" >nul 2>&1\r\n";
        cmd += "del \"%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\洛栈（开发）.lnk\" >nul 2>&1\r\n";
        cmd += "reg delete \"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\LoRA-Library\" /f >nul 2>&1\r\n";
        cmd += "choice /M \"Also delete data (records / config / previews)?\"\r\n";
        cmd += "if errorlevel 2 goto keep\r\n";
        cmd += "rmdir /s /q \"%APPDATA%\\LoRA 库\"\r\n";
        cmd += ":keep\r\n";
        cmd += "start \"\" /min \"" + helper + "\"\r\n";
        File.WriteAllText(Path.Combine(dest, "uninstall.cmd"), cmd, Encoding.Default);
    }
}

class InstallForm : Form
{
    TextBox dirBox;
    Button browseBtn;
    Button installBtn;
    Button cancelBtn;
    ProgressBar bar;
    Label status;

    public InstallForm()
    {
        Text = "洛栈 LoRA-Vault ${APP_VERSION} 安装";
        ClientSize = new Size(580, 270);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ShowIcon = false;

        Label head = new Label();
        head.Text = "选择安装位置";
        head.Font = new Font("Microsoft YaHei", 11F, FontStyle.Bold);
        head.SetBounds(20, 18, 300, 26);
        Controls.Add(head);

        Label hint = new Label();
        hint.Text = "程序装到这里；洛栈数据仍保存在 %APPDATA%\\LoRA 库\\data。";
        hint.ForeColor = Color.Gray;
        hint.SetBounds(20, 46, 540, 20);
        Controls.Add(hint);

        dirBox = new TextBox();
        dirBox.Text = Core.ExplicitDir.Length > 0 ? Core.ExplicitDir : Core.DefaultDir();
        dirBox.SetBounds(20, 78, 430, 26);
        Controls.Add(dirBox);

        browseBtn = new Button();
        browseBtn.Text = "浏览…";
        browseBtn.SetBounds(458, 76, 102, 30);
        browseBtn.Click += OnBrowse;
        Controls.Add(browseBtn);

        status = new Label();
        status.Text = "准备就绪";
        status.SetBounds(20, 120, 540, 24);
        Controls.Add(status);

        bar = new ProgressBar();
        bar.Style = ProgressBarStyle.Marquee;
        bar.MarqueeAnimationSpeed = 30;
        bar.SetBounds(20, 148, 540, 16);
        bar.Visible = false;
        Controls.Add(bar);

        installBtn = new Button();
        installBtn.Text = "安装";
        installBtn.SetBounds(360, 205, 92, 32);
        installBtn.Click += OnInstall;
        Controls.Add(installBtn);

        cancelBtn = new Button();
        cancelBtn.Text = "取消";
        cancelBtn.SetBounds(466, 205, 92, 32);
        cancelBtn.Click += delegate { Close(); };
        Controls.Add(cancelBtn);

        AcceptButton = installBtn;
        CancelButton = cancelBtn;
    }

    void OnBrowse(object sender, EventArgs e)
    {
        using (FolderBrowserDialog f = new FolderBrowserDialog())
        {
            f.Description = "选择安装位置（会在这个文件夹里建 LoraLibrary 子目录）";
            f.ShowNewFolderButton = true;
            if (Directory.Exists(dirBox.Text)) f.SelectedPath = dirBox.Text;
            else
            {
                try
                {
                    string parent = Path.GetDirectoryName(dirBox.Text.Trim());
                    if (parent != null && Directory.Exists(parent)) f.SelectedPath = parent;
                }
                catch { }
            }
            if (f.ShowDialog(this) == DialogResult.OK) dirBox.Text = Path.Combine(f.SelectedPath, "LoraLibrary");
        }
    }

    void SetStatus(string s)
    {
        if (InvokeRequired) { BeginInvoke(new Action<string>(SetStatus), s); return; }
        status.Text = s;
    }

    void OnInstall(object sender, EventArgs e)
    {
        string dest = dirBox.Text.Trim().Trim('"');
        if (dest.Length == 0)
        {
            MessageBox.Show(this, "先选一个安装位置", "洛栈 LoRA-Vault", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        try { dest = Path.GetFullPath(dest); }
        catch (Exception ex)
        {
            MessageBox.Show(this, "路径不对：" + ex.Message, "洛栈 LoRA-Vault", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        installBtn.Enabled = false;
        browseBtn.Enabled = false;
        dirBox.Enabled = false;
        cancelBtn.Enabled = false;
        bar.Visible = true;
        ThreadPool.QueueUserWorkItem(delegate
        {
            try
            {
                Core.Install(dest, SetStatus);
                SetStatus("安装完成，正在启动…");
                Thread.Sleep(1200);
                BeginInvoke(new Action(delegate { Close(); }));
            }
            catch (Exception ex)
            {
                Core.Log("失败：" + ex.Message);
                BeginInvoke(new Action(delegate
                {
                    bar.Visible = false;
                    installBtn.Enabled = true;
                    browseBtn.Enabled = true;
                    dirBox.Enabled = true;
                    cancelBtn.Enabled = true;
                    SetStatus("安装失败");
                    MessageBox.Show(this, ex.Message, "安装失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }));
            }
        });
    }
}

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        Core.TestMode = Environment.GetEnvironmentVariable("LORA_SETUP_TEST") == "1";
        foreach (string a in args)
        {
            if (a.StartsWith("/D=", StringComparison.OrdinalIgnoreCase)) Core.ExplicitDir = a.Substring(3).Trim().Trim('"');
            if (a.Equals("/S", StringComparison.OrdinalIgnoreCase) || a.Equals("/SILENT", StringComparison.OrdinalIgnoreCase) || a.Equals("--silent", StringComparison.OrdinalIgnoreCase)) Core.Silent = true;
        }
        if (Environment.GetEnvironmentVariable("LORA_SETUP_SILENT") == "1") Core.Silent = true;
        string envDir = Environment.GetEnvironmentVariable("LORA_SETUP_DIR");
        if (!string.IsNullOrWhiteSpace(envDir)) Core.ExplicitDir = envDir.Trim();

        /* 别待在安装目录里干活：自己是那个目录里的进程的话，目录整棵删不掉（自动更新就是从 app 里起的） */
        try { Directory.SetCurrentDirectory(Path.GetTempPath()); } catch { }

        if (Core.TestMode)
        {
            string dest = Core.ExplicitDir.Length > 0 ? Path.GetFullPath(Core.ExplicitDir) : Path.Combine(Path.GetTempPath(), "LoraSetupTest");
            try { Core.Install(dest, null); Environment.Exit(0); }
            catch { Environment.Exit(1); }
        }

        /* 自动更新走这里：setup.exe /S /D=<安装目录>，不弹界面，装完自己重启程序 */
        if (Core.Silent)
        {
            string dest = Core.ExplicitDir.Length > 0 ? Path.GetFullPath(Core.ExplicitDir) : Core.DefaultDir();
            try { Core.Install(dest, null); Environment.Exit(0); }
            catch (Exception ex) { Core.Log("静默安装失败：" + ex.Message); Environment.Exit(1); }
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new InstallForm());
    }
}
`;
fs.writeFileSync(path.join(stage, 'Setup.cs'), '\uFEFF' + cs.replace(/\r?\n/g, '\r\n'), 'utf8');

console.log('3/3 编译（嵌 184MB 资源，要一会儿）…');
const args = [
  '/nologo',
  '/codepage:65001',
  '/target:winexe',
  '/out:' + setupExe,
  '/win32icon:' + icon,
  '/resource:' + path.join(stage, 'app.zip') + ',app.zip',
  '/r:' + path.join(fw, 'System.IO.Compression.FileSystem.dll'),
  '/r:' + path.join(fw, 'System.IO.Compression.dll'),
  '/r:' + path.join(fw, 'System.Windows.Forms.dll'),
  '/r:' + path.join(fw, 'System.Drawing.dll'),
  path.join(stage, 'Setup.cs'),
];
try {
  execFileSync(csc, args, { stdio: 'inherit', cwd: stage, timeout: 30 * 60 * 1000 });
} catch (e) {
  console.error('编译失败：' + e.message);
  process.exit(1);
}
if (!fs.existsSync(setupExe)) {
  console.error('没生成 setup.exe');
  process.exit(1);
}
const mb = (fs.statSync(setupExe).size / 1048576).toFixed(1);
console.log('完成：' + setupExe + ' (' + mb + ' MB)');

const pfx = process.env.LORA_SIGN_PFX || '';
if (pfx) {
  const signTool = process.env.LORA_SIGNTOOL || 'signtool.exe';
  const pwd = process.env.LORA_SIGN_PASSWORD || '';
  const ts = process.env.LORA_SIGN_TIMESTAMP || 'http://timestamp.digicert.com';
  const signArgs = ['sign', '/fd', 'SHA256', '/f', pfx];
  if (pwd) signArgs.push('/p', pwd);
  signArgs.push('/tr', ts, '/td', 'SHA256', setupExe);
  try { execFileSync(signTool, signArgs, { stdio: 'inherit' }); console.log('已签名'); }
  catch (e) { console.error('签名失败：' + e.message); process.exitCode = 1; }
} else {
  console.log('未配 LORA_SIGN_PFX，安装包未签名（SmartScreen 可能提示）');
}
